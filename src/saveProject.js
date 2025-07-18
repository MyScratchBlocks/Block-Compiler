const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });

/** Detect available browser executable paths for screenshotting */
function findBrowserExecutable() {
  const candidates = [
    // Linux / macOS paths
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Windows paths
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
    // Chrome, Chromium, Edge support --headless --screenshot
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
    // Firefox CLI screenshot: --headless -s <file> -w <width> -h <height> <url>
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
    const tempSb3Path = path.join(tempDir, 'project.sb3');
    const screenshotPath = path.join(tempDir, `${id}.png`);

    fs.writeFileSync(tempSb3Path, newZip.toBuffer());

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<title>Scratch Stage Renderer</title>
<script src="https://unpkg.com/scratch-vm@0.2.0/dist/web/scratch-vm.min.js"></script>
<script src="https://unpkg.com/scratch-render@0.1.0/dist/web/scratch-render.min.js"></script>
<style>body,html { margin:0; padding:0; overflow:hidden; background:#fff; }
canvas { display:block; }</style>
</head>
<body>
<canvas id="scratch-canvas" width="480" height="360"></canvas>
<script>
  const vm = new window.VirtualMachine();
  const canvas = document.getElementById('scratch-canvas');
  const renderer = new window.RenderWebGL(canvas);
  vm.attachRenderer(renderer);
  vm.setCompatibilityMode(true);
  vm.start();
  fetch('project.sb3')
    .then(res => res.arrayBuffer())
    .then(buffer => vm.loadProject(buffer))
    .then(() => vm.greenFlag());
</script>
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

    res.json({ message: 'Project updated with embedded screenshot', id, updatedTitle: dataJson.title });
  } catch (err) {
    console.error('Error saving project:', err);
    if (sb3Blob && fs.existsSync(sb3Blob.path)) fs.unlinkSync(sb3Blob.path);
    res.status(500).json({ error: 'Failed to save project', details: err.message });
  }
});

module.exports = router;
