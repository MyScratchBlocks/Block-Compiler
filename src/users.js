const express = require('express');
const pool = require('../db');

const router = express.Router();

router.get('/users/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, data FROM projects WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.send(`
        <html>
        <head><title>No Projects</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 2rem;">
          <h2 style="color: gray;">Users must have at least 1 project for their Profile to be shown to the public.</h2>
        </body>
        </html>
      `);
    }

    const userProjects = result.rows.map(project => {
      const { id, title, data } = project;
      const image = data?.image || '';
      return {
        id,
        title: title || `Project ${id}`,
        author: username,
        image: image.startsWith('local_assets/')
          ? `/assets/internalapi/asset/${image.split('/')[1]}`
          : image,
        link: `https://myscratchblocks.github.io/projects#${id}`
      };
    });

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Projects by ${username}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="p-6 bg-gray-100 font-sans">
  <h1 class="text-3xl font-bold text-center text-indigo-600 mb-6">Projects by ${username}</h1>
  <main class="grid sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
    ${userProjects.map(p => `
      <div class="bg-white rounded-lg shadow p-4 hover:shadow-lg transition duration-300">
        <img src="${p.image}" class="w-full h-40 object-cover rounded mb-3" />
        <h2 class="text-xl font-semibold mb-1">${p.title}</h2>
        <p class="text-sm text-gray-500 mb-2">Main Coder: ${p.author}</p>
        <a href="${p.link}" target="_blank" class="text-indigo-600 hover:underline">View Project</a>
      </div>
    `).join('')}
  </main>
</body>
</html>
    `);
  } catch (err) {
    console.error('Error loading user profile:', err);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/api/users/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const result = await pool.query(
      `SELECT id, title, data FROM projects WHERE username = $1`,
      [username]
    );

    let totalViews = 0;
    let totalLikes = 0;
    let totalFavorites = 0;

    const userProjects = result.rows.map(project => {
      const stats = project.data?.stats || {};
      totalViews += stats.views || 0;
      totalLikes += stats.loves || 0;
      totalFavorites += stats.favorites || 0;

      return {
        id: project.id,
        title: project.title || `Project ${project.id}`
      };
    });

    res.json({
      username,
      totalProjects: userProjects.length,
      totalViews,
      totalLikes,
      totalFavorites
    });

  } catch (err) {
    console.error('Error loading user stats:', err);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

module.exports = router;
