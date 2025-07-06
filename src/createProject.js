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

  if (clientIp !== '103.7.204.46') {
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

module.exports = router;
