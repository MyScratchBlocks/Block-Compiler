const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// === CONFIG ===
const GITHUB_TOKEN = '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';
const REPO_OWNER = 'MyScratchBlocks';
const REPO_NAME = 'Project-DB';
const BRANCH = 'main';

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const ASSETS_DIR = path.join(__dirname, '..', 'local_storage', 'assets');

const api = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    'User-Agent': 'node.js',
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
  }
});

// === STATUS STORE ===
let uploadStatus = {
  completed: false,
  error: null,
  lastUpdated: null,
};

// === CORE FUNCTIONS ===

async function apiRequest(method, url, data = null) {
  try {
    const response = await api.request({ method, url, data });
    return response.data;
  } catch (error) {
    const errMsg = error.response?.data?.message || error.message;
    throw new Error(`GitHub API error: ${errMsg}`);
  }
}

async function getShaForFile(filePath) {
  try {
    const response = await apiRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
    return response.sha;
  } catch {
    return null; // File not found
  }
}

async function uploadFile(filePath, contentBuffer) {
  const repoPath = filePath.replace(/\\/g, '/');
  const content = contentBuffer.toString('base64');
  const sha = await getShaForFile(repoPath);

  const payload = {
    message: `Upload ${repoPath}`,
    content,
    branch: BRANCH,
    ...(sha && { sha }),
  };

  await apiRequest('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`, payload);
  console.log(`Uploaded: ${repoPath}`);
}

async function walkAndUpload(dirPath, basePath = '') {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      await walkAndUpload(fullPath, relativePath);
    } else {
      const content = fs.readFileSync(fullPath);
      await uploadFile(relativePath, content);
    }
  }
}

async function performUpload() {
  try {
    console.log('Uploading uploads...');
    await walkAndUpload(UPLOAD_DIR, 'uploads');

    console.log('Uploading assets...');
    await walkAndUpload(ASSETS_DIR, 'assets');

    uploadStatus.completed = true;
    uploadStatus.error = null;
    uploadStatus.lastUpdated = new Date().toISOString();
    console.log('All files uploaded successfully.');
  } catch (err) {
    uploadStatus.completed = false;
    uploadStatus.error = err.message;
    uploadStatus.lastUpdated = new Date().toISOString();
    console.error('Upload failed:', err.message);
  }
}

// Start upload on app load
performUpload();

// === ROUTE ===
router.get('/uptime', (req, res) => {
  res.json(uploadStatus);
});

module.exports = router;
