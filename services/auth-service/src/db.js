const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Applies schema.sql on startup. Safe to run repeatedly — every statement is
// idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
async function initSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;'); // for gen_random_uuid()
  await pool.query(schema);
  console.log('[auth-service] schema ready');
}

module.exports = { pool, initSchema };
