const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const AdmZip = require('adm-zip');

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads'); // adjust as needed
const THUMBNAIL_URL = 'https://codesnap-org.github.io/projects/static/assets/018f79360b10f9f2c317d648d61a0eb2.svg';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    const files = fs.readdirSync(LOCAL_UPLOAD_DIR);
    const sb3Files = files.filter(file => file.endsWith('.sb3'));
    const projects = [];

    for (const file of sb3Files) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, file);
      try {
        const zip = new AdmZip(filePath);
        const dataJsonEntry = zip.getEntry('data.json');
        if (!dataJsonEntry) continue;

        const data = JSON.parse(dataJsonEntry.getData().toString('utf8'));

        projects.push({
          name: data.title || file.replace(/\.sb3$/, ''),
          image: THUMBNAIL_URL,
          author: data.author.username,
          link: `https://myscratchblocks.github.io/projects#${data.id}`
        });
      } catch (err) {
        console.warn(`Skipping ${file} due to error:`, err.message);
      }
    }

    res.json({ projects });
  } catch (error) {
    console.error('Error reading local projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch local projects' });
  }
});

module.exports = router;
