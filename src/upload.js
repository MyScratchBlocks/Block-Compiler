const fs = require('fs');
const path = require('path');
const https = require('https');

const GITHUB_TOKEN = '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';
const REPO_OWNER = 'MyScratchBlocks';
const REPO_NAME = 'Project-DB';
const BRANCH = 'main';

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const ASSETS_DIR = path.join(__dirname, '..', 'local_storage', 'assets');

function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'node.js',
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          console.error(`Error: ${res.statusCode} ${res.statusMessage}`);
          console.error(body);
          reject(new Error(`GitHub API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function getShaForFile(filePath) {
  try {
    const response = await apiRequest('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`);
    return response.sha;
  } catch {
    return null;
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
  };

  if (sha) {
    payload.sha = sha;
  }

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

(async () => {
  try {
    console.log('Uploading uploads...');
    await walkAndUpload(UPLOAD_DIR, 'uploads');

    console.log('Uploading assets...');
    await walkAndUpload(ASSETS_DIR, 'assets');

    console.log('All files uploaded.');
  } catch (err) {
    console.error('Upload failed:', err);
  }
})();
