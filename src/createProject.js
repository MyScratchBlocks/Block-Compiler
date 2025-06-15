const express = require('express');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios')

const router = express.Router();

const GITHUB_TOKEN = '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';
const OWNER = 'MyScratchBlocks';
const REPO = 'Project-DB';

const apiBase = 'https://api.github.com';

const axiosGitHub = axios.create({
  baseURL: apiBase,
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'User-Agent': 'MyScratchBlocksApp',
    Accept: 'application/vnd.github.v3+json'
  }
});

// Get next numeric project ID
async function getNextProjectId() {
  try {
    const { data } = await axiosGitHub.get(`/repos/${OWNER}/${REPO}/contents/projects`);

    const sb3Files = data.filter(f => f.name.endsWith('.sb3'));
    const ids = sb3Files.map(f => parseInt(f.name)).filter(n => !isNaN(n));
    return ids.length ? Math.max(...ids) + 1 : 1;
  } catch (err) {
    if (err.response?.status === 404) return 1;
    throw err;
  }
}

// Route to create project
router.post('/', async (req, res) => {
  try {
    const username = req.body.username;
    if (typeof username !== 'string' || username.includes('MyScratchBlocks-')) {
      return res.status(400).json({ error: 'Invalid username' });
    }

    const fileNum = await getNextProjectId();
    const token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;

    const dataJson = {
      id: fileNum,
      title: 'Untitled Project',
      description: '',
      instructions: '',
      visibility: 'visible',
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
      image: `assets/${fileNum}_480x360.png`,
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

    // Create ZIP (.sb3)
    const zip = new AdmZip();
    zip.addFile('project.json', Buffer.from(JSON.stringify({
      targets: [{
        isStage: true,
        name: 'Stage',
        variables: {
          "`jEk@4|i[#Fk?(8x)AV.-my variable": ["my variable", 0]
        },
        lists: {}, broadcasts: {}, blocks: {}, comments: {},
        currentCostume: 0,
        costumes: [{
          name: "backdrop1",
          dataFormat: "svg",
          assetId: "cd21514d0531fdffb22204e0ec5ed84a",
          md5ext: "cd21514d0531fdffb22204e0ec5ed84a.svg",
          rotationCenterX: 240,
          rotationCenterY: 180
        }],
        sounds: [{
          name: "pop",
          assetId: "83a9787d4cb6f3b7632b4ddfebf74367",
          dataFormat: "wav",
          format: "",
          rate: 48000,
          sampleCount: 1123,
          md5ext: "83a9787d4cb6f3b7632b4ddfebf74367.wav"
        }],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: "on",
        textToSpeechLanguage: null
      }],
      monitors: [],
      extensions: [],
      meta: {
        semver: "3.0.0",
        vm: "11.1.0",
        agent: "Mozilla/5.0"
      }
    }), 'utf-8'));

    zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));

    const sb3Buffer = zip.toBuffer();
    const base64Content = sb3Buffer.toString('base64');

    // Upload to GitHub using axios
    await axiosGitHub.put(`/repos/${OWNER}/${REPO}/contents/projects/${fileNum}.sb3`, {
      message: `Add project ${fileNum}`,
      content: base64Content,
      committer: {
        name: 'Project Bot',
        email: 'bot@myscratchblocks.com'
      },
      author: {
        name: 'Project Bot',
        email: 'bot@myscratchblocks.com'
      }
    });

    res.json({
      message: 'Empty project created',
      id: fileNum,
      sb3File: `${fileNum}.sb3`,
      projectData: dataJson
    });
  } catch (err) {
    console.error('GitHub upload error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to upload project to GitHub' });
  }
});

module.exports = router;
