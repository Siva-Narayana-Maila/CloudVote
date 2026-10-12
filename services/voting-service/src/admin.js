const express = require('express');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const router = express.Router();

// Verifies a normal session JWT and requires its isAdmin claim. auth-service
// only sets isAdmin: true in a token issued right after a successful MFA
// check, so admin access structurally requires MFA every time.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload.isAdmin) {
      return res.status(403).json({ error: 'this account does not have admin access' });
    }
    req.admin = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

// Records who did what. A failure to write the log must never block the
// admin action itself, so errors are logged and swallowed.
async function audit(pool, admin, action, targetType, targetId, details) {
  try {
    await pool.query(
      `INSERT INTO admin_audit_log (admin_id, admin_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        admin.sub,
        admin.email,
        action,
        targetType,
        targetId ? String(targetId) : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error('[admin] failed to write audit log:', err.message);
  }
}

module.exports = function adminRouter(pool) {
  router.use(requireAdmin);

  // Recent admin activity, newest first.
  router.get('/audit-log', async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    try {
      const { rows } = await pool.query(
        `SELECT id, admin_email, action, target_type, target_id, details, created_at
         FROM admin_audit_log
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
        [limit]
      );
      res.json({ entries: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to load activity log' });
    }
  });

  // List all elections, for the admin portal's picker.
  router.get('/elections', async (_req, res) => {
    const { rows } = await pool.query(
      'SELECT id, name, opens_at, closes_at, is_active FROM elections ORDER BY created_at DESC'
    );
    res.json({ elections: rows });
  });

  // Single election + its candidates + live vote counts.
  router.get('/elections/:id', async (req, res) => {
    const electionRow = await pool.query(
      'SELECT id, name, opens_at, closes_at, is_active FROM elections WHERE id = $1',
      [req.params.id]
    );
    const election = electionRow.rows[0];
    if (!election) return res.status(404).json({ error: 'election not found' });

    const candidatesRow = await pool.query(
      `SELECT c.id, c.name, c.role, c.bio, c.color, c.photo_url, c.symbol,
              COUNT(vl.receipt_id)::int AS votes
       FROM candidates c
       LEFT JOIN vote_ledger vl ON vl.candidate_id = c.id
       WHERE c.election_id = $1
       GROUP BY c.id
       ORDER BY c.name`,
      [election.id]
    );

    res.json({ ...election, candidates: candidatesRow.rows });
  });

  // Creates a new election and makes it the only active one.
  router.post('/elections', async (req, res) => {
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
      const created = inserted.rows[0];
      await audit(pool, req.admin, 'election.create', 'election', created.id, { name: created.name, closesAt });
      res.status(201).json(created);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'failed to create election' });
    } finally {
      client.release();
    }
  });

  // Modify an election's name / closing time / active status.
  router.patch('/elections/:id', async (req, res) => {
    const { name, closesAt, isActive } = req.body;
    const updates = [];
    const values = [];
    const changes = {};
    let i = 1;
    if (name) { updates.push(`name = $${i++}`); values.push(name); changes.name = name; }
    if (closesAt) { updates.push(`closes_at = $${i++}`); values.push(closesAt); changes.closesAt = closesAt; }
    if (typeof isActive === 'boolean') { updates.push(`is_active = $${i++}`); values.push(isActive); changes.isActive = isActive; }
    if (updates.length === 0) return res.status(400).json({ error: 'nothing to update' });

    values.push(req.params.id);
    try {
      // Making this election active deactivates every other one, so there's
      // still only ever one active election at a time.
      if (typeof isActive === 'boolean' && isActive) {
        await pool.query('UPDATE elections SET is_active = false WHERE id != $1', [req.params.id]);
      }
      const updated = await pool.query(
        `UPDATE elections SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, opens_at, closes_at, is_active`,
        values
      );
      if (updated.rows.length === 0) return res.status(404).json({ error: 'election not found' });
      await audit(pool, req.admin, 'election.update', 'election', req.params.id, {
        name: updated.rows[0].name,
        changes,
      });
      res.json(updated.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'failed to update election' });
    }
  });

  // Deletes an election — blocked if any votes have already been cast for
  // it, to avoid destroying part of the audit trail.
  router.delete('/elections/:id', async (req, res) => {
    const existing = await pool.query('SELECT name FROM elections WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'election not found' });
    const electionName = existing.rows[0].name;

    const voteCheck = await pool.query(
      `SELECT COUNT(*)::int AS n FROM vote_ledger vl
       JOIN candidates c ON c.id = vl.candidate_id
       WHERE c.election_id = $1`,
      [req.params.id]
    );
    if (voteCheck.rows[0].n > 0) {
      return res.status(409).json({ error: 'cannot delete an election that already has votes cast — deactivate it instead' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM candidates WHERE election_id = $1', [req.params.id]);
      await client.query('DELETE FROM elections WHERE id = $1', [req.params.id]);
      await client.query('COMMIT');
      await audit(pool, req.admin, 'election.delete', 'election', req.params.id, { name: electionName });
      res.json({ deleted: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      res.status(500).json({ error: 'failed to delete election' });
    } finally {
      client.release();
    }
  });

  // Adds a candidate to an election.
  router.post('/candidates', async (req, res) => {
    const { id, electionId, name, role, bio, color, photoUrl, symbol } = req.body;
    if (!id || !electionId || !name) {
      return res.status(400).json({ error: 'id, electionId, and name are required' });
    }
    try {
      const inserted = await pool.query(
        `INSERT INTO candidates (id, election_id, name, role, bio, color, photo_url, symbol)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, name, role, bio, color, photo_url, symbol`,
        [id, electionId, name, role || null, bio || null, color || null, photoUrl || null, symbol || null]
      );
      await audit(pool, req.admin, 'candidate.add', 'candidate', id, { name, electionId });
      res.status(201).json(inserted.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'a candidate with this id already exists' });
      }
      console.error(err);
      res.status(500).json({ error: 'failed to add candidate' });
    }
  });

  // Removes a candidate — blocked if they already have votes.
  router.delete('/candidates/:id', async (req, res) => {
    const existing = await pool.query('SELECT name FROM candidates WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'candidate not found' });
    const candidateName = existing.rows[0].name;

    const voteCheck = await pool.query(
      'SELECT COUNT(*)::int AS n FROM vote_ledger WHERE candidate_id = $1',
      [req.params.id]
    );
    if (voteCheck.rows[0].n > 0) {
      return res.status(409).json({ error: 'cannot remove a candidate who already has votes cast' });
    }
    await pool.query('DELETE FROM candidates WHERE id = $1', [req.params.id]);
    await audit(pool, req.admin, 'candidate.remove', 'candidate', req.params.id, { name: candidateName });
    res.json({ deleted: true });
  });

  // Excel report: a summary sheet plus one row per candidate.
  router.get('/elections/:id/report.xlsx', async (req, res) => {
    const electionRow = await pool.query(
      'SELECT id, name, opens_at, closes_at FROM elections WHERE id = $1',
      [req.params.id]
    );
    const election = electionRow.rows[0];
    if (!election) return res.status(404).json({ error: 'election not found' });

    const candidatesRow = await pool.query(
      `SELECT c.name, c.role, COUNT(vl.receipt_id)::int AS votes
       FROM candidates c
       LEFT JOIN vote_ledger vl ON vl.candidate_id = c.id
       WHERE c.election_id = $1
       GROUP BY c.id
       ORDER BY votes DESC`,
      [election.id]
    );
    const totalVotes = candidatesRow.rows.reduce((sum, c) => sum + c.votes, 0);
    const eligibleRow = await pool.query('SELECT COUNT(*)::int AS n FROM users');
    const eligibleVoters = eligibleRow.rows[0].n;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Ballotique';
    workbook.created = new Date();

    const summary = workbook.addWorksheet('Summary');
    summary.columns = [
      { header: 'Field', key: 'field', width: 28 },
      { header: 'Value', key: 'value', width: 40 },
    ];
    summary.addRows([
      { field: 'Election', value: election.name },
      { field: 'Opens at', value: election.opens_at.toISOString() },
      { field: 'Closes at', value: election.closes_at.toISOString() },
      { field: 'Total votes cast', value: totalVotes },
      { field: 'Eligible voters', value: eligibleVoters },
      { field: 'Participation', value: eligibleVoters > 0 ? `${((totalVotes / eligibleVoters) * 100).toFixed(1)}%` : '0%' },
      { field: 'Report generated', value: new Date().toISOString() },
    ]);
    summary.getRow(1).font = { bold: true };

    const results = workbook.addWorksheet('Results');
    results.columns = [
      { header: 'Candidate', key: 'name', width: 28 },
      { header: 'Role', key: 'role', width: 24 },
      { header: 'Votes', key: 'votes', width: 12 },
      { header: 'Percentage', key: 'percentage', width: 14 },
    ];
    candidatesRow.rows.forEach((c) => {
      results.addRow({
        name: c.name,
        role: c.role,
        votes: c.votes,
        percentage: totalVotes > 0 ? `${((c.votes / totalVotes) * 100).toFixed(1)}%` : '0%',
      });
    });
    results.getRow(1).font = { bold: true };

    // Logged before streaming, since nothing can be done after res.end().
    await audit(pool, req.admin, 'report.export', 'election', election.id, { name: election.name });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${election.name.replace(/[^a-z0-9]+/gi, '-')}-report.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  });

  return router;
};