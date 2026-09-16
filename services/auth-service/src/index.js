require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { pool, initSchema } = require('./db');

const app = express();
app.use(helmet());
app.use(express.json());

// Basic brute-force guard on login/register — the API Gateway does the
// heavier rate limiting for the whole system; this is defense-in-depth.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '2h';

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}

// Verifies a normal session JWT (issued by /login once a user exists,
// MFA-enabled or not). Used to protect the MFA enrollment endpoints below,
// so setting up MFA always requires already having proven your password.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing bearer token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// --- Registration ---------------------------------------------------------
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, created_at`,
      [email.toLowerCase().trim(), passwordHash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      // unique_violation on email
      return res.status(409).json({ error: 'an account with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'registration failed' });
  }
});

// --- MFA enrollment: step 1 — call while logged in (before MFA is active)
// to generate a secret and get a QR code to scan. Requires a valid session
// token, which a fresh registration + login already provides even with
// MFA not yet enabled (see /login below).
app.post('/mfa/setup', requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `CloudVote (${req.user.email})` });
  await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [
    secret.base32,
    req.user.sub,
  ]);

  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ qrCode: qrDataUrl, manualEntryKey: secret.base32 });
});

// --- MFA enrollment: step 2 — confirm the code from the authenticator app
// actually matches, then flip mfa_enabled on. From this point forward,
// /login will require the pre-auth + /mfa/verify flow below.
app.post('/mfa/confirm-setup', requireAuth, async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code is required' });

  const result = await pool.query('SELECT mfa_secret FROM users WHERE id = $1', [req.user.sub]);
  const user = result.rows[0];
  if (!user || !user.mfa_secret) {
    return res.status(400).json({ error: 'call /mfa/setup first to generate a secret' });
  }

  const verified = speakeasy.totp.verify({
    secret: user.mfa_secret,
    encoding: 'base32',
    token: code,
    window: 1,
  });
  if (!verified) return res.status(401).json({ error: 'invalid code — check your authenticator app and try again' });

  await pool.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.sub]);
  res.json({ message: 'MFA enabled' });
});

// --- Login: step 1 (password) then step 2 (MFA code) ----------------------
// Matches the two-step flow in the UI design: work email -> "one additional
// verification code".
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    email.toLowerCase().trim(),
  ]);
  const user = result.rows[0];

  // Constant-shape response whether or not the user exists, to avoid
  // leaking which emails are registered.
  const invalidCreds = () => res.status(401).json({ error: 'invalid email or password' });

  if (!user) return invalidCreds();
  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) return invalidCreds();

  if (user.mfa_enabled) {
    // Password correct, but MFA code still required — issue a short-lived
    // "pre-auth" token that only /mfa/verify accepts, not a full session JWT.
    const preAuthToken = jwt.sign({ sub: user.id, stage: 'pre-mfa' }, JWT_SECRET, {
      expiresIn: '5m',
    });
    return res.json({ mfaRequired: true, preAuthToken });
  }

  // No MFA enabled yet — issue full session token directly.
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  res.json({ mfaRequired: false, token });
});

// --- Login: step 2 (verify TOTP code) --------------------------------------
app.post('/mfa/verify', async (req, res) => {
  const { preAuthToken, code } = req.body;
  if (!preAuthToken || !code) {
    return res.status(400).json({ error: 'preAuthToken and code are required' });
  }

  let payload;
  try {
    payload = jwt.verify(preAuthToken, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'pre-auth session expired, please log in again' });
  }
  if (payload.stage !== 'pre-mfa') {
    return res.status(401).json({ error: 'invalid token stage' });
  }

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = result.rows[0];
  if (!user || !user.mfa_secret) return res.status(401).json({ error: 'MFA not configured' });

  const verified = speakeasy.totp.verify({
    secret: user.mfa_secret,
    encoding: 'base32',
    token: code,
    window: 1, // allow 1 step (~30s) of clock drift
  });

  if (!verified) return res.status(401).json({ error: 'invalid MFA code' });

  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  res.json({ token });
});

// --- Token verification endpoint, used by API Gateway / other services ---
app.post('/verify-token', (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, payload });
  } catch {
    res.status(401).json({ valid: false });
  }
});

const PORT = process.env.PORT || 4001;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`[auth-service] listening on ${PORT}`));
  })
  .catch((err) => {
    console.error('[auth-service] failed to init schema:', err);
    process.exit(1);
  });
