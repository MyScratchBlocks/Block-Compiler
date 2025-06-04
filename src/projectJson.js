const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

router.get('/json/:id', (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    res.json(JSON.parse(zip.readAsText('project.json')));
  } catch (err) {
    console.error('project.json error:', err.message);
    res.status(500).json({ error: 'Failed to read project.json' });
  }
});

module.exports = router;
