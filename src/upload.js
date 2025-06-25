const express = require('express');
const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const router = express.Router();

// === CONFIG ===
const GITHUB_TOKEN = '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'; // <-- Use env variable!
const REPO_OWNER = 'kRxZykRxZy';
const REPO_NAME = 'Project-DB';
const BRANCH = 'main';

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const ASSETS_DIR = path.join(__dirname, '..', 'local_storage', 'assets');

if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN environment variable not set!');
}

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
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
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
  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory missing: ${dirPath}, skipping.`);
    return;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.join(basePath, entry.name);

    if (entry.isDirectory()) {
      await walkAndUpload(fullPath, relativePath);
    } else {
      try {
        const content = fs.readFileSync(fullPath);
        await uploadFile(relativePath, content);
      } catch (err) {
        console.error(`Failed to upload ${relativePath}:`, err.message);
      }
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
