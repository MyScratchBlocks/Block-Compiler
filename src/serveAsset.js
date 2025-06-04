const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const LOCAL_ASSET_PATH = path.join(__dirname, '..', 'local_storage/assets');

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    png: 'image/png',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    json: 'application/json'
  };
  return types[ext] || 'application/octet-stream';
}

router.get('/assets/internalapi/asset/:md5ext', (req, res) => {
  const assetPath = path.join(LOCAL_ASSET_PATH, req.params.md5ext);
  if (!fs.existsSync(assetPath)) return res.status(404).json({ error: 'Asset not found' });

  res.setHeader('Content-Type', getMimeType(req.params.md5ext));
  fs.createReadStream(assetPath).pipe(res);
});

module.exports = router;
