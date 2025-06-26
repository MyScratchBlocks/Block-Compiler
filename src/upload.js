const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const router = express.Router();

// === CONFIG ===
const GITHUB_TOKEN = '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'; // ⚠️ Use env in production
const REPO_OWNER = 'MyScratchBlocks';
const REPO_NAME = 'Project-DB';
const BRANCH = 'main';

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const ASSETS_DIR = path.join(__dirname, '..', 'local_storage', 'assets');

const githubApi = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
  },
});

// === STATUS STORE ===
let uploadStatus = {
  completed: false,
  error: null,
  lastUpdated: null,
};

// === HELPERS ===

function clearDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getShaForFile(filePath) {
  try {
    const res = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${BRANCH}`);
    return res.data.sha;
  } catch (e) {
    if (e.response && e.response.status === 404) return null;
    throw e;
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

  await githubApi.put(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`, payload);

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

async function downloadFromGitHub(repoPath, localDir) {
  try {
    const res = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}?ref=${BRANCH}`);
    const data = res.data;

    fs.mkdirSync(localDir, { recursive: true });

    for (const file of data) {
      const fileRepoPath = path.posix.join(repoPath, file.name);
      const localFilePath = path.join(localDir, file.name);

      if (file.type === 'dir') {
        await downloadFromGitHub(fileRepoPath, localFilePath);
      } else {
        const fileRes = await githubApi.get(`/repos/${REPO_OWNER}/${REPO_NAME}/contents/${fileRepoPath}?ref=${BRANCH}`);
        const content = Buffer.from(fileRes.data.content, 'base64');
        fs.writeFileSync(localFilePath, content);
        console.log(`Downloaded: ${fileRepoPath} → ${localFilePath}`);
      }
    }
  } catch (err) {
    console.error(`Failed to download ${repoPath}:`, err.message);
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

    // === After successful upload ===
    console.log('Clearing local folders...');
    clearDirectory(UPLOAD_DIR);
    clearDirectory(ASSETS_DIR);

    console.log('Downloading fresh copies from GitHub...');
    await downloadFromGitHub('uploads', UPLOAD_DIR);
    await downloadFromGitHub('assets', ASSETS_DIR);

    console.log('Resync complete.');
  } catch (err) {
    uploadStatus.completed = false;
    uploadStatus.error = err.message;
    uploadStatus.lastUpdated = new Date().toISOString();
    console.error('Upload failed:', err.message);
  }
}

// === STARTUP ===
performUpload(); // Run immediately on startup

// === AUTO INTERVAL (Every 1 min) ===
setInterval(performUpload, 60 * 1000);

// === ROUTE ===
router.get('/uptime', (req, res) => {
  res.json(uploadStatus);
});

module.exports = router;
