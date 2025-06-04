const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');
const LOCAL_ASSET_PATH = path.join(__dirname, '..', 'local_storage/assets');

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
    if (!dataEntry) throw new Error('Missing data.json');
    const dataJson = JSON.parse(dataEntry.getData().toString());

    if (typeof projectName === 'string') dataJson.title = projectName;

    const uploadedZip = new AdmZip(sb3Blob.path);
    const newZip = new AdmZip();
    newZip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));

    uploadedZip.getEntries().forEach(entry => {
      const name = entry.entryName;
      if (name === 'project.json' || /\.(png|svg|wav|mp3)$/.test(name)) {
        newZip.addFile(name, entry.getData());
      }
      if (/\.(png|svg|wav|mp3)$/.test(name)) {
        const assetPath = path.join(LOCAL_ASSET_PATH, name);
        if (fs.existsSync(assetPath)) fs.unlinkSync(assetPath);
        fs.writeFileSync(assetPath, entry.getData());
      }
    });

    newZip.writeZip(destPath);
    fs.unlinkSync(sb3Blob.path);

    res.json({ message: 'Project updated', id, updatedTitle: dataJson.title });
  } catch (err) {
