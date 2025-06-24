const express = require('express');
const pool = require('./db'); // Your Neon DB pool
const router = express.Router();

// In-memory user action trackers: Map<projectId, Set<username>> or Map<projectId, Map<username, timestamp>>
const userActions = {
  love: new Map(),
  favourite: new Map(),
  views: new Map(),
};

function validateId(id) {
  return /^\d+$/.test(id);
}

// Helper to increment a stat atomically in JSONB in projects.data->'stats'
async function incrementStat(projectId, statKey) {
  // Get current stats JSON or empty object
  const res = await pool.query(
    `SELECT data FROM projects WHERE id = $1 FOR UPDATE`,
    [projectId]
  );
  if (res.rowCount === 0) {
    throw new Error('Project not found');
  }

  let data = res.rows[0].data || {};
  data.stats = data.stats || {};
  data.stats[statKey] = (data.stats[statKey] || 0) + 1;

  await pool.query(
    `UPDATE projects SET data = $1 WHERE id = $2`,
    [data, projectId]
  );

  return data.stats;
}

// Routes

// Handle love and favourite
router.post('/api/projects/:id/:action/:username', async (req, res) => {
  const { id, action, username } = req.params;

  if (!validateId(id)) return res.status(400).json({ error: 'Invalid project ID format' });
  if (!username) return res.status(400).json({ error: 'Username is required' });
  if (action !== 'love' && action !== 'favourite') return res.status(400).json({ error: 'Invalid action' });

  const actionMap = userActions[action];
  if (!actionMap.has(id)) {
    actionMap.set(id, new Set());
  }
  const userSet = actionMap.get(id);

  if (userSet.has(username)) {
    return res.status(429).json({ error: `You have already ${action}d this project` });
  }

  try {
    const statKey = action === 'love' ? 'loves' : 'favorites';
    const updatedStats = await incrementStat(id, statKey);

    userSet.add(username);
    res.json({ message: `${statKey} incremented`, stats: updatedStats });
  } catch (err) {
    console.error(`${action} update error:`, err.message);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// Handle views (1 per user per day per project)
router.post('/api/:id/views/:username', async (req, res) => {
  const { id, username } = req.params;

  if (!validateId(id)) return res.status(400).json({ error: 'Invalid project ID format' });
  if (!username) return res.status(400).json({ error: 'Username is required' });

  const now = Date.now();
  const viewMap = userActions.views;

  if (!viewMap.has(id)) {
    viewMap.set(id, new Map());
  }
  const userViewMap = viewMap.get(id);

  const lastViewed = userViewMap.get(username);
  if (lastViewed && now - lastViewed < 24 * 60 * 60 * 1000) {
    return res.status(429).json({ message: 'View limit reached for today' });
  }

  try {
    const updatedStats = await incrementStat(id, 'views');

    userViewMap.set(username, now);
    res.json({ message: 'views incremented', stats: updatedStats });
  } catch (err) {
    console.error('View count error:', err.message);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;
