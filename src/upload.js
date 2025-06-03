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

const viewLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 1,
  keyGenerator: (req) => `${req.params.id}_view_${req.ip}`,
  message: { error: 'View limit reached for today' },
  standardHeaders: true,
  legacyHeaders: false,
});

const oneTimeActions = {
  love: new Map(),
  favourite: new Map()
};

// POST: Create a new empty project
router.post('/', async (req, res) => {
  try {
    const fileNum = getNextFileNumber();
    const localFileName = `${fileNum}.sb3`;
    const localFilePath = path.join(LOCAL_UPLOAD_PATH, localFileName);
    const username = req.body.username;

    if (typeof username !== 'string' || username.includes("MyScratchBlocks")) {
      return res.status(400).json({ error: "Invalid username" });
    }

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

    const zip = new AdmZip();
    zip.addFile('project.json', Buffer.from('{"targets":[{"isStage":true,"name":"Stage","variables":{"`jEk@4|i[#Fk?(8x)AV.-my variable":["my variable",0]},"lists":{},"broadcasts":{},"blocks":{},"comments":{},"currentCostume":0,"costumes":[{"name":"backdrop1","dataFormat":"svg","assetId":"cd21514d0531fdffb22204e0ec5ed84a","md5ext":"cd21514d0531fdffb22204e0ec5ed84a.svg","rotationCenterX":240,"rotationCenterY":180}],"sounds":[{"name":"pop","assetId":"83a9787d4cb6f3b7632b4ddfebf74367","dataFormat":"wav","format":"","rate":48000,"sampleCount":1123,"md5ext":"83a9787d4cb6f3b7632b4ddfebf74367.wav"}],"volume":100,"layerOrder":0,"tempo":60,"videoTransparency":50,"videoState":"on","textToSpeechLanguage":null}],"monitors":[],"extensions":[],"meta":{"semver":"3.0.0","vm":"11.1.0","agent":"Mozilla/5.0"}}', 'utf-8'));
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

// POST: Save SB3 to existing project
router.post('/:id/save', upload.single('project'), (req, res) => {
  const { id } = req.params;
  const sb3Blob = req.file;
  const { projectName } = req.body;
  const destPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!sb3Blob) {
    return res.status(400).json({ error: 'No project file provided' });
  }

  if (!fs.existsSync(destPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const existingZip = new AdmZip(destPath);
    const dataEntry = existingZip.getEntry('data.json');
    if (!dataEntry) throw new Error('Missing data.json');
    const dataJson = JSON.parse(dataEntry.getData().toString());

    if (typeof projectName === 'string') {
      dataJson.title = projectName;
    }

    const uploadedZip = new AdmZip(sb3Blob.path);
    const newZip = new AdmZip();

    newZip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    uploadedZip.getEntries().forEach(entry => {
      const name = entry.entryName;

      if (name === 'project.json' || /\.(png|svg|wav|mp3)$/.test(name)) {
        newZip.addFile(name, entry.getData());
      }

      if (/\.(png|svg|wav|mp3)$/.test(name)) {
        const assetPath = path.join(LOCAL_ASSET_PATH, name);
        if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
        fs.writeFileSync(assetPath, entry.getData());
      }
    });

    newZip.writeZip(destPath);
    fs.unlinkSync(sb3Blob.path);

    res.json({ message: 'Project updated', id, updatedTitle: dataJson.title });
  } catch (err) {
    console.error('Error saving project:', err.message);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// GET: Metadata (data.json)
router.get('/api/projects/:id/meta', (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');
    if (!entry) return res.status(404).json({ error: 'data.json not found' });
    res.json(JSON.parse(entry.getData().toString()));
  } catch (err) {
    console.error('Metadata error:', err.message);
    res.status(500).json({ error: 'Failed to read metadata' });
  }
});

// GET: project.json
router.get('/json/:id', (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    const projectJson = zip.readAsText('project.json');
    res.json(JSON.parse(projectJson));
  } catch (err) {
    console.error('project.json error:', err.message);
    res.status(500).json({ error: 'Failed to read project.json' });
  }
});

// GET: Serve asset
router.get('/assets/:md5ext', (req, res) => {
  const assetPath = path.join(LOCAL_ASSET_PATH, req.params.md5ext);
  if (!fs.existsSync(assetPath)) return res.status(404).json({ error: 'Asset not found' });

  const mimeType = getMimeType(req.params.md5ext);
  res.setHeader('Content-Type', mimeType);
  fs.createReadStream(assetPath).pipe(res);
});

// POST: view/love/favourite
router.post('/api/projects/:id/:action', (req, res, next) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  if (action === 'love' || action === 'favourite') {
    const ip = req.ip;
    const map = oneTimeActions[action];

    if (!map.has(id)) map.set(id, new Set());
    if (map.get(id).has(ip)) {
      return res.status(429).json({ error: `You have already ${action}d this project` });
    }

    map.get(id).add(ip);
    return next();
  }

  return res.status(400).json({ error: 'Invalid action' });
}, (req, res) => {
  const { id, action } = req.params;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    const zip = new AdmZip(filePath);
    const dataJson = JSON.parse(zip.readAsText('data.json'));
    const statKey = action === 'love' ? 'loves' : 'favorites';

    dataJson.stats[statKey] = (dataJson.stats[statKey] || 0) + 1;
    zip.updateFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(filePath);

    res.json({ message: `${statKey} incremented`, stats: dataJson.stats });
  } catch (err) {
    console.error('Stat update error:', err.message);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// POST: increment view with rate limit
router.post('/api/projects/:id/view', viewLimiter, (req, res) => {
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${req.params.id}.sb3`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const zip = new AdmZip(filePath);
    const dataJson = JSON.parse(zip.readAsText('data.json'));

    dataJson.stats.views = (dataJson.stats.views || 0) + 1;
    zip.updateFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.writeZip(filePath);

    res.json({ message: `views incremented`, stats: dataJson.stats });
  } catch (err) {
    console.error('View count error:', err.message);
    res.status(500).json({ error: 'Failed to update view count' });
  }
});

module.exports = router;
