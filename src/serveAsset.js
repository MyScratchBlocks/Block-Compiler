const express = require('express');
const pool = require('./db');
const router = express.Router();

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

async function serveAssetFromDb(req, res) {
  const md5ext = req.params.md5ext;

  if (md5ext.includes('..') || md5ext.includes('/') || md5ext.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    const result = await pool.query(
      'SELECT data, mime_type FROM assets WHERE md5ext = $1',
      [md5ext]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const { data, mime_type } = result.rows[0];
    const contentType = mime_type || getMimeType(md5ext);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${md5ext}"`);
    res.send(data);
  } catch (err) {
    console.error('DB asset retrieval error:', err);
    res.status(500).json({ error: 'Failed to retrieve asset from DB' });
  }
}

router.get('/assets/internalapi/asset/:md5ext', serveAssetFromDb);
router.get('/assets/internalapi/asset/:md5ext/get', serveAssetFromDb);

module.exports = router;
