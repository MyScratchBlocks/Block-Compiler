const express = require('express');
const path = require('path');
const axios = require('axios');
const router = express.Router();

const GITHUB_API_URL = 'https://api.github.com/repos/CodeSnap-ORG/Editor-Compiler/contents/uploads';
const THUMBNAIL_URL = 'https://codesnap-org.github.io/projects/static/assets/018f79360b10f9f2c317d648d61a0eb2.svg';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    const response = await axios.get(GITHUB_API_URL, {
      headers: { 
        'User-Agent': 'CodeSnap-Agent',
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
      }
    });

    const allFiles = response.data;

    // Filter .sb3 project files
    const sb3Files = allFiles.filter(file => file.name.endsWith('.sb3'));

    // Filter files with no extension (used for naming)
    const fWE = allFiles.filter(file => !path.extname(file.name));

    // Map each sb3 file to a project, using name from the matching fWE file if it exists
    const projects = sb3Files.map(file => {
      const baseName = file.name.replace(/\.sb3$/, '');
      const matchingFWE = fWE.find(f => f.name === baseName);

      return {
        name: matchingFWE ? matchingFWE.name : baseName,
        image: THUMBNAIL_URL,
        genre: 'games',
        link: `https://codesnap-org.github.io/projects/?project_url=https://block-compiler-codesnap.onrender.com/projects/${file.name}`
      };
    });

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
