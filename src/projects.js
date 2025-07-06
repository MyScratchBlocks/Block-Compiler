const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Use fs.promises for async operations
const AdmZip = require('adm-zip'); // AdmZip is still largely synchronous internally

const router = express.Router();

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const THUMBNAIL_URL = 'https://myscratchblocks.github.io/images/No%20Cover%20Available.png';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    // Asynchronously check if directory exists and is accessible
    try {
      await fs.access(LOCAL_UPLOAD_DIR, fs.constants.F_OK);
    } catch (dirError) {
      if (dirError.code === 'ENOENT') {
        return res.status(404).json({ error: 'Upload directory not found' });
      }
      throw dirError; // Re-throw other directory access errors
    }

    const files = await fs.readdir(LOCAL_UPLOAD_DIR); // Asynchronously read directory
    const sb3Files = files.filter(file => file.toLowerCase().endsWith('.sb3'));
    const projects = [];

    // Use Promise.all for concurrent processing of .sb3 files
    // This will still run AdmZip synchronously for each file, but concurrently
    const projectPromises = sb3Files.map(async (file) => {
      const filePath = path.join(LOCAL_UPLOAD_DIR, file);
      const projectId = file.replace(/\.sb3$/i, ''); // Consider refining this

      try {
        const zip = new AdmZip(filePath); // This is synchronous and can be a bottleneck
        const entry = zip.getEntry('data.json');

        if (!entry) {
          console.warn(`[WARN] Missing data.json in ${file}`);
          return null; // Return null for files to skip
        }

        let data;
        try {
          const rawData = entry.getData().toString('utf8'); // Synchronous
          data = JSON.parse(rawData);
        } catch (parseError) {
          console.warn(`[WARN] Failed to parse data.json in ${file}: ${parseError.message}`);
          return null;
        }

        if (data.visibility !== 'unshared') {
          return {
            id: data.id || projectId,
            name: data.title || 'Untitled',
            image: data.image || THUMBNAIL_URL,
            author: data.author?.username || 'Unknown User',
            link: `https://myscratchblocks.github.io/projects#${data.id || projectId}`
          };
        }
        return null; // Return null if visibility is 'unshared'
      } catch (zipError) {
        console.warn(`[WARN] Skipping ${file} due to error: ${zipError.message}`);
        return null; // Return null for files with errors
      }
    });

    const results = await Promise.all(projectPromises); // Wait for all promises to resolve
    // Filter out the nulls from skipped projects
    const filteredProjects = results.filter(project => project !== null);

    res.json({ projects: filteredProjects });
  } catch (error) {
    console.error('[ERROR] Failed to fetch local projects:', error.message);
    res.status(500).json({ error: 'Failed to fetch local projects' });
  }
});

module.exports = router;
