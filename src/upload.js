const express = require('express');
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const router = express.Router();

// === CONFIG ===
const GITHUB_TOKEN = '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';
const REPO_OWNER = 'kRxZykRxZy';
const REPO_NAME = 'Project-DB';
const BRANCH = 'main';

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const ASSETS_DIR = path.join(__dirname, '..', 'local_storage', 'assets');

const octokit = new Octokit({ auth: GITHUB_TOKEN });

// === STATUS STORE ===
let uploadStatus = {
  completed: false,
  error: null,
  lastUpdated: null,
};

// === CORE FUNCTIONS ===

async function getShaForFile(filePath) {
  try {
    const res = await octokit.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path: filePath,
      ref: BRANCH,
    });
    return res.data.sha;
  } catch {
    return null; // File does not exist yet
  }
}

async function uploadFile(filePath, contentBuffer) {
  const repoPath = filePath.replace(/\\/g, '/');
  const content = contentBuffer.toString('base64');
  const sha = await getShaForFile(repoPath);

  await octokit.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: repoPath,
    message: `Upload ${repoPath}`,
    content,
    branch: BRANCH,
    ...(sha && { sha }),
  });

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

// === AUTO INTERVAL (Every 1 min) ===
setInterval(performUpload, 60 * 1000); // 60 sec = 1 min
performUpload(); // Run immediately on startup

// === ROUTE ===
router.get('/uptime', (req, res) => {
  res.json(uploadStatus);
});

module.exports = router;
