const express = require('express');
const router = express.Router();

let projects = [];

// GET /api/projects
router.get('/api/projects', (req, res) => {
  res.json({ projects });
});

// PUT /api/projects
router.post('/api/projects', (req, res) => {
  const { name, thumbnail, genre, link } = req.body;

  const project = {
    name,
    image: thumbnail,
    genre,
    link: link
  };

  projects.push(project);
  res.status(201).json({ message: 'Project added', project });
});

module.exports = router;
