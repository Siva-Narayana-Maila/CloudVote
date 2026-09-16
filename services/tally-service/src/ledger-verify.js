const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

function computeHash({ previousHash, candidateId, castAt }) {
  return crypto
    .createHash('sha256')
    .update(`${previousHash}|${candidateId}|${castAt}`)
    .digest('hex');
}

/**
 * Walks the entire ledger and re-derives each hash independently, to power
 * the "Ledger integrity: 100%" indicator in the UI design. Deliberately
 * duplicated from voting-service rather than imported as a shared package —
 * tally-service should be able to verify the chain using nothing but the
 * raw data in the table, the same way an independent auditor would, without
 * trusting voting-service's code at all.
 */
async function verifyChain(pool) {
  const { rows } = await pool.query(
    'SELECT ledger_position, candidate_id, previous_hash, current_hash, cast_at FROM vote_ledger ORDER BY ledger_position ASC'
  );

  let expectedPrevious = GENESIS_HASH;
  for (const row of rows) {
    if (row.previous_hash !== expectedPrevious) {
      return { intact: false, brokenAtPosition: row.ledger_position, totalChecked: rows.length };
    }
    const recomputed = computeHash({
      previousHash: row.previous_hash,
      candidateId: row.candidate_id,
      castAt: row.cast_at.toISOString(),
    });
    if (recomputed !== row.current_hash) {
      return { intact: false, brokenAtPosition: row.ledger_position, totalChecked: rows.length };
    }
    expectedPrevious = row.current_hash;
  }
  return { intact: true, totalVotes: rows.length, lastCheckpoint: rows.at(-1)?.cast_at ?? null };
}

module.exports = { verifyChain };
