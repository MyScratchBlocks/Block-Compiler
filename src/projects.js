const express = require('express');
const axios = require('axios');
const router = express.Router();

const GITHUB_API_URL = 'https://api.github.com/repos/CodeSnap-ORG/Editor-Compiler/contents/uploads';
const THUMBNAIL_URL = 'https://codesnap-org.github.io/projects/static/assets/018f79360b10f9f2c317d648d61a0eb2.svg';

// GET /api/projects
router.get('/api/projects', async (req, res) => {
  try {
    const response = await axios.get(GITHUB_API_URL, {
      headers: { 
        'User-Agent': 'CodeSnap-Agent', // Ensure the user-agent is included
        'Authorization': `token ${process.env.GITHUB_TOKEN}`
      }
    });

    // Log the response for debugging purposes
    console.log(response.data);

    // Filter only .sb3 files
    const sb3Files = response.data.filter(file => file.name.endsWith('.sb3'));

    // Map over the files to create the projects array
    const projects = sb3Files.map(file => ({
      name: file.name.replace(/\.sb3$/, ''), // Remove the file extension
      image: THUMBNAIL_URL, // Static thumbnail for now
      genre: 'games', // Static genre for now
      link: `https://codesnap-org.github.io/projects/?project_url=https://block-compiler-codesnap.onrender.com/projects/${file.name.replace(/\.sb3$/, '')}` // Link to the project
    }));

    // Send the projects array as a JSON response
    res.json({ projects });
  } catch (error) {
    // Log the specific error message for debugging
    console.error('Error fetching from GitHub:', error.message);

    // Check if it's a GitHub rate limit error
    if (error.response && error.response.status === 403 && error.response.headers['x-ratelimit-remaining'] === '0') {
      res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    } else {
      res.status(500).json({ error: 'Failed to fetch projects from GitHub' });
    }
  }
});

module.exports = router;
