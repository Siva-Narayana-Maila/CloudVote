const { Pool } = require('pg');

// voting-service does NOT run schema.sql — auth-service owns migrations,
// applied once at system startup. voting-service just connects to the same
// database and reads/writes the tables it's responsible for (users.has_voted,
// vote_ledger).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = { pool };
