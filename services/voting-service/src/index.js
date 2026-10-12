require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { appendVote } = require('./ledger');
const adminRouter = require('./admin');

const app = express();
app.use(helmet());
app.use(express.json());

// Health check sits ABOVE the rate limiter so the gateway's frequent status
// checks never eat into the request budget.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'voting-service' }));

// Admin dashboard traffic also passes through this limiter, so the ceiling
// is higher than a voters-only service would need.
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start.');
  process.exit(1);
}

app.use('/admin', adminRouter(pool));

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

    // Per-election duplicate-vote guard — locks any existing row for this
    // (user, election) pair so two simultaneous requests can't both pass.
    const existingVote = await client.query(
      'SELECT 1 FROM user_votes WHERE user_id = $1 AND election_id = $2 FOR UPDATE',
      [req.user.sub, election.id]
    );
    if (existingVote.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'this account has already voted in this election' });
    }

    const receipt = await appendVote(client, candidateId);

    await client.query(
      'INSERT INTO user_votes (user_id, election_id, receipt_id) VALUES ($1, $2, $3)',
      [req.user.sub, election.id, receipt.receipt_id]
    );

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
    if (err.code === '23505') {
      return res.status(409).json({ error: 'this account has already voted in this election' });
    }
    console.error(err);
    res.status(500).json({ error: 'failed to record vote' });
  } finally {
    client.release();
  }
});

// Voting history for the signed-in user.
app.get('/my-votes', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT uv.election_id, uv.receipt_id, uv.cast_at,
              e.name AS election_name,
              c.id AS candidate_id, c.name AS candidate_name, c.photo_url, c.symbol
       FROM user_votes uv
       JOIN elections e ON e.id = uv.election_id
       JOIN vote_ledger vl ON vl.receipt_id = uv.receipt_id
       JOIN candidates c ON c.id = vl.candidate_id
       WHERE uv.user_id = $1
       ORDER BY uv.cast_at DESC`,
      [req.user.sub]
    );
    res.json({ votes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load voting history' });
  }
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`[voting-service] listening on ${PORT}`));