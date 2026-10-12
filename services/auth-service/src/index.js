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
// Health check sits ABOVE the rate limiter so the gateway's frequent status
// checks never eat into the login budget.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

// Basic brute-force guard — the API Gateway does the heavier rate limiting
// for the whole system; this is defense-in-depth.
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

// Verifies a normal session JWT. Used to protect the MFA enrollment and
// profile endpoints.
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

// Password rules enforced on the server so they can't be bypassed by
// skipping the signup form's client-side checks.
function isPasswordStrong(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

const PASSWORD_RULE_MESSAGE =
  'password must be at least 8 characters and include an uppercase letter and a number';



// --- Registration ---------------------------------------------------------
app.post('/register', async (req, res) => {
  const { fullName, email, password } = req.body;
  if (!fullName || !fullName.trim() || !email || !password) {
    return res.status(400).json({ error: 'full name, email and password are required' });
  }
  if (!isPasswordStrong(password)) {
    return res.status(400).json({ error: PASSWORD_RULE_MESSAGE });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, full_name, email, created_at`,
      [fullName.trim(), email.toLowerCase().trim(), passwordHash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'an account with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'registration failed' });
  }
});

// --- MFA enrollment: step 1 — generate a secret and QR code ----------------
app.post('/mfa/setup', requireAuth, async (req, res) => {
  const secret = speakeasy.generateSecret({ name: `Ballotique (${req.user.email})` });
  await pool.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [
    secret.base32,
    req.user.sub,
  ]);
  const qrDataUrl = await qrcode.toDataURL(secret.otpauth_url);
  res.json({ qrCode: qrDataUrl, manualEntryKey: secret.base32 });
});

// --- MFA enrollment: step 2 — confirm the code, then turn MFA on -----------
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
  if (!verified) {
    return res.status(401).json({ error: 'invalid code — check your authenticator app and try again' });
  }

  await pool.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [req.user.sub]);
  res.json({ message: 'MFA enabled' });
});

// --- Login (with account lockout) ------------------------------------------
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

  // Block login attempts entirely while locked, regardless of whether the
  // password given this time is correct.
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
    // Password is correct but an MFA code is still required — issue a
    // short-lived "pre-auth" token that only /mfa/verify accepts.
    const preAuthToken = jwt.sign({ sub: user.id, stage: 'pre-mfa' }, JWT_SECRET, {
      expiresIn: '5m',
    });
    return res.json({ mfaRequired: true, preAuthToken });
  }

  // isAdmin is always false on a no-MFA login — admin rights are only ever
  // granted in the token issued by /mfa/verify below, so admin access
  // structurally requires MFA every time.
  const token = jwt.sign({ sub: user.id, email: user.email, isAdmin: false }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  res.json({ mfaRequired: false, token });
});

// --- Login: step 2 (verify the authenticator code) --------------------------
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
    window: 1,
  });
  if (!verified) return res.status(401).json({ error: 'invalid MFA code' });

  // This is the ONLY place isAdmin can be true in an issued token — i.e.
  // only ever right after a successful MFA check.
  const token = jwt.sign({ sub: user.id, email: user.email, isAdmin: user.is_admin }, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  res.json({ token });
});

// --- One-time bootstrap: promote an existing account to admin ---------------
// Protected by the shared ADMIN_API_KEY, used only for this. Every admin
// action after promotion uses that admin's own login + MFA.
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

// --- Token verification endpoint, used by other services --------------------
app.post('/verify-token', (req, res) => {
  const { token } = req.body;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, payload });
  } catch {
    res.status(401).json({ valid: false });
  }
});

// --- Profile ------------------------------------------------------------------
app.get('/me', requireAuth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, full_name, email, mfa_enabled, created_at FROM users WHERE id = $1',
    [req.user.sub]
  );
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'user not found' });
  res.json(user);
});

app.patch('/me', requireAuth, async (req, res) => {
  const { fullName, email, currentPassword, newPassword } = req.body;

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.sub]);
  const user = result.rows[0];
  if (!user) return res.status(404).json({ error: 'user not found' });

  const newEmail = email ? email.toLowerCase().trim() : null;
  const emailChanged = Boolean(newEmail) && newEmail !== user.email;

  // Changing email or password requires proving you still know the current
  // password, so a stolen session token alone can't lock the owner out.
  // Changing just your display name doesn't need it.
  if (emailChanged || newPassword) {
    if (!currentPassword) {
      return res.status(400).json({ error: 'current password is required to change email or password' });
    }
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'current password is incorrect' });
  }

  const updates = [];
  const values = [];
  let i = 1;

  if (fullName && fullName.trim() && fullName.trim() !== user.full_name) {
    updates.push(`full_name = $${i++}`);
    values.push(fullName.trim());
  }
  if (emailChanged) {
    updates.push(`email = $${i++}`);
    values.push(newEmail);
  }
  if (newPassword) {
    if (!isPasswordStrong(newPassword)) {
      return res.status(400).json({ error: `new ${PASSWORD_RULE_MESSAGE}` });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    updates.push(`password_hash = $${i++}`);
    values.push(newHash);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'nothing to update' });
  }

  values.push(req.user.sub);
  try {
    const updated = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, full_name, email, mfa_enabled, created_at`,
      values
    );
    res.json(updated.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'that email is already in use' });
    }
    console.error(err);
    res.status(500).json({ error: 'failed to update profile' });
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