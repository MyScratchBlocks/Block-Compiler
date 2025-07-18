const express = require('express');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { addMessage } = require('./messages');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

// Ensure the local upload path exists
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) {
  fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });
}

function getNextFileNumber() {
  const files = fs.readdirSync(LOCAL_UPLOAD_PATH)
    .filter(name => name.endsWith('.sb3'))
    .map(name => parseInt(name))
    .filter(n => !isNaN(n));

  return files.length ? Math.max(...files) + 1 : 1;
}

router.post('/', async (req, res) => {
  try {
    const fileNum = getNextFileNumber();
    const sb3FileName = `${fileNum}.sb3`;
    const sb3LocalPath = path.join(LOCAL_UPLOAD_PATH, sb3FileName);
    const username = req.body.username;

    if (typeof username !== 'string' || username.includes("MyScratchBlocks-")) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;

    const dataJson = {
      id: fileNum,
      title: 'Untitled Project',
      description: '',
      instructions: '',
      visibility: 'unshared',
      public: true,
      comments_allowed: true,
      is_published: true,
      author: {
        id: Math.floor(Math.random() * 1e9),
        username,
        scratchteam: false,
        history: { joined: '1900-01-01T00:00:00.000Z' },
        profile: { id: null, images: {} }
      },
      image: '',
      images: {},
      history: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        shared: new Date().toISOString()
      },
      stats: { views: 0, loves: 0, favorites: 0, remixes: 0 },
      remix: { parent: null, root: null },
      project_token: token
    };

    const zip = new AdmZip();

    zip.addFile('project.json', Buffer.from(JSON.stringify({
      targets: [{
        isStage: true,
        name: 'Stage',
        variables: {
          '`jEk@4|i[#Fk?(8x)AV.-my variable': ['my variable', 0]
        },
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [{
          name: 'backdrop1',
          dataFormat: 'svg',
          assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
          md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
          rotationCenterX: 240,
          rotationCenterY: 180
        }],
        sounds: [{
          name: 'pop',
          assetId: '83a9787d4cb6f3b7632b4ddfebf74367',
          dataFormat: 'wav',
          format: '',
          rate: 48000,
          sampleCount: 1123,
          md5ext: '83a9787d4cb6f3b7632b4ddfebf74367.wav'
        }],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'on',
        textToSpeechLanguage: null
      }],
      monitors: [],
      extensions: [],
      meta: {
        semver: '3.0.0',
        vm: '11.1.0',
        agent: 'Mozilla/5.0'
      }
    }, null, 2)));

    zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    zip.addFile('comments.json', Buffer.from('[]'));

    zip.writeZip(sb3LocalPath);

    res.json({
      message: 'Empty project created locally',
      id: fileNum,
      localPath: sb3LocalPath,
      projectData: dataJson
    });

  } catch (err) {
    console.error('Error creating project locally:', err.message);
    res.status(500).json({ error: 'Failed to create local project', message: err.message });
  }
});

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip
  );
}

// GET endpoint to delete project by ID only if request IP is 103.7.204.46
router.get('/api/delete/:id/:user', async (req, res) => {  
  const id = req.params.id;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    const zip = new AdmZip(path.join(LOCAL_UPLOAD_PATH,  `${id}.sb3`));
    const entry = zip.getEntry('data.json');
    const buffered = zip.readAsText(entry);
    const data = JSON.parse(buffered);
    if(req.params.user === data.author?.username) {
      fs.unlinkSync(filePath);
      return res.json({ message: `Project ${id} deleted successfully.` });
    }
  } catch (error) {
    return res.status(500).json({ success: 'False', message: error.message });
  }
});

const crypto = require('crypto');

function generateMd5ext(oldMd5ext) {
  const ext = path.extname(oldMd5ext);
  const newMd5 = crypto.createHash('md5').update(oldMd5ext + uuidv4()).digest('hex');
  return `${newMd5}${ext}`;
}

