const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('./db');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const username = req.body.username;

    if (typeof username !== 'string' || username.includes("MyScratchBlocks-")) {
      return res.status(400).json({ error: "Invalid username" });
    }

    const token = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;
    const now = new Date().toISOString();

    // Scratch-style project.json
    const projectJson = {
      targets: [{
        isStage: true,
        name: 'Stage',
        variables: {
          '`jEk@4|i[#Fk?(8x)AV.-my variable': ['my variable', 0]
        },
        lists: {},
        broadcasts: {},
        blocks: {},
        comments: {},
        currentCostume: 0,
        costumes: [{
          name: 'backdrop1',
          dataFormat: 'svg',
          assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
          md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
          rotationCenterX: 240,
          rotationCenterY: 180
        }],
        sounds: [{
          name: 'pop',
          assetId: '83a9787d4cb6f3b7632b4ddfebf74367',
          dataFormat: 'wav',
          format: '',
          rate: 48000,
          sampleCount: 1123,
          md5ext: '83a9787d4cb6f3b7632b4ddfebf74367.wav'
        }],
        volume: 100,
        layerOrder: 0,
        tempo: 60,
        videoTransparency: 50,
        videoState: 'on',
        textToSpeechLanguage: null
      }],
      monitors: [],
      extensions: [],
      meta: {
        semver: '3.0.0',
        vm: '11.1.0',
        agent: 'Mozilla/5.0'
      }
    };

    // Project metadata
    const dataJson = {
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
      image: null,
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

    // Save to Neon
    const result = await pool.query(
      `INSERT INTO projects (username, token, title, description, visibility, data, project_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [username, token, dataJson.title, dataJson.description, dataJson.visibility, dataJson, projectJson]
    );

    res.json({
      message: 'Project saved to Neon DB',
      id: result.rows[0].id,
      dataJson,
      projectJson
    });

  } catch (err) {
    console.error('Error saving project:', err);
    res.status(500).json({ error: 'Failed to save project', message: err.message });
  }
});

module.exports = router;
