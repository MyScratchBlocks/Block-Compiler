const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const AdmZip = require('adm-zip');
const { Readable } = require('stream');
const fsSync = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const SERVER_URL = 'https://scratchgems.onrender.com';

let uploadStatus = {};
let downloadStatus = {
  success: false,
  error: null,
  extractedFiles: [],
  logs: [],
};

function log(tag, message, level = 'info') {
  const timestamp = new Date().toISOString();
  const label = `[${tag.toUpperCase()}]`;
  const formatted = `[${timestamp}] ${label} ${message}`;
  downloadStatus.logs.push(formatted);
  console.log(formatted); // also print to console
}

function getMimeType(filename) {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'txt': return 'text/plain';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'sb3': return 'application/x.scratch.sb3';
    case 'zip': return 'application/zip';
    case 'json': return 'application/json';
    case 'html': return 'text/html';
    default: return 'application/octet-stream';
  }
}

function createMultipartStream(filePath, fieldName, boundary) {
  const fileName = path.basename(filePath);
  const mimeType = getMimeType(fileName);

  const headers = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const fileStream = fsSync.createReadStream(filePath);

  return Readable.from((async function* () {
    yield headers;
    for await (const chunk of fileStream) yield chunk;
    yield footer;
  })());
}

function getContentLength(filePath, boundary) {
  const stats = fsSync.statSync(filePath);
  const fileSize = stats.size;
  const fileName = path.basename(filePath);
  const mimeType = getMimeType(fileName);
  const headerLength = Buffer.byteLength(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: ${mimeType}\r\n\r\n`
  );
  const footerLength = Buffer.byteLength(`\r\n--${boundary}--\r\n`);
  return headerLength + fileSize + footerLength;
}

async function uploadSB3Files() {
  try {
    await fs.access(UPLOAD_DIR);
  } catch {
    log('upload', 'UPLOAD_DIR does not exist.');
    return;
  }

  let files = [];
  try {
    files = (await fs.readdir(UPLOAD_DIR)).filter(f => f.toLowerCase().endsWith('.sb3'));
  } catch (err) {
    log('upload', `Error reading upload directory: ${err.message}`, 'error');
    return;
  }

  if (files.length === 0) {
    log('upload', 'No .sb3 files to upload.');
    return;
  }

  log('upload', `Uploading ${files.length} .sb3 file(s)...`);
  uploadStatus = {};

  await Promise.all(files.map(async (file) => {
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
  }));

  const allSuccessful = Object.values(uploadStatus).every(s => s.status === 'success');
  if (allSuccessful) {
    log('upload', 'All files uploaded successfully. Cleaning up and downloading new files...');
    await deleteAllFilesInFolder(UPLOAD_DIR);
    await downloadAndExtractNewUploadsAdmZip();
  } else {
    log('upload', 'One or more files failed to upload.', 'error');
  }
}

async function deleteAllFilesInFolder(folderPath) {
  try {
    const files = await fs.readdir(folderPath);
    await Promise.all(files.map(async file => {
      const fullPath = path.join(folderPath, file);
      const stat = await fs.lstat(fullPath);
      if (stat.isDirectory()) {
        await deleteFolderRecursive(fullPath);
      } else {
        await fs.unlink(fullPath);
        log('fs', `Deleted file: ${fullPath}`);
      }
    }));
    log('fs', 'All files deleted from UPLOAD_DIR.');
  } catch (err) {
    log('fs', `Error deleting files: ${err.message}`, 'error');
  }
}

async function deleteFolderRecursive(folderPath) {
  try {
    const files = await fs.readdir(folderPath);
    await Promise.all(files.map(async file => {
      const curPath = path.join(folderPath, file);
      const stat = await fs.lstat(curPath);
      if (stat.isDirectory()) {
        await deleteFolderRecursive(curPath);
      } else {
        await fs.unlink(curPath);
      }
    }));
    await fs.rmdir(folderPath);
    log('fs', `Deleted folder: ${folderPath}`);
  } catch (err) {
    log('fs', `Error deleting folder: ${err.message}`, 'error');
  }
}

async function downloadAndExtractNewUploadsAdmZip() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    downloadStatus = { success: false, error: null, extractedFiles: [], logs: [] };

    log('download', 'Requesting uploads.zip...');
    const response = await axios({
      method: 'GET',
      url: `${SERVER_URL}/uploads/files`,
      responseType: 'arraybuffer',
    });

    const zipBuffer = Buffer.from(response.data);
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    if (entries.length === 0) {
      log('extract', 'No files found in uploads.zip', 'error');
      downloadStatus.error = 'No files found in uploads.zip';
      return;
    }

    const extractedFileNames = [];

    await Promise.all(entries.map(async entry => {
      if (entry.isDirectory) return;
      const filename = path.basename(entry.entryName);
      const outputPath = path.join(UPLOAD_DIR, filename);
      await fs.writeFile(outputPath, entry.getData());
      extractedFileNames.push(filename);
      log('extract', `Extracted ${filename}`);
    }));

    // Delete old files not extracted this time
    const currentFiles = await fs.readdir(UPLOAD_DIR);
    await Promise.all(currentFiles.map(async file => {
      if (!extractedFileNames.includes(file)) {
        const fullPath = path.join(UPLOAD_DIR, file);
        const stat = await fs.lstat(fullPath);
        if (stat.isFile()) {
          await fs.unlink(fullPath);
          log('cleanup', `Deleted old file: ${file}`);
        }
      }
    }));

    downloadStatus.extractedFiles = extractedFileNames;
    downloadStatus.success = true;
    log('cleanup', 'Extraction and cleanup complete.');
  } catch (err) {
    downloadStatus.success = false;
    downloadStatus.error = err.message;
    log('download', `Error downloading or extracting uploads.zip: ${err.message}`, 'error');
  }
}

router.get('/status', (req, res) => {
  res.json({
    uploadStatus,
    downloadStatus,
  });
});

router.get('/download-uploads-zip', async (req, res) => {
  const zipPath = path.join(UPLOAD_DIR, 'uploads.zip');
  try {
    await fs.access(zipPath);
    res.download(zipPath, 'uploads.zip');
  } catch {
    res.status(404).send('uploads.zip not found');
  }
});

async function startUploadLoop() {
  while (true) {
    let files;
    try {
      files = await fs.readdir(UPLOAD_DIR);
    } catch (err) {
      files = [];
    }

    if (!files || files.length === 0) {
      log('loop', 'No files found in UPLOAD_DIR, downloading from server...');
      await downloadAndExtractNewUploadsAdmZip();
    } else {
      await uploadSB3Files();
    }

    await new Promise(resolve => setTimeout(resolve, 60000)); // 5 seconds delay between loops
  }
}

startUploadLoop().catch(err => {
  console.error('Upload loop failed:', err);
  log('backup', err.message, 'error');
});

module.exports = router;
