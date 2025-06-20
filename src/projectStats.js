const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

// Track actions per user per project
const userActions = {
  love: new Map(),        // Map<projectId, Set<username>>
  favourite: new Map(),   // Map<projectId, Set<username>>
  views: new Map(),       // Map<projectId, Map<username, timestamp>>
};

function validateId(id) {
  return /^\d+$/.test(id);
}

function updateStats(filePath, actionKey) {
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry('data.json');
  if (!entry) throw new Error('data.json not found in archive');

  const dataJson = JSON.parse(entry.getData().toString('utf-8'));
  dataJson.stats[actionKey] = (dataJson.stats[actionKey] || 0) + 1;

  zip.deleteFile('data.json');
  zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
  zip.writeZip(filePath);

  return dataJson.stats;
}

// Handle love and favourite
router.post('/api/projects/:id/:action', (req, res, next) => {
  const { id, action } = req.params;
  const username = req.body.user;

  if (!validateId(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (action === 'love' || action === 'favourite') {
    const actionMap = userActions[action];

    if (!actionMap.has(id)) {
      actionMap.set(id, new Set());
    }

    const userSet = actionMap.get(id);
    if (userSet.has(username)) {
      return res.status(429).json({ error: `You have already ${action}d this project` });
    }

    userSet.add(username);
    return next();
  }

  return res.status(400).json({ error: 'Invalid action' });
}, (req, res) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  const statKey = action === 'love' ? 'loves' : 'favorites';

  try {
    const updatedStats = updateStats(filePath, statKey);
    res.json({ message: `${statKey} incremented`, stats: updatedStats });
  } catch (err) {
    console.error(`${action} update error:`, err.message);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// Handle views (1 per user per day per project)
router.post('/api/:id/views', (req, res) => {
  const { id } = req.params;
  const username = req.body.user;

  if (!validateId(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

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

  userViewMap.set(username, now);

  try {
    const updatedStats = updateStats(filePath, 'views');
    res.json({ message: 'views incremented', stats: updatedStats });
  } catch (err) {
    console.error('View count error:', err.message);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;
