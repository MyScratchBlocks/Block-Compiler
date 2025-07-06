const express = require('express');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { addMessage } = require('./messages');
const fetch = require('node-fetch');

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
      image: `https://myscratchblocks.github.io/images/No%20Cover%20Available.png`,
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

// GET endpoint to delete project by ID only if request IP is 103.7.204.46
router.get('/api/delete/:id', async (req, res) => {
  const resp = await fetch('https://api.ipify.org/?format=json');
  const json = await resp.json();
  const clientIp = json.ip;

  if (clientIp !== "103.7.204.46") {
    return res.status(403).json({ error: 'Forbidden: Invalid IP address' });
  }
  
  const id = req.params.id;
  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  try {
    fs.unlinkSync(filePath);
    const zip = new AdmZip(path.join(LOCAL_UPLOAD_PATH,  `${id}.sb3`));
    const entry = zip.getEntry('data.json');
    const buffered = zip.readAsText(entry);
    const data = JSON.parse(buffered);
    addMessage(data.author?.username, `Your project <a href="/projects/${data.id}">${data.title}</a> has been deleted by kRxZy_kRxZy (admin) due to multiple recent reports and some inappropriate content. Please refrain from making projects like this. Carry on coding!`);
    return res.json({ message: `Project ${id} deleted successfully.` });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete project', message: error.message });
  }
});

const crypto = require('crypto');

function generateMd5ext(oldMd5ext) {
  // Replace old md5ext with a new one (simulate by hashing old + random uuid)
  const ext = oldMd5ext.split('.').pop();
  const newMd5 = crypto.createHash('md5').update(oldMd5ext + uuidv4()).digest('hex');
  return `${newMd5}.${ext}`;
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

    // Read origin project zip
    const originZip = new AdmZip(originPath);
    const originEntries = originZip.getEntries();

    // Extract data.json and project.json
    const originDataEntry = originZip.getEntry('data.json');
    const originProjectEntry = originZip.getEntry('project.json');

    if (!originDataEntry || !originProjectEntry) {
      return res.status(400).json({ error: 'Origin project missing essential files' });
    }

    const originDataJson = JSON.parse(originZip.readAsText(originDataEntry));
    const originProjectJson = JSON.parse(originZip.readAsText(originProjectEntry));

    // Increment remixes count in origin project data.json and re-save origin .sb3
    originDataJson.stats.remixes = (originDataJson.stats.remixes || 0) + 1;

    const originDataBuffer = Buffer.from(JSON.stringify(originDataJson, null, 2));
    originZip.updateFile('data.json', originDataBuffer);
    originZip.writeZip(originPath);

    // Prepare new project data
    const newFileNum = getNextFileNumber();
    const newFileName = `${newFileNum}.sb3`;
    const newFilePath = path.join(LOCAL_UPLOAD_PATH, newFileName);

    // Create deep copies of project.json and data.json to modify
    const newProjectJson = JSON.parse(JSON.stringify(originProjectJson));
    const newDataJson = JSON.parse(JSON.stringify(originDataJson));

    // Update newDataJson fields
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
    newDataJson.visibility = 'unshared',
    newDataJson.stats.loves = 0;
    newDataJson.stats.favorites = 0;
    newDataJson.stats.remixes = 0;
    newDataJson.remix.parent = originDataJson.id;
    newDataJson.remix.root = originDataJson.remix.root || originDataJson.id;
    newDataJson.project_token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;

    // Helper: map old md5ext => new md5ext (and keep track for copying asset files)
    const md5extMap = {};

    // Iterate all targets and replace md5ext in costumes and sounds
    newProjectJson.targets.forEach(target => {
      // Costumes
      if (Array.isArray(target.costumes)) {
        target.costumes.forEach(costume => {
          if (costume.md5ext) {
            const oldMd5ext = costume.md5ext;
            const newMd5ext = generateMd5ext(oldMd5ext);
            md5extMap[oldMd5ext] = newMd5ext;
            costume.md5ext = newMd5ext;

            // also update assetId (everything except extension)
            costume.assetId = newMd5ext.split('.')[0];
          }
        });
      }

      // Sounds
      if (Array.isArray(target.sounds)) {
        target.sounds.forEach(sound => {
          if (sound.md5ext) {
            const oldMd5ext = sound.md5ext;
            const newMd5ext = generateMd5ext(oldMd5ext);
            md5extMap[oldMd5ext] = newMd5ext;
            sound.md5ext = newMd5ext;

            sound.assetId = newMd5ext.split('.')[0];
          }
        });
      }
    });

    // Copy all asset files with new names
    // Asset files in sb3 are stored as separate files named md5ext, e.g. "cd21514d0531fdffb22204e0ec5ed84a.svg"
    const newZip = new AdmZip();

    // Copy all files, remapping md5ext files
    originEntries.forEach(entry => {
      if (entry.entryName === 'data.json') {
        newZip.addFile('data.json', Buffer.from(JSON.stringify(newDataJson, null, 2)));
      } else if (entry.entryName === 'project.json') {
        newZip.addFile('project.json', Buffer.from(JSON.stringify(newProjectJson, null, 2)));
      } else if (entry.entryName === 'comments.json') {
        // Copy comments.json as is
        newZip.addFile('comments.json', Buffer.from('[]'));
      } else {
        // For other files (likely asset files)
        const originalName = entry.entryName;

        if (md5extMap[originalName]) {
          // Rename asset file to new md5ext
          const newName = md5extMap[originalName];
          const data = originZip.readFile(entry);
          newZip.addFile(newName, data);
        } else {
          // Copy other files unchanged
          const data = originZip.readFile(entry);
          newZip.addFile(originalName, data);
        }
      }
    });

    // Write new .sb3 file
    newZip.writeZip(newFilePath);

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
