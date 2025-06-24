const express = require('express');
const pool = require('./db');  // neon db pool
const router = express.Router();

async function serveAssetFromDb(req, res) {
  const filename = req.params.md5ext;

  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    // Query asset binary and mime_type from DB
    const result = await pool.query(
      'SELECT data, mime_type FROM assets WHERE md5ext = $1',
      [filename]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const { data, mime_type } = result.rows[0];

    res.setHeader('Content-Type', mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send the binary data directly
    res.send(data);

  } catch (err) {
    console.error('DB asset retrieval error:', err);
    res.status(500).json({ error: 'Failed to retrieve asset from DB' });
  }
}

router.get('/assets/internalapi/asset/:md5ext', serveAssetFromDb);
router.get('/assets/internalapi/asset/:md5ext/get', serveAssetFromDb);

module.exports = router;
