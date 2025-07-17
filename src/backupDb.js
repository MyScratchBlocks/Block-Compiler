const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { Readable } = require('stream');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const SERVER_URL = 'https://scratchgems.onrender.com';

let uploadStatus = {};

// Create multipart/form-data stream manually
function createMultipartStream(filePath, fieldName, boundary) {
  const fileName = path.basename(filePath);
  const headers = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const fileStream = fs.createReadStream(filePath);

  return Readable.from((async function* () {
    yield headers;
    for await (const chunk of fileStream) yield chunk;
    yield footer;
  })());
}

// Calculate content length for the full multipart body
function getContentLength(filePath, boundary) {
  const fileSize = fs.statSync(filePath).size;
  const fileName = path.basename(filePath);
  const headerLength = Buffer.byteLength(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footerLength = Buffer.byteLength(`\r\n--${boundary}--\r\n`);
  return headerLength + fileSize + footerLength;
}

// Upload .sb3 files
async function uploadSB3Files() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) {
      console.log('[upload] No uploads directory found.');
      return;
    }

    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.sb3'));
    if (files.length === 0) {
      console.log('[upload] No .sb3 files found.');
      return;
    }

    console.log(`[upload] Found ${files.length} file(s).`);

    uploadStatus = {}; // Reset status

    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      const boundary = '----ScratchGemsBoundary';
      const contentLength = getContentLength(filePath, boundary);
      const stream = createMultipartStream(filePath, 'file', boundary);

      try {
        const response = await axios.post(`${SERVER_URL}/upload/compiler`, stream, {
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': contentLength,
          },
          maxBodyLength: Infinity,
        });

        uploadStatus[file] = { status: 'success', response: response.data };
        console.log(`[upload] ${file}: SUCCESS`);
      } catch (err) {
        uploadStatus[file] = { status: 'failed', error: err.message };
        console.error(`[upload] ${file}: FAILED - ${err.message}`);
      }
    }

    const allSuccessful = Object.values(uploadStatus).every(s => s.status === 'success');

    if (allSuccessful) {
      console.log('[upload] All uploads successful. Cleaning up and downloading new data...');
      deleteAllFilesInFolder(UPLOAD_DIR);
      await downloadAndExtractNewUploadsAdmZip();
    }
  } catch (err) {
    console.error('[upload] Unexpected error:', err.message);
  }
}

// Delete all files (and subfolders) in folder
function deleteAllFilesInFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(file => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    console.log('[fs] Deleted all files in uploads folder.');
  }
}

// Recursively delete a folder and its contents
function deleteFolderRecursive(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(file => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
    console.log(`[fs] Deleted folder: ${folderPath}`);
  }
}

// Download and extract all .sb3 files from uploads.zip
async function downloadAndExtractNewUploadsAdmZip() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    const response = await axios({
      method: 'GET',
      url: `${SERVER_URL}/uploads/files`,
      responseType: 'arraybuffer',
    });

    const zipBuffer = Buffer.from(response.data);

    // Save the zip file temporarily
    const zipPath = path.join(UPLOAD_DIR, 'uploads.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    console.log('[download] Saved uploads.zip');

    // Extract .sb3 files
    const zip = new AdmZip(zipBuffer);
    const sb3Entries = zip.getEntries().filter(entry => entry.entryName.endsWith('.sb3'));

    if (sb3Entries.length === 0) {
      console.warn('[extract] No .sb3 files found in the zip.');
      return;
    }

    for (const entry of sb3Entries) {
      const outputPath = path.join(UPLOAD_DIR, path.basename(entry.entryName));
      fs.writeFileSync(outputPath, entry.getData());
      console.log(`[extract] Extracted ${entry.entryName}`);
    }

    // Delete uploads.zip
    fs.unlinkSync(zipPath);
    console.log('[cleanup] Deleted uploads.zip');
  } catch (err) {
    console.error('[download] Error downloading or extracting files:', err.message);
  }
}

// Route to download uploads.zip (optional utility)
router.get('/download-uploads-zip', (req, res) => {
  const zipPath = path.join(UPLOAD_DIR, 'uploads.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('uploads.zip not found');
  }
  res.download(zipPath, 'uploads.zip', err => {
    if (err) {
      console.error('Error sending uploads.zip:', err);
      res.status(500).send('Error sending uploads.zip');
    }
  });
});

// Route to show upload status
router.get('/status', (req, res) => {
  res.json(uploadStatus);
});

// Run the upload job every 10 seconds (for testing)
setInterval(uploadSB3Files, 10 * 1000);

module.exports = router;
