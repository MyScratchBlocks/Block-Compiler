const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

router.get('/api/projects/:id/meta', (req, res) => {
  const { id } = req.params;

  // Validate ID: must be a number to prevent path traversal
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK); // Checks if file exists

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

module.exports = router;
