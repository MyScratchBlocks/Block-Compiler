const express = require('express');
const path = require('path');
const axios = require('axios');
const router = express.Router();
const AdmZip = require('adm-zip');

const GITHUB_API_URL = 'https://api.github.com/repos/MyScratchBlocks/Editor-Compiler/contents/uploads';
const THUMBNAIL_URL = 'https://codesnap-org.github.io/projects/static/assets/018f79360b10f9f2c317d648d61a0eb2.svg';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    const response = await axios.get(GITHUB_API_URL, {
      headers: { 
        'User-Agent': 'MyScratchBlocks-Agent',
        'Authorization': `token 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`
      }
    });

    const allFiles = response.data;

    // Filter .sb3 project files
    const sb3Files = allFiles.filter(file => file.name.endsWith('.sb3'));

    const projects = [];

    for (const file of sb3Files) {
      try {
        // Download the .sb3 file
        const fileResponse = await axios.get(file.download_url, { responseType: 'arraybuffer' });
        const zip = new AdmZip(fileResponse.data);

        // Try to find and read data.json
        const dataJsonEntry = zip.getEntry('data.json');
        if (!dataJsonEntry) continue;

        const data = JSON.parse(dataJsonEntry.getData().toString('utf8'));

        // Add to projects list
        projects.push({
          name: data.title || file.name.replace(/\.sb3$/, ''),
          image: THUMBNAIL_URL,
          genre: 'games',
          link: `https://myscratchblocks.github.io/projects#${data.id}`
        });
      } catch (err) {
        console.warn(`Skipping ${file.name} due to error:`, err.message);
      }
    }

    res.json({ projects });
  } catch (error) {
    console.error('Error fetching from GitHub:', error.message);

    if (error.response && error.response.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch projects from GitHub' });
    }
  }
});

module.exports = router;
