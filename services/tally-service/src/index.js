require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { pool } = require('./db');
const { verifyChain } = require('./ledger-verify');
const { buildArchive } = require('./archive');

const app = express();
app.use(helmet());
app.use(express.json());

// Health routes sit ABOVE the rate limiter so the gateway's frequent status
// checks never eat into the request budget.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'tally-service' }));

// Confirms the database itself is reachable (used by the status page).
app.get('/health/db', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'postgres' });
  } catch (err) {
    console.error('[tally-service] database health check failed:', err.message);
    res.status(503).json({ status: 'down', service: 'postgres' });
  }
});

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// Public: current active election + its candidates.
app.get('/election', async (_req, res) => {
  try {
    const electionRow = await pool.query(
      `SELECT id, name, opens_at, closes_at FROM elections WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const election = electionRow.rows[0];
    if (!election) return res.status(404).json({ error: 'no active election' });

    const candidatesRow = await pool.query(
      'SELECT id, name, role, bio, color, photo_url, symbol FROM candidates WHERE election_id = $1 ORDER BY name',
      [election.id]
    );

    res.json({
      id: election.id,
      name: election.name,
      opensAt: election.opens_at,
      closesAt: election.closes_at,
      isOpen: new Date(election.closes_at) > new Date(),
      candidates: candidatesRow.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load election' });
  }
});

// Public archive: every election whose closing time has passed, with its
// final aggregate results. Never exposes anything about individual voters.
app.get('/archive', async (_req, res) => {
  try {
    const elections = await pool.query(
      `SELECT id, name, opens_at, closes_at FROM elections
       WHERE closes_at <= now()
       ORDER BY closes_at DESC`
    );
    if (elections.rows.length === 0) return res.json({ elections: [] });

    const candidates = await pool.query(
      `SELECT c.election_id, c.id, c.name, c.role, c.color, c.symbol, c.photo_url,
              COUNT(vl.receipt_id)::int AS votes
       FROM candidates c
       LEFT JOIN vote_ledger vl ON vl.candidate_id = c.id
       WHERE c.election_id = ANY($1::uuid[])
       GROUP BY c.id`,
      [elections.rows.map((e) => e.id)]
    );

    res.json({ elections: buildArchive(elections.rows, candidates.rows) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to load archive' });
  }
});

// Shared by GET /results and the SSE stream below, so both always agree.
async function computeResultsSnapshot() {
  const tally = await pool.query(
    `SELECT candidate_id, COUNT(*)::int AS votes FROM vote_ledger GROUP BY candidate_id`
  );
  const totalVotesRow = await pool.query('SELECT COUNT(*)::int AS total FROM vote_ledger');
  const eligibleRow = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  const candidatesRow = await pool.query(
    `SELECT c.id, c.name, c.role, c.color, c.symbol, c.photo_url FROM candidates c
     JOIN elections e ON e.id = c.election_id
     WHERE e.is_active = true`
  );

  const totalVotes = totalVotesRow.rows[0].total;
  const eligibleVoters = eligibleRow.rows[0].total;

  const results = candidatesRow.rows.map((c) => {
    const row = tally.rows.find((r) => r.candidate_id === c.id);
    const votes = row ? row.votes : 0;
    return {
      candidateId: c.id,
      name: c.name,
      role: c.role,
      color: c.color,
      symbol: c.symbol,
      photoUrl: c.photo_url,
      votes,
      percentage: totalVotes > 0 ? Number(((votes / totalVotes) * 100).toFixed(1)) : 0,
    };
  });

  return {
    votesCast: totalVotes,
    eligibleVoters,
    participation: eligibleVoters > 0 ? Number(((totalVotes / eligibleVoters) * 100).toFixed(1)) : 0,
    results,
    updatedAt: new Date().toISOString(),
  };
}

app.get('/results', async (_req, res) => {
  try {
    res.json(await computeResultsSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute results' });
  }
});

// --- Real-time results via Server-Sent Events -----------------------------
const sseClients = new Set();
let lastSnapshot = null;

app.get('/results/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();
  if (lastSnapshot) {
    res.write(`data: ${JSON.stringify(lastSnapshot)}\n\n`);
  }
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

setInterval(async () => {
  try {
    const snapshot = await computeResultsSnapshot();
    if (!lastSnapshot || snapshot.votesCast !== lastSnapshot.votesCast) {
      const payload = `data: ${JSON.stringify(snapshot)}\n\n`;
      for (const client of sseClients) client.write(payload);
    }
    lastSnapshot = snapshot;
  } catch (err) {
    console.error('[tally-service] SSE poll failed:', err);
  }
}, 2000);

app.get('/ledger/integrity', async (_req, res) => {
  try {
    const result = await verifyChain(pool);
    res.json({
      intact: result.intact,
      integrityPercentage: result.intact ? 100.0 : 0.0,
      blocksCommitted: result.totalVotes ?? result.totalChecked ?? 0,
      lastCheckpoint: result.lastCheckpoint ?? null,
      brokenAtPosition: result.brokenAtPosition ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to verify ledger' });
  }
});

// Public: verify a single receipt independently. Deliberately never returns
// candidate_id — confirms inclusion, not choice.
app.get('/ledger/verify/:receiptId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ledger_position, candidate_id, previous_hash, current_hash, cast_at FROM vote_ledger WHERE receipt_id = $1',
      [req.params.receiptId]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({
        verified: false,
        error: 'No ledger entry found with that receipt ID — check it for typos.',
        reason: 'no ledger entry with this receipt ID',
      });
    }
    const recomputed = crypto
      .createHash('sha256')
      .update(`${row.previous_hash}|${row.candidate_id}|${row.cast_at.toISOString()}`)
      .digest('hex');
    const verified = recomputed === row.current_hash;
    res.json({
      verified,
      ledgerPosition: row.ledger_position,
      castAt: row.cast_at,
      reason: verified
        ? 'hash matches — this vote is intact in the ledger'
        : 'hash mismatch — this entry may have been tampered with',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'verification failed' });
  }
});

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => console.log(`[tally-service] listening on ${PORT}`));