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
    try {
      await fs.access(LOCAL_UPLOAD_DIR, fs.constants.F_OK);
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Upload directory not found' });
      }
      throw dirError;
    }

    const files = await fs.readdir(LOCAL_UPLOAD_DIR);
    const sb3Files = files.filter(file => file.toLowerCase().endsWith('.sb3'));

    const projectPromises = sb3Files.map(async (file) => {
      const filePath = path.join(LOCAL_UPLOAD_DIR, file);
      const projectId = file.replace(/\.sb3$/i, '');

      try {
        const zip = new AdmZip(filePath);
        const entry = zip.getEntry('data.json');

        if (!entry) {
          console.warn(`[WARN] Missing data.json in ${file}`);
          return null;
        }

        let data;
        try {
          const rawData = entry.getData().toString('utf8');
          data = JSON.parse(rawData);
        } catch (parseError) {
          console.warn(`[WARN] Failed to parse data.json in ${file}: ${parseError.message}`);
          return null;
        }

        if (data.visibility == 'visible') {
          const favourites = Number(data.stats?.favourites || 0);
          const loves = Number(data.stats?.loves || 0);
          const views = Number(data.stats?.views || 0);
          const popularity = favorites + loves + views;

          return {
            id: data.id || projectId,
            name: data.title || 'Untitled',
            image: data.image || '',
            author: data.author?.username || 'Unknown User',
            link: `https://myscratchblocks.github.io/projects/#${data.id || projectId}`,
            popularity
          };
        }
        return null;
      } catch (zipError) {
        console.warn(`[WARN] Skipping ${file} due to error: ${zipError.message}`);
        return null;
      }
    });

    const results = await Promise.all(projectPromises);
    const filteredProjects = results.filter(project => project !== null);

    // Sort by popularity (favourites + loves) in descending order
    filteredProjects.sort((a, b) => b.popularity - a.popularity);

    // Return full list including popularity
    res.json({ projects: filteredProjects });
  } catch (error) {
    console.error('[ERROR] Failed to fetch local projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch local projects' });
  }
});

module.exports = router;
