const { addMessage } = require('./messages');
const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

const PROJECTS_DIR = path.join(__dirname, '..', 'local_storage/uploads');

// In-memory violation tracking
const violations = {};

const base64Words = [
  'c2hpdA==', 'ZnVjaw==', 'ZGFtbg==', 'Yml0Y2g=', 'YXNzaG9sZQ==', 'Y3VudA==',
  'bmlnZ2Vy', 'ZmFn', 'ZGljaw==', 'Y29jaw==', 'cHVzc3k=', 'cmV0YXJk'
];
const badWords = base64Words.map(w => Buffer.from(w, 'base64').toString('utf8'));

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - start) / 86400000);
  return `${now.getFullYear()}-W${Math.ceil((days + start.getDay() + 1) / 7)}`;
}

function getBanDuration(strikes) {
  const mins = [5, 10, 15, 30, 60, 180];
  return (mins[Math.min(strikes - 1, mins.length - 1)]) * 60 * 1000;
}

function isUserBanned(username) {
  const now = Date.now();
  const entry = violations[username];
  if (!entry || entry.week !== getWeekKey()) return false;
  return now - entry.lastViolation < getBanDuration(entry.strikes);
}

function registerViolation(username) {
  const now = Date.now();
  const week = getWeekKey();
  const entry = violations[username];
  if (!entry || entry.week !== week) {
    violations[username] = { strikes: 1, lastViolation: now, week };
  } else {
    entry.strikes += 1;
    entry.lastViolation = now;
  }
}

function getProjectPath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.sb3`);
}

function readCommentsFromSb3(projectPath) {
  try {
    const zip = new AdmZip(projectPath);
    const entry = zip.getEntry('comments.json');
    if (entry) {
      return JSON.parse(zip.readAsText(entry));
    }
  } catch (e) {
    console.error('Error reading comments:', e);
  }
  return [];
}

function writeCommentsToSb3(projectPath, comments) {
  const zip = new AdmZip(projectPath);
  zip.deleteFile('comments.json');
  zip.addFile('comments.json', Buffer.from(JSON.stringify(comments, null, 2)));
  zip.writeZip(projectPath);
}

// GET comments
router.get('/:projectId/comments', (req, res) => {
  const projectId = req.params.projectId;
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const comments = readCommentsFromSb3(projectPath);
  res.json(comments);
});

// POST new comment
router.post('/:projectId/comments', async (req, res) => {
  const { text, user } = req.body;
  const username = user?.username || 'Anonymous';
  const projectId = req.params.projectId;
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (isUserBanned(username)) {
    return res.status(403).json({ error: 'You are temporarily banned from commenting due to previous violations.' });
  }

  const isSwearing = badWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
  if (isSwearing) {
    registerViolation(username);
    return res.status(400).json({ error: 'Inappropriate language detected. You are now temporarily banned.' });
  }

  const comments = readCommentsFromSb3(projectPath);
  const newComment = {
    id: uuidv4(),
    projectId,
    text,
    createdAt: new Date().toISOString(),
    user: username,
    replies: []
  };
  const res2 = await fetch(`http://localhost:5000/api/projects/${projectId}/meta/test123`);
  const json2 = await res2.json();
  const author = json2.author?.username;
  addMessage(author, `${username} posted a comment on your project <a href="/projects/#${projectId}/">${json2.title}</a>: ${text}`);
  comments.push(newComment);
  writeCommentsToSb3(projectPath, comments);
  res.status(201).json(newComment);
});

// POST reply to comment
router.post('/:projectId/comments/:commentId/reply', (req, res) => {
  const { text, user } = req.body;
  const username = user?.username || 'Anonymous';
  const projectId = req.params.projectId;
  const commentId = req.params.commentId;
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (isUserBanned(username)) {
    return res.status(403).json({ error: 'You are temporarily banned from commenting due to previous violations.' });
  }

  const isSwearing = badWords.some(word => new RegExp(`\\b${word}\\b`, 'i').test(text));
  if (isSwearing) {
    registerViolation(username);
    return res.status(400).json({ error: 'Inappropriate language detected. You are now temporarily banned.' });
  }

  const comments = readCommentsFromSb3(projectPath);
  const comment = comments.find(c => c.id === commentId);
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  const reply = {
    id: uuidv4(),
    text,
    createdAt: new Date().toISOString(),
    user: username
  };
  
  comment.replies.push(reply);
  writeCommentsToSb3(projectPath, comments);
  res.status(201).json(reply);
});

module.exports = router;
