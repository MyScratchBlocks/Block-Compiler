const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

router.get('/api/projects/:id/meta', (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');
    if (!entry) return res.status(404).json({ error: 'data.json not found' });
    res.json(JSON.parse(entry.getData().toString()));
  } catch (err) {
    console.error('Metadata error:', err.message);
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

module.exports = router;
