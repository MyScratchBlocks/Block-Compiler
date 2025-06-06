const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

const oneTimeActions = {
  love: new Map(),
  favourite: new Map()
};

// View limiter: 1 view per IP per project per 24 hours
const viewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => `${req.params.id}_view_${req.ip}`,
  message: { error: 'View limit reached for today' },
  standardHeaders: true,
  legacyHeaders: false,
});

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

// Handle love/favourite
router.post('/api/projects/:id/:action', (req, res, next) => {
  const { id, action } = req.params;

  if (!validateId(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (action === 'love' || action === 'favourite') {
    const ip = req.ip;
    const map = oneTimeActions[action];
    if (!map.has(id)) map.set(id, new Set());
    if (map.get(id).has(ip)) {
      return res.status(429).json({ error: `You have already ${action}d this project` });
    }

    map.get(id).add(ip);
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

// Handle views
router.post('/api/:id/views', viewLimiter, (req, res) => {
  const { id } = req.params;

  if (!validateId(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const updatedStats = updateStats(filePath, 'views');
    res.json({ message: 'views incremented', stats: updatedStats });
  } catch (err) {
    console.error('View count error:', err.message);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;
