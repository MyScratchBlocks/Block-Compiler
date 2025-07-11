const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const { addMessage } = require('./messages');
const router = express.Router();

const PROJECTS_DIR = path.join(__dirname, '..', 'local_storage/uploads');

// In-memory violation tracking
const violations = {};

const base64Words = [
  'c2hpdA==', 'ZnVjaw==', 'ZGFtbg==', 'Yml0Y2g=', 'YXNzaG9sZQ==',
  'Y3VudA==', 'bmlnZ2Vy', 'ZmFn', 'ZGljaw==', 'Y29jaw==',
  'cHVzc3k=', 'cmV0YXJk'
];
const badWords = base64Words.map(w =>
  Buffer.from(w, 'base64').toString('utf8')
);

function generateSwearRegex(word) {
  const letters = word.split('').map(ch => `${ch}[\\W_]*`).join('');
  return new RegExp(`\\b${letters}\\b`, 'i');
}
const badWordPatterns = badWords.map(generateSwearRegex);

function containsSwearing(text) {
  return badWordPatterns.some(regex => regex.test(text));
}

function getWeekKey() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now - start) / 86400000);
  return `${now.getFullYear()}-W${Math.ceil((days + start.getDay() + 1) / 7)}`;
}

function getBanDuration(strikes) {
  const mins = [5, 10, 15, 30, 60, 180];
  return mins[Math.min(strikes - 1, mins.length - 1)] * 60 * 1000;
}

function isUserBanned(username) {
  const now = Date.now();
  const entry = violations[username];
  return entry && entry.week === getWeekKey() && now - entry.lastViolation < getBanDuration(entry.strikes);
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
    return entry ? JSON.parse(zip.readAsText(entry)) : [];
  } catch (e) {
    console.error('Error reading comments:', e);
    return [];
  }
}

function writeCommentsToSb3(projectPath, comments) {
  try {
    const zip = new AdmZip(projectPath);
    zip.deleteFile('comments.json');
    zip.addFile('comments.json', Buffer.from(JSON.stringify(comments, null, 2)));
    zip.writeZip(projectPath);
  } catch (e) {
    console.error('Error writing comments:', e);
  }
}

// Recursively find any comment or reply by ID
function findCommentById(comments, commentId) {
  for (const comment of comments) {
    if (comment.id === commentId) return comment;
    if (comment.replies && comment.replies.length) {
      const found = findCommentById(comment.replies, commentId);
      if (found) return found;
    }
  }
  return null;
}

// GET comments
router.get('/:projectId/comments', async (req, res) => {
  const projectId = req.params.projectId;
  const projectPath = getProjectPath(projectId);

  try {
    await fs.promises.access(projectPath);
    const comments = await new Promise(resolve =>
      setImmediate(() => resolve(readCommentsFromSb3(projectPath)))
    );
    res.json(comments);
  } catch {
    res.status(404).json({ error: 'Project not found' });
  }
});

// POST new comment
router.post('/:projectId/comments', async (req, res) => {
  const { text, user } = req.body;
  const username = user?.username || 'Anonymous';
  const projectId = req.params.projectId;
  const projectPath = getProjectPath(projectId);

  try {
    await fs.promises.access(projectPath);
  } catch {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (isUserBanned(username)) {
    return res.status(403).json({ error: 'You are temporarily banned from commenting due to previous violations.' });
  }

  if (containsSwearing(text)) {
    registerViolation(username);
    return res.status(400).json({ error: 'Inappropriate language detected. You are now temporarily banned.' });
  }

  const comments = await new Promise(resolve =>
    setImmediate(() => resolve(readCommentsFromSb3(projectPath)))
  );

  const newComment = {
    id: uuidv4(),
    projectId,
    text,
    createdAt: new Date().toISOString(),
    user: username,
    replies: []
  };

  // Notify project author (non-blocking)
  (async () => {
    try {
      const zip = new AdmZip(projectPath);
      const entry = zip.getEntry('data.json');
      const data = JSON.parse(zip.readAsText(entry));
      if (data.author?.username && data.title) {
        addMessage(
          data.author.username,
          `${username} commented on your project <a href="/projects/#${projectId}?commentId=${newComment.id}">${data.title}</a>: ${text}`
        );
      }
    } catch (e) {
      console.error('Notification error:', e.message);
    }
  })();

  comments.push(newComment);

  await new Promise(resolve =>
    setImmediate(() => {
      writeCommentsToSb3(projectPath, comments);
      resolve();
    })
  );

  res.status(201).json(newComment);
});

// POST reply to comment or reply
router.post('/:projectId/comments/:commentId/reply', async (req, res) => {
  const { text, user } = req.body;
  const username = user?.username || 'Anonymous';
  const { projectId, commentId } = req.params;
  const projectPath = getProjectPath(projectId);

  try {
    await fs.promises.access(projectPath);
  } catch {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (isUserBanned(username)) {
    return res.status(403).json({ error: 'You are temporarily banned from commenting due to previous violations.' });
  }

  if (containsSwearing(text)) {
    registerViolation(username);
    return res.status(400).json({ error: 'Inappropriate language detected. You are now temporarily banned.' });
  }

  const comments = await new Promise(resolve =>
    setImmediate(() => resolve(readCommentsFromSb3(projectPath)))
  );

  const parent = findCommentById(comments, commentId);
  if (!parent) {
    return res.status(404).json({ error: 'Comment or reply not found' });
  }

  const reply = {
    id: uuidv4(),
    text,
    createdAt: new Date().toISOString(),
    user: username,
    replies: []
  };

  parent.replies = parent.replies || [];
  parent.replies.push(reply);

  // Notify the author of the comment or reply
  (async () => {
    try {
      const zip = new AdmZip(projectPath);
      const entry = zip.getEntry('data.json');
      const data = JSON.parse(zip.readAsText(entry));
      if (parent.user && data.title) {
        addMessage(
          parent.user,
          `${username} replied to your comment on <a href="/projects/#${projectId}?commentId=${parent.id}">${data.title}</a>: ${text}`
        );
      }
    } catch (e) {
      console.error('Reply notification error:', e.message);
    }
  })();

  await new Promise(resolve =>
    setImmediate(() => {
      writeCommentsToSb3(projectPath, comments);
      resolve();
    })
  );

  res.status(201).json(reply);
});

module.exports = router;
