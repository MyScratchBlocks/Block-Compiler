const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

// Ensure the upload directory exists
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) {
  fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });
}

// Helper to set nested object values
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

// ────────────────────────────────────────────────
// GET project metadata
router.get('/api/projects/:id/meta/:username', (req, res) => {
  const { id, username } = req.params;

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

    if (data.visibility === 'unshared') {
      if (username === data.author?.username) {
        res.json(data);
      } else {
        res.status(403).json({ error: 'Unauthorized' });
      }
    } else {
      res.json(data);
    }
  } catch (err) {
    console.error('Metadata read error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// ────────────────────────────────────────────────
// PUT project metadata
router.put('/api/projects/:id/meta', (req, res) => {
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

    let data;
    try {
      data = JSON.parse(entry.getData().toString('utf-8'));
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse existing project metadata' });
    }

    for (const key in updates) {
      setNestedValue(data, key, updates[key]);
    }

    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
    zip.writeZip(filePath);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Metadata update error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

// ────────────────────────────────────────────────
// PUT share project
router.put('/api/share/:id', (req, res) => {
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

    let data;
    try {
      data = JSON.parse(entry.getData().toString('utf-8'));
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse existing project metadata' });
    }

    data.visibility = 'visible';

    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
    zip.writeZip(filePath);

    res.json({ success: true, message: `Project ${id} visibility set to 'visible'` });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Project file not found' });
    }
    console.error('Share project error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to share project' });
  }
});

// ────────────────────────────────────────────────
// POST upload thumbnail and update data.json
router.post('/api/upload/:id', (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.startsWith('image/')) {
    return res.status(400).json({ error: 'Content-Type must be an image type' });
  }

  const ext = contentType.split('/')[1];
  const allowed = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
  if (!allowed.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported image format' });
  }

  const sb3Path = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);
  const imageFilename = `${id}.${ext}`;
  const imagePath = path.join(LOCAL_UPLOAD_PATH, imageFilename);
  const imageUrl = `/images/${imageFilename}`;

  try {
    fs.accessSync(sb3Path, fs.constants.F_OK);

    const writeStream = fs.createWriteStream(imagePath);
    req.pipe(writeStream);

    writeStream.on('error', (err) => {
      console.error('Image save error:', err.stack || err.message);
      return res.status(500).json({ error: 'Failed to save thumbnail' });
    });

    writeStream.on('finish', () => {
      try {
        const zip = new AdmZip(sb3Path);
        const entry = zip.getEntry('data.json');

        if (!entry) {
          return res.status(404).json({ error: 'data.json not found in project file' });
        }

        let data = JSON.parse(entry.getData().toString('utf-8'));
        data.image = imageUrl;

        zip.deleteFile('data.json');
        zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
        zip.writeZip(sb3Path);

        return res.json({
          success: true,
          message: 'Thumbnail uploaded and data.json updated',
          thumbnailUrl: imageUrl
        });
      } catch (err) {
        console.error('ZIP update error:', err.stack || err.message);
        return res.status(500).json({ error: 'Failed to update data.json' });
      }
    });
  } catch (err) {
    console.error('Upload handler error:', err.stack || err.message);
    return res.status(500).json({ error: 'Project file not found or upload failed' });
  }
});

// ────────────────────────────────────────────────
// GET image by ID
router.get('/images/:id', (req, res) => {
  const { id } = req.params;
  const imagePath = path.join(LOCAL_UPLOAD_PATH, `${id}`);
  if (fs.existsSync(imagePath)) {
    return res.sendFile(imagePath);
  }

  return res.status(404).json({ error: 'Image not found' });
});

module.exports = router;
