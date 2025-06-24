const express = require('express');
const router = express.Router();
const pool = require('./db'); // Your Neon DB connection pool

// Helper to set nested values by dot notation path
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

// GET project metadata
router.get('/api/projects/:id/meta/:username', async (req, res) => {
  const id = parseInt(req.params.id);
  const username = req.params.username;

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID format' });

  try {
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);

    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;

    if (data.visibility === 'unshared') {
      if (username === data.author?.username) {
        return res.json(data);
      } else {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else {
      return res.json(data);
    }
  } catch (err) {
    console.error('Metadata read error:', err);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// PUT update project metadata
router.put('/api/projects/:id/meta', async (req, res) => {
  const id = parseInt(req.params.id);
  const updates = req.body;

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID format' });

  try {
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);
    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;

    // Apply updates
    for (const key in updates) {
      setNestedValue(data, key, updates[key]);
    }

    await pool.query('UPDATE projects SET data = $1 WHERE id = $2', [data, id]);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Metadata update error:', err);
    return res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

// PUT share project
router.put('/api/share/:id', async (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) return res.status(400).json({ error: 'Invalid project ID format' });

  try {
    const projectRes = await pool.query('SELECT data FROM projects WHERE id = $1', [id]);
    if (projectRes.rowCount === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = projectRes.rows[0].data;
    data.visibility = 'visible';

    await pool.query('UPDATE projects SET data = $1 WHERE id = $2', [data, id]);

    res.json({ success: true, message: `Project ${id} visibility set to 'visible'` });
  } catch (err) {
    console.error('Share project error:', err);
    return res.status(500).json({ error: 'Failed to share project' });
  }
});

module.exports = router;
