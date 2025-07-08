const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const AdmZip = require('adm-zip');

const router = express.Router();

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const THUMBNAIL_URL = 'https://myscratchblocks.github.io/images/No%20Cover%20Available.png';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    // Verify the uploads directory exists
    try {
      await fs.access(LOCAL_UPLOAD_DIR);
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Upload directory not found' });
      }
      throw dirError;
    }

    // Read and filter .sb3 files
    const files = await fs.readdir(LOCAL_UPLOAD_DIR);
    const sb3Files = files.filter(file => file.toLowerCase().endsWith('.sb3'));

    const projects = await Promise.all(sb3Files.map(async (file) => {
      const filePath = path.join(LOCAL_UPLOAD_DIR, file);
      const projectId = file.replace(/\.sb3$/i, '');

      try {
        const zip = new AdmZip(filePath);
        const dataEntry = zip.getEntry('data.json');
        if (!dataEntry) {
          console.warn(`[WARN] Missing data.json in ${file}`);
          return null;
        }

        let data;
        try {
          const rawData = dataEntry.getData().toString('utf8');
          data = JSON.parse(rawData);
        } catch (parseError) {
          console.warn(`[WARN] Failed to parse data.json in ${file}: ${parseError.message}`);
          return null;
        }

        if (data.visibility === 'unshared') return null;

        return {
          id: data.id || projectId,
          name: data.title || 'Untitled',
          image: data.image || THUMBNAIL_URL,
          author: data.author?.username || 'Unknown User',
          link: `https://myscratchblocks.github.io/projects#${data.id || projectId}`
        };
      } catch (zipError) {
        console.warn(`[WARN] Failed to process ${file}: ${zipError.message}`);
        return null;
      }
    }));

    const visibleProjects = projects.filter(Boolean);
    res.json({ projects: visibleProjects });

  } catch (error) {
    console.error('[ERROR] Failed to fetch local projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch local projects' });
  }
});

module.exports = router;
