const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const puppeteer = require('puppeteer');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });

// Puppeteer-based screenshot function
async function screenshotWithBrowser(htmlPath, screenshotPath) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  // Load the HTML file
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  // Wait for iframe to appear
  await page.waitForSelector('iframe');
  // Get the iframe element
  const iframeElement = await page.$('iframe');
  const iframe = await iframeElement.contentFrame();
  // Wait for iframe's internal page to fully load
  await iframe.waitForFunction(
    () => document.readyState === 'complete',
    { timeout: 15000 }
  );
  // Optionally wait a bit more for things like sprites or assets to finish rendering
  await page.waitForTimeout(3000); // optional delay
  // Screenshot the visible part of the page
  await page.screenshot({ path: screenshotPath });
  await browser.close();
}


// Serve raw .sb3 project
router.get('/projectSb3/:id', (req, res) => {
  const { id } = req.params;
  const projectPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).send('Project not found');
  }

  res.setHeader('Content-Type', 'application/x.scratch.sb3');
  res.sendFile(projectPath);
});

// Save project and generate screenshot
router.post('/:id/save', upload.single('project'), async (req, res) => {
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

    // Generate embed HTML
    const turboWarpEmbedUrl = `https://myscratchblocks.ddns.net/scratch-gui/embed#${id}?admin=True`;
    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>TurboWarp Embed Screenshot</title>
  <style>
    body, html { margin:0; padding:0; overflow:hidden; background:#fff; }
    iframe { border:none; width:480px; height:360px; }
  </style>
</head>
<body>
  <iframe src="${turboWarpEmbedUrl}" allowfullscreen></iframe>
</body>
</html>`;

    fs.writeFileSync(tempHtmlPath, htmlContent);

    // Take screenshot using Puppeteer
    await screenshotWithBrowser(tempHtmlPath, screenshotPath);

    const screenshotBuffer = fs.readFileSync(screenshotPath);
    newZip.addFile(`${id}.png`, screenshotBuffer);

    newZip.writeZip(destPath);

    // Cleanup
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
