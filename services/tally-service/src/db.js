const { Pool } = require('pg');

// tally-service is read-only against `vote_ledger` and `users` — it never
// writes. Shares the same database as auth-service/voting-service via
// DATABASE_URL (see docs/design-decisions.md for why this is one Postgres
// instance instead of a separate DynamoDB/QLDB store).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = { pool };
