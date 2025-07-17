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
let downloadStatus = {
  success: false,
  error: null,
  extractedFiles: [],
  logs: [], // add logs array
};

// Logging helper with timestamp
function log(tag, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const label = `[${tag.toUpperCase()}]`;
  const formatted = `[${timestamp}] ${label} ${message}`;
  downloadStatus.logs.push(formatted);  // push logs into logs array
}

// Multipart stream
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

// Calculate multipart content length
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
      log('upload', 'UPLOAD_DIR does not exist.');
      return;
    }

    const files = fs.readdirSync(UPLOAD_DIR)
    if (files.length === 0) {
      log('upload', 'No .sb3 files to upload.');
      return;
    }

    log('upload', `Uploading ${files.length} file(s)...`);
    uploadStatus = {};

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
        log('upload', `${file} uploaded successfully.`);
      } catch (err) {
        uploadStatus[file] = { status: 'failed', error: err.message };
        log('upload', `${file} failed to upload: ${err.message}`, 'error');
      }
    }

    const allSuccessful = Object.values(uploadStatus).every(s => s.status === 'success');

    if (allSuccessful) {
      log('upload', 'All files uploaded successfully. Cleaning up and downloading new files...');
      deleteAllFilesInFolder(UPLOAD_DIR);
      await downloadAndExtractNewUploadsAdmZip();
    } else {
      log('upload', 'One or more files failed to upload.', 'error');
    }
  } catch (err) {
    log('upload', `Unexpected error: ${err.message}`, 'error');
  }
}

// Delete all files in a folder (not the folder itself)
function deleteAllFilesInFolder(folderPath) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach(file => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        deleteFolderRecursive(curPath);
      } else {
        fs.unlinkSync(curPath);
        log('fs', `Deleted file: ${curPath}`);
      }
    });
    log('fs', 'All files deleted from UPLOAD_DIR.');
  }
}

// Recursively delete a folder
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
    log('fs', `Deleted folder: ${folderPath}`);
  }
}

// Download and extract .sb3 files
async function downloadAndExtractNewUploadsAdmZip() {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    downloadStatus = { success: false, error: null, extractedFiles: [] };

    log('download', 'Requesting uploads.zip...');
    const response = await axios({
      method: 'GET',
      url: `${SERVER_URL}/uploads/files`,
      responseType: 'arraybuffer',
    });

    const zipBuffer = Buffer.from(response.data);
    const zipPath = path.join(UPLOAD_DIR, 'uploads.zip');
    fs.writeFileSync(zipPath, zipBuffer);
    log('download', 'Saved uploads.zip');

    const zip = new AdmZip(zipBuffer);
    const sb3Entries = zip.getEntries()
    if (sb3Entries.length === 0) {
      log('extract', 'No .sb3 files found in uploads.zip', 'error');
      downloadStatus.error = 'No .sb3 files found in uploads.zip';
      return;
    }

    for (const entry of sb3Entries) {
      const outputPath = path.join(UPLOAD_DIR, path.basename(entry.entryName));
      fs.writeFileSync(outputPath, entry.getData());
      downloadStatus.extractedFiles.push(entry.entryName);
      log('extract', `Extracted ${entry.entryName}`);
    }

    fs.unlinkSync(zipPath);
    log('cleanup', 'Deleted uploads.zip after extraction.');

    downloadStatus.success = true;
  } catch (err) {
    downloadStatus.success = false;
    downloadStatus.error = err.message;
    log('download', `Error downloading or extracting uploads.zip: ${err.message}`, 'error');
  }
}

// Status route with both upload and download results
router.get('/status', (req, res) => {
  res.json({
    uploadStatus,
    downloadStatus,
  });
});

// Optional route to serve uploads.zip if needed
router.get('/download-uploads-zip', (req, res) => {
  const zipPath = path.join(UPLOAD_DIR, 'uploads.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('uploads.zip not found');
  }
  res.download(zipPath, 'uploads.zip', err => {
    if (err) {
      log('express', `Error sending uploads.zip: ${err.message}`, 'error');
      res.status(500).send('Error sending uploads.zip');
    }
  });
});

while (true) {
  await uploadSB3Files();
}

module.exports = router;
