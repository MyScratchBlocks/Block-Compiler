const express = require('express');
const router = express.Router();
const pool = require('./db'); // Your Neon DB pool connection

router.get('/json/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    // Query project_json JSONB column from project_jsons table by project_id
    const result = await pool.query('SELECT project_json FROM project_jsons WHERE project_id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Project JSON not found' });
    }

    const projectJson = result.rows[0].project_json;

    res.json(projectJson);
  } catch (err) {
    console.error('project.json read error:', err);
    res.status(500).json({ error: 'Failed to read project.json' });
  }
});

module.exports = router;
