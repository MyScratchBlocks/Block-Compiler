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

// POST: Create a new empty project
router.post('/', async (req, res) => {
  try {
    const fileNum = getNextFileNumber();
    const localFileName = `${fileNum}.sb3`;
    const localFilePath = path.join(LOCAL_UPLOAD_PATH, localFileName);
    const username = req.body.username;

    const token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;

    const dataJson = {
      id: fileNum,
      title: 'Untitled',
      description: '',
      instructions: '',
      visibility: 'visible',
      public: true,
      comments_allowed: true,
      is_published: true,
      author: {
        id: Math.floor(Math.random() * 1000000000),
        username: username,
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

  
    // Create empty sb3 project with just project.json and data.json
    const zip = new AdmZip();
    zip.addFile('project.json', Buffer.from('{"targets":[{"isStage":true,"name":"Stage","variables":{"`jEk@4|i[#Fk?(8x)AV.-my variable":["my variable",0]},"lists":{},"broadcasts":{},"blocks":{},"comments":{},"currentCostume":0,"costumes":[{"name":"backdrop1","dataFormat":"svg","assetId":"cd21514d0531fdffb22204e0ec5ed84a","md5ext":"cd21514d0531fdffb22204e0ec5ed84a.svg","rotationCenterX":240,"rotationCenterY":180}],"sounds":[{"name":"pop","assetId":"83a9787d4cb6f3b7632b4ddfebf74367","dataFormat":"wav","format":"","rate":48000,"sampleCount":1123,"md5ext":"83a9787d4cb6f3b7632b4ddfebf74367.wav"}],"volume":100,"layerOrder":0,"tempo":60,"videoTransparency":50,"videoState":"on","textToSpeechLanguage":null}],"monitors":[],"extensions":[],"meta":{"semver":"3.0.0","vm":"11.1.0","agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"}}', 'utf-8'));
    zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(localFilePath);

    res.json({
      message: 'Empty project created',
      id: fileNum,
      sb3File: localFileName,
      projectData: dataJson
    });
  } catch (err) {
    console.error('Error creating empty project:', err.message);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// POST: Save SB3 blob to existing project
router.post('/:id/save', upload.single('project'), (req, res) => {
  const { id } = req.params;
  const sb3Blob = req.file;

  if (!sb3Blob) {
    return res.status(400).json({ error: 'No project file provided' });
  }

  const destPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.copyFileSync(sb3Blob.path, destPath);
    fs.unlinkSync(sb3Blob.path);

    res.json({ message: 'Project saved successfully', id });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: 'Failed to save project' });
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
