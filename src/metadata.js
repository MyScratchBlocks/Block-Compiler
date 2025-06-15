const express = require('express');
const AdmZip = require('adm-zip');
const axios = require('axios');

const router = express.Router();

const GITHUB_TOKEN = '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';
const OWNER = 'MyScratchBlocks';
const REPO = 'Project-DB';
const BRANCH = 'main'; // Change if needed

const githubAPI = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    'User-Agent': 'MyScratchBlocksApp'
  }
});

// Helper to set nested JSON path value
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

// GET project metadata
router.get('/api/projects/:id/meta', async (req, res) => {
  const { id } = req.params;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    const { data: fileData } = await githubAPI.get(`/repos/${OWNER}/${REPO}/contents/projects/${id}.sb3`, {
      params: { ref: BRANCH }
    });

    const buffer = Buffer.from(fileData.content, 'base64');
    const zip = new AdmZip(buffer);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    const metadata = JSON.parse(entry.getData().toString('utf-8'));
    res.json(metadata);
  } catch (err) {
    console.error('GitHub read error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// PUT update project metadata
router.put('/api/projects/:id/meta', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  try {
    // Fetch file info
    const { data: fileData } = await githubAPI.get(`/repos/${OWNER}/${REPO}/contents/projects/${id}.sb3`, {
      params: { ref: BRANCH }
    });

    const originalSHA = fileData.sha;
    const buffer = Buffer.from(fileData.content, 'base64');
    const zip = new AdmZip(buffer);

    const entry = zip.getEntry('data.json');
    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    let metadata;
    try {
      metadata = JSON.parse(entry.getData().toString('utf-8'));
    } catch (err) {
      return res.status(500).json({ error: 'Invalid data.json content' });
    }

    // Apply updates
    for (const key in updates) {
      setNestedValue(metadata, key, updates[key]);
    }

    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(metadata, null, 2)));

    const updatedBuffer = zip.toBuffer();
    const encoded = updatedBuffer.toString('base64');

    // Upload new file version to GitHub
    await githubAPI.put(`/repos/${OWNER}/${REPO}/contents/projects/${id}.sb3`, {
      message: `Update metadata for project ${id}`,
      content: encoded,
      sha: originalSHA,
      committer: {
        name: 'Project Bot',
        email: 'bot@myscratchblocks.com'
      },
      author: {
        name: 'Project Bot',
        email: 'bot@myscratchblocks.com'
      }
    });

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('GitHub update error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

module.exports = router;
