const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');

// ----------------- Helpers -----------------
function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Read messages.txt (each line is JSON: { user, message, time })
function readMessagesFile() {
  const messagesFile = path.join(UPLOAD_DIR, 'messages.txt');
  if (!fs.existsSync(messagesFile)) return [];
  return fs.readFileSync(messagesFile, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => safeJsonParse(line))
    .filter(obj => obj);
}

// Read emails.txt (each line: username,email)
function readEmailsFile() {
  const emailsFile = path.join(UPLOAD_DIR, 'emails.txt');
  if (!fs.existsSync(emailsFile)) return {};
  const lines = fs.readFileSync(emailsFile, 'utf-8').split('\n').filter(Boolean);
  const emails = {};
  for (const line of lines) {
    const [user, email] = line.split(',').map(s => s.trim());
    if (user && email) emails[user] = email;
  }
  return emails;
}

// Get user projects info from .sb3 files in UPLOAD_DIR
function getUserProjects(username) {
  let projectFiles = [];
  try {
    projectFiles = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.sb3'));
  } catch {
    return [];
  }

  const projects = [];
  for (const file of projectFiles) {
    try {
      const zip = new AdmZip(path.join(UPLOAD_DIR, file));
      const dataEntry = zip.getEntry('data.json');
      if (!dataEntry) continue;
      const data = safeJsonParse(dataEntry.getData().toString('utf8'));
      if (!data) continue;
      if (data.author?.username === username) {
        projects.push({
          id: data.id,
          title: data.title || `Project ${data.id}`,
          image: data.image && data.image.startsWith('local_assets/')
            ? `/assets/internalapi/asset/${data.image.split('/')[1]}`
            : data.image || '',
          author: data.author.username,
          link: `https://myscratchblocks.github.io/projects#${data.id}`,
          stats: data.stats || {}
        });
      }
    } catch (e) {
      // skip corrupted file
      continue;
    }
  }
  return projects;
}

// Aggregate stats from projects
function aggregateStats(projects) {
  let totalViews = 0, totalLikes = 0, totalFavorites = 0;
  for (const p of projects) {
    totalViews += p.stats.views || 0;
    totalLikes += p.stats.loves || 0;
    totalFavorites += p.stats.favorites || 0;
  }
  return { totalViews, totalLikes, totalFavorites };
}

// Last email status - modify as needed if you persist it somewhere
let lastEmailStatus = {
  success: null,
  message: 'No emails have been sent yet.',
  time: null,
  user: null,
  recipientEmail: null
};
// You can update lastEmailStatus from your email sending logic

// ----------------- Endpoints -----------------

// 1) HTML page listing projects by user
router.get('/users/:username', (req, res) => {
  const username = req.params.username;
  const userProjects = getUserProjects(username);

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
        ? `<p class="col-span-full text-center text-gray-600">Users must have at least 1 project for their Profile to be shown to the public.</p>` 
        : userProjects.map(proj => `
          <div class="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow duration-300 transform hover:-translate-y-1">
            <img src="${proj.image}" alt="${proj.title} thumbnail" class="w-full h-40 object-cover rounded-md mb-4" />
            <h3 class="text-xl font-semibold text-gray-700 mb-2">${proj.title}</h3>
            <p class="text-gray-600 text-sm mb-4">Main Coder: ${proj.author}</p>
            <a href="${proj.link}" class="text-indigo-600 hover:text-indigo-800 font-medium inline-flex items-center" target="_blank" rel="noopener noreferrer">
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

// 2) JSON summary stats for user projects
router.get('/api/users/:username', (req, res) => {
  const username = req.params.username;
  const userProjects = getUserProjects(username);
  const stats = aggregateStats(userProjects);

  res.json({
    username,
    totalProjects: userProjects.length,
    totalViews: stats.totalViews,
    totalLikes: stats.totalLikes,
    totalFavorites: stats.totalFavorites
  });
});

// 3) Full user data including messages & email
router.get('/userapi/:username', (req, res) => {
  const username = req.params.username;
  const userProjects = getUserProjects(username);
  const stats = aggregateStats(userProjects);
  const messages = readMessagesFile().filter(m => m.user === username).map(m => ({ message: m.message, time: m.time }));
  const emails = readEmailsFile();
  const email = emails[username] || null;

  res.json({
    username,
    email,
    lastEmailStatus,
    messages,
    projects: userProjects,
    stats: {
      totalProjects: userProjects.length,
      totalViews: stats.totalViews,
      totalLikes: stats.totalLikes,
      totalFavorites: stats.totalFavorites
    }
  });
});

module.exports = router;
