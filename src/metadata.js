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

// Middleware to validate numeric ID
function validateProjectId(req, res, next) {
  if (!/^\d+$/.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }
  next();
}

// ────────────────────────────────────────────────
// GET project metadata
router.get('/api/projects/:id/meta/:username', validateProjectId, (req, res) => {
  const { id, username } = req.params;
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
      if (username === data.author?.username || req.query.Admin === 'True') {
        return res.json(data);
      } else {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    return res.json(data);
  } catch (err) {
    console.error('Metadata read error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// ────────────────────────────────────────────────
// PUT project metadata
router.put('/api/projects/:id/meta', validateProjectId, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
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
router.put('/api/share/:id', validateProjectId, (req, res) => {
  const { id } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    let data = JSON.parse(entry.getData().toString('utf-8'));
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
// PUT unshare project
router.put('/api/unshare/:id', validateProjectId, (req, res) => {
  const { id } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    let data = JSON.parse(entry.getData().toString('utf-8'));
    data.visibility = 'unshared';

    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
    zip.writeZip(filePath);

    res.json({ success: true, message: `Project ${id} visibility set to 'unshared'` });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Project file not found' });
    }
    console.error('Unshare project error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to unshare project' });
  }
});

// ────────────────────────────────────────────────
// POST image upload
router.post('/api/upload/:id', validateProjectId, (req, res) => {
  const { id } = req.params;
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
  const imageFilename = `/images/${id}`;

  if (!fs.existsSync(sb3Path)) {
    return res.status(404).json({ error: 'Project file not found' });
  }

  const chunks = [];
  let totalSize = 0;
  const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

  req.on('data', chunk => {
    totalSize += chunk.length;
    if (totalSize > MAX_IMAGE_SIZE) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (totalSize > MAX_IMAGE_SIZE) {
      return res.status(413).json({ error: 'Image too large' });
    }

    const imageBuffer = Buffer.concat(chunks);
    try {
      const zip = new AdmZip(sb3Path);
      const entry = zip.getEntry('data.json');
      if (!entry) return res.status(404).json({ error: 'data.json not found in project file' });

      const data = JSON.parse(entry.getData().toString('utf-8'));
      data.image = imageFilename;

      zip.deleteFile('data.json');
      zip.deleteFile(imageFilename);
      zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
      zip.addFile(imageFilename, imageBuffer);
      zip.writeZip(sb3Path);

      res.json({
        success: true,
        message: 'Thumbnail uploaded and stored inside .sb3',
        thumbnailUrl: `/images/${id}`
      });
    } catch (err) {
      console.error('ZIP update error:', err);
      res.status(500).json({ error: 'Failed to update .sb3 file' });
    }
  });

  req.on('error', err => {
    console.error('Request error:', err);
    res.status(500).json({ error: 'Upload failed' });
  });
});

// ────────────────────────────────────────────────
// GET image by ID
router.get('/images/:id', validateProjectId, (req, res) => {
  const { id } = req.params;
  const sb3Path = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(sb3Path)) {
    return res.status(404).json({ error: 'Project file not found' });
  }

  try {
    const zip = new AdmZip(sb3Path);
    const entry = zip.getEntry('data.json');
    if (!entry) return res.status(404).json({ error: 'data.json not found' });

    const data = JSON.parse(entry.getData().toString('utf-8'));
    const imageFilename = data.image;
    if (!imageFilename) return res.status(404).json({ error: 'Image not referenced in data.json' });

    const imageEntry = zip.getEntry(imageFilename);
    if (!imageEntry) return res.status(404).json({ error: 'Image not found in project file' });

    const ext = path.extname(imageFilename).substring(1);
    res.setHeader('Content-Type', `image/${ext === 'jpg' ? 'jpeg' : ext}`);
    res.send(imageEntry.getData());
  } catch (err) {
    console.error('Image retrieval error:', err);
    res.status(500).json({ error: 'Failed to extract image' });
  }
});

module.exports = router;
