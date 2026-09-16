const express = require('express');
const router = express.Router();

// Minimal shared-secret admin auth — appropriate for project scope. Set
// ADMIN_API_KEY in the environment; every admin request must send it back
// in the X-Admin-Key header.
function requireAdmin(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'invalid or missing admin key' });
  }
  next();
}

module.exports = function adminRouter(pool) {
  // Creates a new election and makes it the only active one.
  router.post('/elections', requireAdmin, async (req, res) => {
    const { name, closesAt } = req.body;
    if (!name || !closesAt) {
      return res.status(400).json({ error: 'name and closesAt are required' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE elections SET is_active = false WHERE is_active = true');
      const inserted = await client.query(
        `INSERT INTO elections (name, closes_at, is_active) VALUES ($1, $2, true)
         RETURNING id, name, opens_at, closes_at`,
        [name, closesAt]
      );
      await client.query('COMMIT');
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'failed to create election' });
    } finally {
      client.release();
    }
  });

  // Adds a candidate to an election.
  router.post('/candidates', requireAdmin, async (req, res) => {
    const { id, electionId, name, role, bio, color } = req.body;
    if (!id || !electionId || !name) {
      return res.status(400).json({ error: 'id, electionId, and name are required' });
    }
    try {
      const inserted = await pool.query(
        `INSERT INTO candidates (id, election_id, name, role, bio, color)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, role, bio, color`,
        [id, electionId, name, role || null, bio || null, color || null]
      );
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'a candidate with this id already exists' });
      }
      console.error(err);
      res.status(500).json({ error: 'failed to add candidate' });
    }
  });

  return router;
};