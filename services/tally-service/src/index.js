require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { pool } = require('./db');
const { verifyChain } = require('./ledger-verify');

const app = express();
app.use(helmet());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 })); // higher limit: results are polled often

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'tally-service' }));

// Public: current active election + its candidates. Frontend uses this to
// render the ballot and the closing countdown instead of a hardcoded list.
app.get('/election', async (_req, res) => {
  try {
    const electionRow = await pool.query(
      `SELECT id, name, opens_at, closes_at FROM elections WHERE is_active = true ORDER BY created_at DESC LIMIT 1`
    );
    const election = electionRow.rows[0];
    if (!election) return res.status(404).json({ error: 'no active election' });

    const candidatesRow = await pool.query(
      'SELECT id, name, role, bio, color FROM candidates WHERE election_id = $1 ORDER BY name',
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

// Shared by GET /results and the SSE stream below, so both always agree.
async function computeResultsSnapshot() {
  const tally = await pool.query(
    `SELECT candidate_id, COUNT(*)::int AS votes FROM vote_ledger GROUP BY candidate_id`
  );
  const totalVotesRow = await pool.query('SELECT COUNT(*)::int AS total FROM vote_ledger');
  const eligibleRow = await pool.query('SELECT COUNT(*)::int AS total FROM users');
  const candidatesRow = await pool.query(
    `SELECT c.id, c.name, c.role FROM candidates c
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

// Matches the "Live results" screen: per-candidate vote counts, percentages,
// participation rate, total ballots cast.
app.get('/results', async (req, res) => {
  try {
    res.json(await computeResultsSnapshot());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to compute results' });
  }
});

// --- Real-time results via Server-Sent Events -----------------------------
// Polls the database on a short interval and only pushes to connected
// clients when the snapshot actually changes — keeps the Results page live
// without voting-service needing to know tally-service exists at all.
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

// Matches the "Ledger integrity: 100.00%" panel in the UI design.
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

// Public: verify a single receipt independently — no auth required, since
// that's the whole point (anyone can confirm their vote was recorded
// without proving who they are). Deliberately never returns candidate_id —
// confirms inclusion, not choice, matching the receipt screen's own promise.
app.get('/ledger/verify/:receiptId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT ledger_position, candidate_id, previous_hash, current_hash, cast_at FROM vote_ledger WHERE receipt_id = $1',
      [req.params.receiptId]
    );
    const row = rows[0];
    if (!row) {
      return res.status(404).json({ verified: false, reason: 'no ledger entry with this receipt ID' });
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