const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const _ = require('lodash');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

// GET route - read metadata
router.get('/api/projects/:id/meta', (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    const data = JSON.parse(entry.getData().toString('utf-8'));
    res.json(data);
  } catch (err) {
    console.error('Metadata read error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// POST route - edit metadata
router.post('/api/projects/:id/meta', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    const data = JSON.parse(entry.getData().toString('utf-8'));

    // Apply updates to the data object
    for (const key in updates) {
      _.set(data, key, updates[key]);
    }

    // Replace data.json in zip
    zip.updateFile('data.json', Buffer.from(JSON.stringify(data)));

    // Save the modified sb3
    zip.writeZip(filePath);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Metadata update error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

module.exports = router;
