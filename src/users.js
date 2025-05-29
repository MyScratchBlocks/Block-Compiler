const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const router = express.Router();

const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

router.get('/users/:username', async (req, res) => {
  const username = req.params.username;
  
  // Read all .sb3 files in uploads folder
  let projectFiles;
  try {
    projectFiles = fs.readdirSync(LOCAL_UPLOAD_PATH).filter(f => f.endsWith('.sb3'));
  } catch (err) {
    return res.status(500).send('Failed to read projects folder.');
  }

  // Load and filter projects by username
  const userProjects = [];

  for (const file of projectFiles) {
    const filePath = path.join(LOCAL_UPLOAD_PATH, file);
    try {
      const zip = new AdmZip(filePath);
      const dataEntry = zip.getEntry('data.json');
      if (!dataEntry) continue;

      const dataJsonText = dataEntry.getData().toString('utf8');
      const data = safeJsonParse(dataJsonText);
      if (!data) continue;

      if (data.author?.username === username) {
        userProjects.push({
          id: data.id,
          title: data.title,
          image: data.image.startsWith('local_assets/') 
            ? `/assets/internalapi/asset/${data.image.split('/')[1]}` 
            : data.image || '',
          author: data.author.username,
          link: `/projects#${data.id}`
        });
      }
    } catch {
      // skip corrupt projects
      continue;
    }
  }

  // Render the HTML page
  res.send(`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Projects by ${username} - MyScratchBlocks</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
      body {
        font-family: 'Inter', sans-serif;
        background-color: #f8fafc;
        color: #334155;
        margin: 0;
        padding: 2rem;
      }
    </style>
  </head>
  <body class="antialiased">
    <h1 class="text-3xl font-bold mb-8 text-center">Projects by <span class="text-indigo-600">${username}</span></h1>
    <main class="grid sm:grid-cols-2 md:grid-cols-3 gap-6 max-w-7xl mx-auto">
      ${
        userProjects.length === 0 
          ? `<p class="col-span-full text-center text-gray-600">No projects found for this user.</p>` 
          : userProjects.map(proj => `
            <div class="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1">
              <img src="${proj.image}" alt="${proj.title} thumbnail" class="w-full h-40 object-cover rounded-md mb-4" />
              <h3 class="text-xl font-semibold text-gray-700 mb-2">${proj.title}</h3>
              <p class="text-gray-600 text-sm mb-4">Author: ${proj.author}</p>
              <a href="https://myscratchblocks.github.io${proj.link}" class="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center">
                View Project
                <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                </svg>
              </a>
            </div>
          `).join('')
      }
    </main>
  </body>
  </html>
  `);
});

module.exports = router;
