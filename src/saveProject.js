const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });

function findBrowserExecutable() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
    'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}

function screenshotWithBrowser(browserPath, htmlPath, screenshotPath) {
  const browserName = path.basename(browserPath).toLowerCase();

  if (browserName.includes('chrome') || browserName.includes('chromium') || browserName.includes('msedge')) {
    const args = [
      '--headless',
      '--disable-gpu',
      '--window-size=480,360',
      '--hide-scrollbars',
      `--screenshot=${screenshotPath}`,
      `file://${htmlPath}`,
    ];
    const result = spawnSync(browserPath, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
  } else if (browserName.includes('firefox')) {
    const args = [
      '-headless',
      '-screenshot',
      screenshotPath,
      '-width',
      '480',
      '-height',
      '360',
      htmlPath.startsWith('file://') ? htmlPath : `file://${htmlPath}`,
    ];
    const result = spawnSync(browserPath, args, { stdio: 'inherit' });
    if (result.error) throw result.error;
  } else {
    throw new Error(`Unsupported browser for screenshot: ${browserName}`);
  }
}

// New endpoint to serve the raw SB3 project by id
router.get('/projectSb3/:id', (req, res) => {
  const { id } = req.params;
  const projectPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).send('Project not found');
  }

  res.setHeader('Content-Type', 'application/x.scratch.sb3');
  res.sendFile(projectPath);
});

router.post('/:id/save', upload.single('project'), (req, res) => {
  const { id } = req.params;
  const sb3Blob = req.file;
  const { projectName } = req.body;
  const destPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!sb3Blob) return res.status(400).json({ error: 'No project file provided' });
  if (!fs.existsSync(destPath)) return res.status(404).json({ error: 'Project not found' });

  try {
    const existingZip = new AdmZip(destPath);
    const dataEntry = existingZip.getEntry('data.json');
    const comments = existingZip.getEntry('comments.json');
    if (!dataEntry) throw new Error('Missing data.json in existing project');

    const dataJson = JSON.parse(dataEntry.getData().toString());
    const cJson = JSON.parse(comments.getData().toString());

    if (typeof projectName === 'string') {
      dataJson.title = projectName;
    }

    const uploadedZip = new AdmZip(sb3Blob.path);
    const newZip = new AdmZip();

    newZip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    newZip.addFile('comments.json', Buffer.from(JSON.stringify(cJson, null, 2)));

    uploadedZip.getEntries().forEach(entry => {
      const name = entry.entryName;
      if (name === 'project.json' || /\.(png|svg|wav|mp3)$/.test(name)) {
        newZip.addFile(name, entry.getData());
      }
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-'));
    const tempHtmlPath = path.join(tempDir, 'index.html');
    const screenshotPath = path.join(tempDir, `${id}.png`);

    fs.writeFileSync(path.join(tempDir, `${id}.sb3`), newZip.toBuffer());

    // New HTML content embedding TurboWarp iframe
    const turboWarpEmbedUrl = `https://turbowarp.org/embed?project_url=https://editor-compiler.onrender.com/projectSb3/${id}`;
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>TurboWarp Embed Screenshot</title>
  <style>
    body,html { margin:0; padding:0; overflow:hidden; background:#fff; }
    iframe { border:none; width:480px; height:360px; }
  </style>
</head>
<body>
  <iframe src="${turboWarpEmbedUrl}" allowfullscreen></iframe>
</body>
</html>`;

    fs.writeFileSync(tempHtmlPath, htmlContent);

    const browserPath = findBrowserExecutable();
    if (!browserPath) throw new Error('No supported browser found on the system for screenshot.');

    screenshotWithBrowser(browserPath, tempHtmlPath, screenshotPath);

    const screenshotBuffer = fs.readFileSync(screenshotPath);
    newZip.addFile(`${id}.png`, screenshotBuffer);

    newZip.writeZip(destPath);

    fs.unlinkSync(sb3Blob.path);
    fs.rmSync(tempDir, { recursive: true, force: true });

    res.json({ message: 'Project updated with TurboWarp screenshot', id, updatedTitle: dataJson.title });
  } catch (err) {
    console.error('Error saving project:', err);
    if (sb3Blob && fs.existsSync(sb3Blob.path)) fs.unlinkSync(sb3Blob.path);
    res.status(500).json({ error: 'Failed to save project', details: err.message });
  }
});

module.exports = router;
