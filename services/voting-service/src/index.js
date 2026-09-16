require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { pool } = require('./db'); 
const adminRouter = require('./admin');
const { appendVote } = require('./ledger');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}

// The list of valid candidates lives here for now (matches the 3-candidate
// board election in the UI design). Move to a `candidates` table if you
// need this configurable without a redeploy.

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'voting-service' }));
app.use('/admin', adminRouter(pool));

// Verifies the JWT issued by auth-service. Voting-service trusts the same
// JWT_SECRET rather than calling auth-service over the network on every
// vote — fewer network hops, same security guarantee, standard practice
// for services sharing one auth domain.
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
// Loads the currently active election and confirms it's still open.
async function getOpenElection(client) {
  const { rows } = await client.query(
    `SELECT id, closes_at FROM elections WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
  );
  const election = rows[0];
  if (!election) return null;
  if (new Date(election.closes_at) <= new Date()) return null;
  return election;
}
app.post('/vote', requireAuth, async (req, res) => {
  const { candidateId } = req.body;
  if (!candidateId) {
    return res.status(400).json({ error: 'candidateId is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const election = await getOpenElection(client);
    if (!election) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'voting is not currently open' });
    }

    const candidateCheck = await client.query(
      'SELECT id FROM candidates WHERE id = $1 AND election_id = $2',
      [candidateId, election.id]
    );
    if (candidateCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'invalid candidateId for the active election' });
    }

    // Row-lock the voter's own user row so two simultaneous requests with
    // the same token can't both pass the has_voted check. This lock is
    // held for the entire transaction below, including the ledger insert
    // and the has_voted update, so the check-then-act sequence is atomic.
    const userRow = await client.query(
      'SELECT has_voted FROM users WHERE id = $1 FOR UPDATE',
      [req.user.sub]
    );
    if (userRow.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'user not found' });
    }
    if (userRow.rows[0].has_voted) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'this account has already voted' });
    }

    const receipt = await appendVote(client, candidateId);
    await client.query('UPDATE users SET has_voted = true WHERE id = $1', [req.user.sub]);

    await client.query('COMMIT');

    res.status(201).json({
      message: 'vote recorded',
      receiptId: receipt.receipt_id,
      ledgerPosition: receipt.ledger_position,
      commitmentHash: receipt.current_hash,
      castAt: receipt.cast_at,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'failed to record vote' });
  } finally {
    client.release();
  }
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`[voting-service] listening on ${PORT}`));
