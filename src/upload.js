const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const crypto = require('crypto');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'MyScratchBlocks';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_ASSET_PATH = 'assets';
const GITHUB_TOKEN = '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';

if (!GITHUB_TOKEN) {
  throw new Error('Missing GITHUB_TOKEN in environment variables');
}

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

async function getNextFileNumber() {
  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_UPLOAD_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'MyScratchBlocks-Uploader'
        }
      }
    );

    const files = response.data
      .filter(file => file.name.endsWith('.sb3'))
      .map(file => parseInt(file.name))
      .filter(n => !isNaN(n));

    return files.length ? Math.max(...files) + 1 : 1;
  } catch (err) {
    if (err.response?.status === 404) return 1;
    throw err;
  }
}

// POST: Upload project
router.post('/', upload.single('project'), async (req, res) => {
  const username = req.body.username || 'unknown_user';
  const projectName = req.body.projectName || 'Untitled';

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    const fileNum = await getNextFileNumber();
    const githubFileName = `${fileNum}.sb3`;
    const githubFilePath = `${GITHUB_UPLOAD_PATH}/${githubFileName}`;

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
            '90x90': 'https://trampoline.turbowarp.org/avatars/1',
            '60x60': 'https://trampoline.turbowarp.org/avatars/1',
            '55x55': 'https://trampoline.turbowarp.org/avatars/1',
            '50x50': 'https://trampoline.turbowarp.org/avatars/1',
            '32x32': 'https://trampoline.turbowarp.org/avatars/1'
          }
        }
      },
      image: `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_480x360.png`,
      images: {
        '282x218': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_282x218.png?v=${timestamp}`,
        '216x163': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_216x163.png?v=${timestamp}`,
        '200x200': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_200x200.png?v=${timestamp}`,
        '144x108': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_144x108.png?v=${timestamp}`,
        '135x102': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_135x102.png?v=${timestamp}`,
        '100x80': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_100x80.png?v=${timestamp}`
      },
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

    // Extract and upload assets
    const assetEntries = zip.getEntries().filter(entry => {
      const ext = path.extname(entry.entryName).toLowerCase();
      return ['.png', '.svg', '.wav', '.mp3'].includes(ext);
    });

    for (const entry of assetEntries) {
      const assetBuffer = entry.getData();
      const assetName = entry.entryName;
      const assetPath = `${GITHUB_ASSET_PATH}/${assetName}`;

      try {
        await axios.get(
          `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${assetPath}`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              'User-Agent': 'MyScratchBlocks-Uploader'
            }
          }
        );
        // Exists: skip
      } catch (e) {
        if (e.response?.status === 404) {
          await axios.put(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${assetPath}`,
            {
              message: `Upload asset ${assetName}`,
              content: assetBuffer.toString('base64')
            },
            {
              headers: {
                Authorization: `Bearer ${GITHUB_TOKEN}`,
                'User-Agent': 'MyScratchBlocks-Uploader',
                Accept: 'application/vnd.github+json'
              }
            }
          );
        } else {
          throw e;
        }
      }
    }

    const modifiedSb3Path = path.join('temp_uploads', `${fileNum}_modified.sb3`);
    zip.writeZip(modifiedSb3Path);

    const fileContent = fs.readFileSync(modifiedSb3Path);
    const base64Content = fileContent.toString('base64');

    const uploadResponse = await axios.put(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
      {
        message: `Upload project #${fileNum}`,
        content: base64Content
      },
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'MyScratchBlocks-Uploader',
          Accept: 'application/vnd.github+json'
        }
      }
    );

    fs.unlinkSync(filePath);
    fs.unlinkSync(modifiedSb3Path);

    res.json({
      message: 'Project uploaded successfully with embedded metadata and extracted assets',
      sb3File: githubFileName,
      githubUrl: uploadResponse.data.content.html_url,
      projectData: dataJson,
      id: fileNum
    });
  } catch (err) {
    console.error('Upload error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Upload failed',
      details: err.response?.data || err.message
    });
  }
});

// GET: Project metadata (data.json)
router.get('/api/projects/:id/meta', async (req, res) => {
  const projectId = req.params.id;
  const githubFilePath = `${GITHUB_UPLOAD_PATH}/${projectId}.sb3`;

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
      {
        headers: {
          'User-Agent': 'MyScratchBlocks-Uploader',
          Accept: 'application/vnd.github+json'
        }
      }
    );

    const fileContent = Buffer.from(response.data.content, 'base64');
    const zip = new AdmZip(fileContent);
    const dataJsonText = zip.readAsText('data.json');

    if (!dataJsonText) {
      return res.status(404).json({ error: 'data.json not found in the project file.' });
    }

    const dataJson = JSON.parse(dataJsonText);
    res.json(dataJson);
  } catch (err) {
    console.error('Error retrieving metadata:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to retrieve project metadata',
      details: err.response?.data || err.message
    });
  }
});

// GET: project.json
router.get('/json/:id', async (req, res) => {
  const projectId = req.params.id;
  const githubFilePath = `${GITHUB_UPLOAD_PATH}/${projectId}.sb3`;

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
      {
        headers: {
          'User-Agent': 'MyScratchBlocks-Uploader',
          Accept: 'application/vnd.github+json'
        }
      }
    );

    const fileContent = Buffer.from(response.data.content, 'base64');
    const zip = new AdmZip(fileContent);
    const projectJsonText = zip.readAsText('project.json');

    if (!projectJsonText) {
      return res.status(404).json({ error: 'project.json not found in the project file.' });
    }

    const projectJson = JSON.parse(projectJsonText);
    res.json(projectJson);
  } catch (err) {
    console.error('Error retrieving project.json:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to retrieve project.json',
      details: err.response?.data || err.message
    });
  }
});

// GET: Serve asset from GitHub
router.get('/assets/:assetId', async (req, res) => {
  const { assetId } = req.params;

  try {
    const response = await axios.get(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_ASSET_PATH}/${assetId}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          'User-Agent': 'MyScratchBlocks-Uploader',
          Accept: 'application/vnd.github+json'
        }
      }
    );

    const assetBuffer = Buffer.from(response.data.content, 'base64');
    res.setHeader('Content-Type', getMimeType(assetId));
    res.send(assetBuffer);
  } catch (err) {
    console.error('Asset fetch error:', err.response?.data || err.message);
    res.status(404).json({ error: 'Asset not found', details: err.response?.data || err.message });
  }
});

module.exports = router;
