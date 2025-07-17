const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Readable } = require('stream');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage', 'uploads');
const SERVER_URL = 'https://scratchgems.onrender.com';

let uploadStatus = {};

// Manually create multipart/form-data stream
function createMultipartStream(filePath, fieldName, boundary) {
  const fileName = path.basename(filePath);
  const headers = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const fileStream = fs.createReadStream(filePath);
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  return Readable.from((async function* () {
    yield headers;
    for await (const chunk of fileStream) yield chunk;
    yield footer;
  })());
}

function getContentLength(filePath, boundary) {
  const fileSize = fs.statSync(filePath).size;
  const fileName = path.basename(filePath);
  const header = Buffer.byteLength(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const footer = Buffer.byteLength(`\r\n--${boundary}--\r\n`);
  return header + fileSize + footer;
}

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

    for (const file of files) {
      const filePath = path.join(UPLOAD_DIR, file);
      const boundary = '----ScratchGemsBoundary';
      const contentLength = getContentLength(filePath, boundary);
      const stream = createMultipartStream(filePath, 'file', boundary);

      try {
        const response = await axios.post(`${SERVER_URL}/upload/compiler`, stream, {
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': contentLength
          },
          maxBodyLength: Infinity,
        });

        uploadStatus[file] = {
          status: 'success',
          response: response.data
        };

        console.log(`[upload] ${file}: SUCCESS`);
      } catch (err) {
        uploadStatus[file] = {
          status: 'failed',
          error: err.message
        };

        console.error(`[upload] ${file}: FAILED - ${err.message}`);
      }
    }

    const allSuccessful = Object.values(uploadStatus).every(status => status.status === 'success');

    if (allSuccessful) {
      console.log('[upload] All uploads successful. Cleaning up and downloading new data...');
      deleteFolderRecursive(UPLOAD_DIR);
      await downloadNewUploads();
    }

  } catch (err) {
    console.error('[upload] Unexpected error:', err.message);
  }
}

// Recursively delete a folder using fs only
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
    console.log('[fs] Deleted uploads folder.');
  }
}

async function downloadNewUploads() {
  try {
    const outDir = UPLOAD_DIR;
    fs.mkdirSync(outDir, { recursive: true });

    const outPath = path.join(outDir, 'new_files.zip');
    const writer = fs.createWriteStream(outPath);

    const response = await axios({
      method: 'GET',
      url: `${SERVER_URL}/uploads/files`,
      responseType: 'stream',
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    console.log('[download] Downloaded new_files.zip to uploads.');
  } catch (err) {
    console.error('[download] Error downloading files:', err.message);
  }
}

// Express route to show upload status
router.get('/status', (req, res) => {
  res.json(uploadStatus);
});

// Schedule every 1 minute
setInterval(uploadSB3Files, 60 * 1000);

module.exports = router;
