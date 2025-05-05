const express = require('express');
const axios = require('axios');
const router = express.Router();

const GITHUB_API_URL = 'https://api.github.com/repos/CodeSnap-ORG/Editor-Compiler/contents/uploads';
const THUMBNAIL_URL = 'https://codesnap-org.github.io/projects/static/assets/018f79360b10f9f2c317d648d61a0eb2.svg';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    const response = await axios.get(GITHUB_API_URL, {
      headers: { 'User-Agent': 'CodeSnap-Agent' }
    });

    const sb3Files = response.data.filter(file => file.name.endsWith('.sb3'));

    const projects = sb3Files.map(file => ({
      name: file.name.replace(/\.sb3$/, ''),
      image: THUMBNAIL_URL,
      genre: 'games',
      link: `https://codesnap-org.github.io/projects/#${file.name}`
    }));

    res.json({ projects });
  } catch (error) {
    console.error('Error fetching from GitHub:', error.message);
    res.status(500).json({ error: 'Failed to fetch projects from GitHub' });
  }
});

module.exports = router;
