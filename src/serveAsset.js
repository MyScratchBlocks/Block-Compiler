const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'local_storage/uploads');

function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const types = {
    png: 'image/png',
    svg: 'image/svg+xml',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    json: 'application/json',
  };
  return types[ext] || 'application/octet-stream';
}

async function serveAssetFromSB3(req, res) {
  const requestedAsset = req.params.md5ext;

  if (requestedAsset.includes('..') || path.isAbsolute(requestedAsset)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    const files = fs.readdirSync(UPLOADS_DIR).filter(file => file.endsWith('.sb3'));

    for (const file of files) {
      const sb3Path = path.join(UPLOADS_DIR, file);
      const zip = new AdmZip(sb3Path);
      const entry = zip.getEntry(requestedAsset);

      if (entry) {
        // Found the asset
        res.setHeader('Content-Type', getMimeType(requestedAsset));
        res.setHeader('Content-Disposition', `attachment; filename="${requestedAsset}"`);
        return res.end(entry.getData());
      }
    }

    // Not found in any .sb3 file
    return res.status(404).json({ error: 'Asset not found in any .sb3 file' });
  } catch (err) {
    console.error('Error accessing SB3 assets:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Both endpoints serve as downloads
router.get('/assets/internalapi/asset/:md5ext', serveAssetFromSB3);
router.get('/assets/internalapi/asset/:md5ext/get', serveAssetFromSB3);

module.exports = router;
