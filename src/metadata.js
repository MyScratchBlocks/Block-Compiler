const express = require('express');
const router = express.Router();
const pool = require('./db'); // Neon DB pool connection

// Helper: set nested object value using dot notation path (e.g., 'author.username')
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

// GET project metadata JSON from DB by project id and username authorization
router.get('/api/projects/:id/meta/:username', async (req, res) => {
  const id = parseInt(req.params.id);
  const username = req.params.username;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    // Fetch project data JSON from DB
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);

    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;

    // If project is unshared, only author can access
    if (data.visibility === 'unshared') {
      if (username === data.author?.username) {
        return res.json(data);
      } else {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Shared projects: anyone can access
    return res.json(data);
  } catch (err) {
    console.error('Metadata read error:', err);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// PUT update project metadata JSON in DB for given project id
router.put('/api/projects/:id/meta', async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    // Get current data JSON
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);

    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;

    // Apply updates via dot notation keys
    for (const key in updates) {
      setNestedValue(data, key, updates[key]);
    }

    // Save updated data JSON back to DB
    await pool.query('UPDATE projects SET data = $1 WHERE id = $2', [data, id]);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Metadata update error:', err);
    return res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

// PUT to share project (set visibility to visible)
router.put('/api/share/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);

    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;

    // Change visibility
    data.visibility = 'visible';

    // Update DB
    await pool.query('UPDATE projects SET data = $1 WHERE id = $2', [data, id]);

    res.json({ success: true, message: `Project ${id} visibility set to 'visible'` });
  } catch (err) {
    console.error('Share project error:', err);
    return res.status(500).json({ error: 'Failed to share project' });
  }
});

module.exports = router;
