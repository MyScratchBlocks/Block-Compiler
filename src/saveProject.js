const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
if (!fs.existsSync(LOCAL_UPLOAD_PATH)) fs.mkdirSync(LOCAL_UPLOAD_PATH, { recursive: true });

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

// Save project and update with uploaded thumbnail
const multiUpload = upload.fields([
  { name: 'project', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]);

router.post('/:id/save', multiUpload, async (req, res) => {
  const { id } = req.params;
  const sb3File = req.files?.project?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];
  const { projectName } = req.body;
  const destPath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  if (!sb3File) return res.status(400).json({ error: 'No project file provided' });
  if (!fs.existsSync(destPath)) return res.status(404).json({ error: 'Original project not found' });

  try {
    const existingZip = new AdmZip(destPath);
    const dataEntry = existingZip.getEntry('data.json');
    const comments = existingZip.getEntry('comments.json');
    if (!dataEntry) throw new Error('Missing data.json in existing project');

    const dataJson = JSON.parse(dataEntry.getData().toString());
    const cJson = JSON.parse(comments.getData().toString());

    // Update project title if provided
    if (typeof projectName === 'string') {
      dataJson.title = projectName;
    }

    const uploadedZip = new AdmZip(sb3File.path);
    const newZip = new AdmZip();

    // Add metadata files
    newZip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));
    newZip.addFile('comments.json', Buffer.from(JSON.stringify(cJson, null, 2)));

    // Add only project.json and media assets (excluding old .png screenshots)
    uploadedZip.getEntries().forEach(entry => {
      const name = entry.entryName;
      const isAsset = /\.(png|svg|wav|mp3)$/.test(name);
      const isScreenshot = /\.png$/.test(name);
      const isProjectJson = name === 'project.json';

      if (isProjectJson || (isAsset && !isScreenshot)) {
        newZip.addFile(name, entry.getData());
      }
    });

    // Add the new thumbnail as {id}.png
    if (thumbnailFile) {
      const thumbnailBuffer = fs.readFileSync(thumbnailFile.path);
      newZip.addFile(`${id}.png`, thumbnailBuffer);
      fs.unlinkSync(thumbnailFile.path);
    }

    // Save new .sb3 file
    newZip.writeZip(destPath);
    fs.unlinkSync(sb3File.path);

    res.json({ message: 'Project saved with thumbnail', id, updatedTitle: dataJson.title });
  } catch (err) {
    console.error('Error saving project:', err);
    if (sb3File && fs.existsSync(sb3File.path)) fs.unlinkSync(sb3File.path);
    if (thumbnailFile && fs.existsSync(thumbnailFile.path)) fs.unlinkSync(thumbnailFile.path);
    res.status(500).json({ error: 'Failed to save project', details: err.message });
  }
});

module.exports = router;
