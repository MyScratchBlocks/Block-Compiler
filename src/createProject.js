const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db'); // Neon DB connection

const router = express.Router();

function getNextFileNumber() {
  const files = fs.readdirSync(path.join(__dirname, '..', 'local_storage/uploads') || [])
    .filter(name => name.endsWith('.sb3'))
    .map(name => parseInt(name))
    .filter(n => !isNaN(n));
  return files.length ? Math.max(...files) + 1 : 1;
}

router.post('/', async (req, res) => {
  try {
    const fileNum = getNextFileNumber();
    const username = req.body.username;

    if (typeof username !== 'string' || username.includes("MyScratchBlocks-")) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    const dataJson = {
      id: fileNum,
      title: 'Untitled Project',
      description: '',
      instructions: '',
      visibility: 'unshared',
      public: true,
      comments_allowed: true,
      is_published: true,
      author: {
        id: Math.floor(Math.random() * 1e9),
        username,
        scratchteam: false,
        history: { joined: '1900-01-01T00:00:00.000Z' },
        profile: { id: null, images: {} }
      },
      image: `local_assets/${fileNum}_480x360.png`,
      images: {},
      history: {
        created: now,
        modified: now,
        shared: now
      },
      stats: { views: 0, loves: 0, favorites: 0, remixes: 0 },
      remix: { parent: null, root: null },
      project_token: token
    };

    // Save to Neon DB
    const result = await pool.query(
      `INSERT INTO projects (username, token, title, description, visibility, data)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [
        username,
        token,
        dataJson.title,
        dataJson.description,
        dataJson.visibility,
        dataJson
      ]
    );

    const projectId = result.rows[0].id;

    res.json({
      message: 'Project metadata saved to Neon DB',
      id: projectId,
      projectData: dataJson
    });

  } catch (err) {
    console.error('Error saving project:', err);
    res.status(500).json({ error: 'Database error', message: err.message });
  }
});

module.exports = router;
