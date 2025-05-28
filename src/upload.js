const express = require('express');
const multer = require('multer');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const rateLimit = require('express-rate-limit');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
const LOCAL_ASSET_PATH = path.join(__dirname, '..', 'local_storage/assets');

if (!fs.existsSync(LOCAL_UPLOAD_PATH)) fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });
if (!fs.existsSync(LOCAL_ASSET_PATH)) fs.mkdirSync(LOCAL_ASSET_PATH, { recursive: true });

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

function getNextFileNumber() {
  const files = fs.readdirSync(LOCAL_UPLOAD_PATH)
    .filter(name => name.endsWith('.sb3'))
    .map(name => parseInt(name))
    .filter(n => !isNaN(n));
  return files.length ? Math.max(...files) + 1 : 1;
}

// Rate limiter for "view": 1 per project per IP per day
const viewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 1,
  keyGenerator: (req) => {
    const projectId = req.params.id;
    const ip = req.ip;
    return `${projectId}_view_${ip}`;
  },
  message: { error: 'View limit reached for today' },
  standardHeaders: true,
  legacyHeaders: false,
});

// In-memory stores for "love" and "favourite" - to allow only one increment per project per IP ever
const oneTimeActions = {
  love: new Map(),       // Map of projectId -> Set of IPs that already liked
  favourite: new Map()   // Map of projectId -> Set of IPs that already favourited
};

// POST: Upload project
router.post('/', upload.single('project'), async (req, res) => {
  const username = req.body.username || 'unknown_user';
  const projectName = req.body.projectName || 'Untitled';

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    const fileNum = getNextFileNumber();
    const localFileName = `${fileNum}.sb3`;
    const localFilePath = path.join(LOCAL_UPLOAD_PATH, localFileName);

    const zip = new AdmZip(filePath);
    const projectJson = JSON.parse(zip.readAsText('project.json'));

    const timestamp = Date.now();
    const token = `${timestamp}_${uuidv4().replace(/-/g, '')}`;

    const dataJson = {
      id: fileNum,
      title: projectJson.info?.title || projectName,
      description: projectJson.info?.description || '',
      instructions: projectJson.info?.instructions || '',
      visibility: 'visible',
      public: true,
      comments_allowed: true,
      is_published: true,
      author: {
        id: Math.floor(Math.random() * 1000000000),
        username,
        scratchteam: false,
        history: { joined: '1900-01-01T00:00:00.000Z' },
        profile: {
          id: null,
          images: {
            '90x90': '',
            '60x60': '',
            '55x55': '',
            '50x50': '',
            '32x32': ''
          }
        }
      },
      image: `local_assets/${fileNum}_480x360.png`,
      images: {},
      history: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        shared: new Date().toISOString()
      },
      stats: {
        views: 0,
        loves: 0,
        favorites: 0,
        remixes: 0
      },
      remix: {
        parent: null,
        root: null
      },
      project_token: token
    };

    zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));

    // Extract and save assets
    const assetEntries = zip.getEntries().filter(entry => {
      const ext = path.extname(entry.entryName).toLowerCase();
      return ['.png', '.svg', '.wav', '.mp3'].includes(ext);
    });

    for (const entry of assetEntries) {
      const assetBuffer = entry.getData();
      const assetPath = path.join(LOCAL_ASSET_PATH, entry.entryName);
      const dir = path.dirname(assetPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(assetPath, assetBuffer);
    }

    const modifiedSb3Path = path.join('temp_uploads', `${fileNum}_modified.sb3`);
    zip.writeZip(modifiedSb3Path);

    fs.copyFileSync(modifiedSb3Path, localFilePath);
    fs.unlinkSync(filePath);
    fs.unlinkSync(modifiedSb3Path);

    res.json({
      message: 'Project uploaded successfully',
      sb3File: localFileName,
      projectData: dataJson,
      id: fileNum
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});

// GET: Project metadata (data.json)
router.get('/api/projects/:id/meta', (req, res) => {
  const projectId = req.params.id;
  const localFilePath = path.join(LOCAL_UPLOAD_PATH, `${projectId}.sb3`);

  if (!fs.existsSync(localFilePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const zip = new AdmZip(localFilePath);
  const dataJsonText = zip.readAsText('data.json');

  if (!dataJsonText) {
    return res.status(404).json({ error: 'data.json not found' });
  }

  res.json(JSON.parse(dataJsonText));
});

// GET: project.json
router.get('/json/:id', (req, res) => {
  const projectId = req.params.id;
  const localFilePath = path.join(LOCAL_UPLOAD_PATH, `${projectId}.sb3`);

  if (!fs.existsSync(localFilePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const zip = new AdmZip(localFilePath);
  const projectJsonText = zip.readAsText('project.json');

  if (!projectJsonText) {
    return res.status(404).json({ error: 'project.json not found' });
  }

  res.json(JSON.parse(projectJsonText));
});

// GET: Serve asset
router.get('/assets/internalapi/asset/:asset_name', (req, res) => {
  const assetPath = path.join(LOCAL_ASSET_PATH, req.params.asset_name);
  if (!fs.existsSync(assetPath)) {
    return res.status(404).json({ error: 'Asset not found' });
  }
  res.setHeader('Content-Type', getMimeType(req.params.asset_name));
  res.sendFile(assetPath);
});

// POST: Increment view/like/favorite in data.json
// Use rate limiter for views, manual check for love/favourite
router.post('/api/projects/:id/:action', (req, res, next) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (action === 'view') {
    // Use the viewLimiter middleware for "view" actions
    return viewLimiter(req, res, () => next());
  } else if (action === 'love' || action === 'favourite') {
    // Check if IP has already performed this action on this project
    const ip = req.ip;
    const map = oneTimeActions[action === 'love' ? 'love' : 'favourite'];

    if (!map.has(id)) {
      map.set(id, new Set());
    }

    if (map.get(id).has(ip)) {
      return res.status(429).json({ error: `You have already ${action === 'love' ? 'liked' : 'favourited'} this project` });
    }

    // Mark that IP has done this action
    map.get(id).add(ip);

    // Proceed to next middleware to update the data.json
    return next();
  } else {
    return res.status(400).json({ error: 'Invalid action' });
  }
}, (req, res) => {
  // Actual incrementing handler after rate limiting or checks
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    const zip = new AdmZip(filePath);
    const dataJson = JSON.parse(zip.readAsText('data.json'));

    let statKey;
    if (action === 'view') statKey = 'views';
    else if (action === 'love') statKey = 'loves';
    else if (action === 'favourite') statKey = 'favorites';
    else return res.status(400).json({ error: 'Invalid action' });

    if (!dataJson.stats) dataJson.stats = {};
    dataJson.stats[statKey] = (dataJson.stats[statKey] || 0) + 1;

    zip.updateFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(filePath);

    res.json({ message: `${statKey} incremented`, stats: dataJson.stats });
  } catch (error) {
    console.error('Error updating data.json:', error.message);
    res.status(500).json({ error: 'Failed to update data.json' });
  }
});

module.exports = router;
