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

function serveAssetAsDownload(req, res) {
  const filename = req.params.md5ext;

  if (filename.includes('..') || path.isAbsolute(filename)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const assetPath = path.join(LOCAL_ASSET_PATH, filename);
  if (!fs.existsSync(assetPath)) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  res.setHeader('Content-Type', getMimeType(filename));
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stream = fs.createReadStream(assetPath);
  stream.on('error', err => {
    console.error('Stream error:', err.message);
    res.status(500).end();
  });

  stream.pipe(res);
}

// Both endpoints serve as downloads
router.get('/assets/internalapi/asset/:md5ext', serveAssetAsDownload);
router.get('/assets/internalapi/asset/:md5ext/get', serveAssetAsDownload);

module.exports = router;
