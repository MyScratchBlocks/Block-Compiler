const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

router.get('/json/:id', (req, res) => {
  const { id } = req.params;

  // Validate that ID is only digits
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const projectJsonEntry = zip.getEntry('project.json');

    if (!projectJsonEntry) {
      return res.status(404).json({ error: 'project.json not found in archive' });
    }

    const projectJson = JSON.parse(projectJsonEntry.getData().toString('utf-8'));
    res.json(projectJson);
  } catch (err) {
    console.error('project.json read error:', err.stack || err.message);
    res.status(500).json({ error: 'Failed to read project.json' });
  }
});

module.exports = router;
