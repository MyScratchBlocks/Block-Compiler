const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const router = express.Router();

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const THUMBNAIL_URL = 'https://myscratchblocks.github.io/images/No%20Cover%20Available.png';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    if (!fs.existsSync(LOCAL_UPLOAD_DIR)) {
      return res.status(404).json({ error: 'Upload directory not found' });
    }

    const files = fs.readdirSync(LOCAL_UPLOAD_DIR);
    const sb3Files = files.filter(file => file.endsWith('.sb3'));
    const projects = [];

    for (const file of sb3Files) {
      const filePath = path.join(LOCAL_UPLOAD_DIR, file);

      try {
        const zip = new AdmZip(filePath);
        const entry = zip.getEntry('data.json');

        if (!entry) {
          console.warn(`Missing data.json in ${file}`);
          continue;
        }

        const data = JSON.parse(entry.getData().toString('utf8'));
        if(!data.visibility === 'unshared') {
          
          projects.push({
            id: data.id || file.replace(/\.sb3$/, ''),
            name: data.title || 'Untitled',
            image: THUMBNAIL_URL,
            author: data.author?.username || 'Unknown User',
            link: `https://myscratchblocks.github.io/projects#${data.id || file.replace(/\.sb3$/, '')}`
          });
          

      } catch (err) {
        console.warn(`Skipping ${file} due to error:`, err.message);
        continue;
      }
    }

    res.json({ projects });
  } catch (error) {
    console.error('Error fetching local projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch local projects' });
  }
});

module.exports = router;