router.post('/remix/:id', (req, res) => {
  try {
    const originId = req.params.id;
    const username = req.body.username;

    if (typeof username !== 'string' || username.includes("MyScratchBlocks-")) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const originPath = path.join(LOCAL_UPLOAD_PATH, `${originId}.sb3`);
    if (!fs.existsSync(originPath)) {
      return res.status(404).json({ error: 'Origin project not found' });
    }

    const originZip = new AdmZip(originPath);
    const originEntries = originZip.getEntries();

    const originDataEntry = originZip.getEntry('data.json');
    const originProjectEntry = originZip.getEntry('project.json');

    if (!originDataEntry || !originProjectEntry) {
      return res.status(400).json({ error: 'Origin project missing essential files' });
    }

    // Increment remix count
    const originDataJson = JSON.parse(originZip.readAsText(originDataEntry));
    const originProjectJson = JSON.parse(originZip.readAsText(originProjectEntry));

    originDataJson.stats.remixes = (originDataJson.stats.remixes || 0) + 1;
    originZip.updateFile('data.json', Buffer.from(JSON.stringify(originDataJson, null, 2)));
    originZip.writeZip(originPath);

    const newFileNum = getNextFileNumber();
    const newFileName = `${newFileNum}.sb3`;
    const newFilePath = path.join(LOCAL_UPLOAD_PATH, newFileName);

    const newProjectJson = JSON.parse(JSON.stringify(originProjectJson));
    const newDataJson = JSON.parse(JSON.stringify(originDataJson));

    // Update metadata
    newDataJson.id = newFileNum;
    newDataJson.author = {
      id: Math.floor(Math.random() * 1e9),
      username,
      scratchteam: false,
      history: { joined: new Date().toISOString() },
      profile: { id: null, images: {} }
    };
    newDataJson.history.created = new Date().toISOString();
    newDataJson.history.modified = new Date().toISOString();
    newDataJson.history.shared = new Date().toISOString();
    newDataJson.stats.views = 0;
    newDataJson.image = '';
    newDataJson.stats.loves = 0;
    newDataJson.stats.favorites = 0;
    newDataJson.stats.remixes = 0;
    newDataJson.visibility = 'unshared';
    newDataJson.remix.parent = originDataJson.id;
    newDataJson.remix.root = originDataJson.remix?.root || originDataJson.id;
    newDataJson.project_token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;

    const assetMap = new Map(); // oldName => newName
    const newZip = new AdmZip()
    newProjectJson.targets.forEach(target => {
      (target.costumes || []).forEach(costume => {
        const assetZip = new AdmZip(originPath);
        const asset = assetZip.getEntry(costume.md5ext);
        const data = asset.getData();
        const oldName = costume.md5ext;
        const newName = generateMd5ext(oldName); 
        newZip.addFile(newName, data);
        assetMap.set(oldName, newName);
        costume.md5ext = newName;
        costume.assetId = path.basename(newName, path.extname(newName));
      });

      (target.sounds || []).forEach(sound => {
        const oldName = sound.md5ext;
        const newName = generateMd5ext(oldName);
        assetMap.set(oldName, newName);
        sound.md5ext = newName;
        sound.assetId = path.basename(newName, path.extname(newName));
      });
    });

    // Create new zip
    
    newZip.addFile('project.json', Buffer.from(JSON.stringify(newProjectJson, null, 2)));
    newZip.addFile('data.json', Buffer.from(JSON.stringify(newDataJson, null, 2)));
    newZip.addFile('comments.json', Buffer.from('[]'));

    // Copy and rename assets
    originEntries.forEach(entry => {
      const originalName = entry.entryName;

      if (assetMap.has(originalName)) {
        const newName = assetMap.get(originalName);
        const content = originZip.readFile(entry);
        newZip.addFile(newName, content);
      } else if (!['project.json', 'data.json', 'comments.json'].includes(originalName)) {
        // Copy other non-renamed files if needed (optional)
        const content = originZip.readFile(entry);
        newZip.addFile(originalName, content);
      }
    });

    newZip.writeZip(newFilePath);
    addMessage(originDataJson.author.username, `${username} remixed your project <a href="/projects/#${originDataJson.id}">${originDataJson.title}</a> to <a href="/projects/#${newDataJson.id}">${newDataJson.title}</a>`);
    res.json({
      message: `Remixed project created with ID ${newFileNum}`,
      id: newFileNum,
      localPath: newFilePath,
      projectData: newDataJson
    });

  } catch (err) {
    console.error('Error remixing project:', err);
    res.status(500).json({ error: 'Failed to remix project', message: err.message });
  }
});
module.exports = router;
