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
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [
    email.toLowerCase().trim(),
  ]);
  const user = result.rows[0];
  const invalidCreds = () => res.status(401).json({ error: 'invalid email or password' });
  if (!user) return invalidCreds();

  // Account lockout: block login attempts entirely while locked, regardless
  // of whether the password given this time is correct — that's what
  // actually stops a brute-force loop, not just rejecting wrong guesses
  // one at a time.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
    return res.status(423).json({
      error: `too many failed attempts — try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}`,
    });
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= MAX_LOGIN_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60000);
      await pool.query('UPDATE users SET failed_attempts = 0, locked_until = $1 WHERE id = $2', [
        lockedUntil,
        user.id,
      ]);
      return res.status(423).json({
        error: `too many failed attempts — account locked for ${LOCKOUT_MINUTES} minutes`,
      });
    }
    await pool.query('UPDATE users SET failed_attempts = $1 WHERE id = $2', [attempts, user.id]);
    return invalidCreds();
  }

  // Successful password — clear any lockout tracking.
  if (user.failed_attempts > 0 || user.locked_until) {
    await pool.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }

  if (user.mfa_enabled) {
    const preAuthToken = jwt.sign({ sub: user.id, stage: 'pre-mfa' }, JWT_SECRET, {
      expiresIn: '5m',
    });
    return res.json({ mfaRequired: true, preAuthToken });
  }
    const token = jwt.sign({ sub: user.id, email: user.email, isAdmin: false }, JWT_SECRET, {
   
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
  const token = jwt.sign({ sub: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, {
    // This is the ONLY place isAdmin can be true in an issued token — i.e.
    // only ever right after a successful MFA check.
    expiresIn: JWT_EXPIRY,
  });
  res.json({ token });
});

// One-time bootstrap: promotes an existing (already-registered) account to
// admin. Protected by the shared ADMIN_API_KEY, used only for this — every
// admin action after promotion uses that admin's own normal login + MFA,
// never the shared key again. Since isAdmin is only ever granted in a
// post-MFA token (see /mfa/verify above), a promoted account can't actually
// use any admin feature until it has MFA set up (/mfa-setup, same flow
// every user goes through).
app.post('/admin/promote', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'invalid or missing admin key' });
  }
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email is required' });

  const result = await pool.query(
    'UPDATE users SET is_admin = true WHERE email = $1 RETURNING id, email, is_admin, mfa_enabled',
    [email.toLowerCase().trim()]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'no account with that email — register and log in first' });
  }
  res.json({
    message: result.rows[0].mfa_enabled
      ? 'account promoted to admin'
      : 'account promoted to admin — set up MFA (via /mfa-setup) before admin features will work, since admin access is only ever granted right after MFA verification',
    user: result.rows[0],
  });
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
