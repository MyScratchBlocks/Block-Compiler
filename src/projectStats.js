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

const viewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => `${req.params.id}_view_${req.ip}`,
  message: { error: 'View limit reached for today' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/api/projects/:id/:action', (req, res, next) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  if (action === 'love' || action === 'favourite') {
    const ip = req.ip;
    const map = oneTimeActions[action];
    if (!map.has(id)) map.set(id, new Set());
    if (map.get(id).has(ip)) return res.status(429).json({ error: `You have already ${action}d this project` });

    map.get(id).add(ip);
    return next();
  }

  return res.status(400).json({ error: 'Invalid action' });
}, (req, res) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    const zip = new AdmZip(filePath);
    const dataJson = JSON.parse(zip.readAsText('data.json'));
    const statKey = action === 'love' ? 'loves' : 'favorites';
    dataJson.stats[statKey] = (dataJson.stats[statKey] || 0) + 1;

    zip.updateFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(filePath);

    res.json({ message: `${statKey} incremented`, stats: dataJson.stats });
  } catch (err) {
    console.error('Stat update error:', err.message);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

router.post('/api/projects/:id/view', viewLimiter, (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    const dataJson = JSON.parse(zip.readAsText('data.json'));
    dataJson.stats.views = (dataJson.stats.views || 0) + 1;

    zip.updateFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(filePath);

    res.json({ message: 'views incremented', stats: dataJson.stats });
  } catch (err) {
    console.error('View count error:', err.message);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;
