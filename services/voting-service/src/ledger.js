const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const GENESIS_HASH = '0'.repeat(64); // hash of an empty/nonexistent previous row

function computeHash({ previousHash, candidateId, castAt }) {
  return crypto
    .createHash('sha256')
    .update(`${previousHash}|${candidateId}|${castAt}`)
    .digest('hex');
}

/**
 * Appends one vote to the hash-chained ledger. Takes an already-open,
 * already-in-transaction `client` (not a pool) so the caller can include
 * this insert plus its own row locks (e.g. the voter's has_voted check) in
 * a single atomic transaction — see voting-service/src/index.js. Also locks
 * the last ledger row so two concurrent votes can't read the same
 * "previous hash" and silently fork the chain.
 */
async function appendVote(client, candidateId) {
  const lastRow = await client.query(
    'SELECT current_hash FROM vote_ledger ORDER BY ledger_position DESC LIMIT 1 FOR UPDATE'
  );
  const previousHash = lastRow.rows[0]?.current_hash ?? GENESIS_HASH;

  const castAt = new Date().toISOString();
  const currentHash = computeHash({ previousHash, candidateId, castAt });
  const receiptId = `CV-${uuidv4().slice(0, 8).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;

  const inserted = await client.query(
    `INSERT INTO vote_ledger (receipt_id, candidate_id, previous_hash, current_hash, cast_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ledger_position, receipt_id, current_hash, cast_at`,
    [receiptId, candidateId, previousHash, currentHash, castAt]
  );

  return inserted.rows[0];
}

/**
 * Walks the whole chain and re-derives each hash to confirm nothing was
 * altered. Used by tally-service for the "ledger integrity" indicator shown
 * in the UI design. O(n) — fine at this scale; a production system would
 * checkpoint periodically instead of re-walking from genesis every time.
 */
async function verifyChain(pool) {
  const { rows } = await pool.query(
    'SELECT ledger_position, candidate_id, previous_hash, current_hash, cast_at FROM vote_ledger ORDER BY ledger_position ASC'
  );

  let expectedPrevious = GENESIS_HASH;
  for (const row of rows) {
    if (row.previous_hash !== expectedPrevious) {
      return { intact: false, brokenAt: row.ledger_position };
    }
    const recomputed = computeHash({
      previousHash: row.previous_hash,
      candidateId: row.candidate_id,
      castAt: row.cast_at.toISOString(),
    });
    if (recomputed !== row.current_hash) {
      return { intact: false, brokenAt: row.ledger_position };
    }
    expectedPrevious = row.current_hash;
  }
  return { intact: true, totalVotes: rows.length };
}

module.exports = { appendVote, verifyChain, GENESIS_HASH };
