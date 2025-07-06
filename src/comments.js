const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip'); // npm install adm-zip
const { v4: uuidv4 } = require('uuid'); // npm install uuid
const router = express.Router();
const { addMessage } = require('./messages');

const PROJECTS_DIR = path.join(__dirname, '..', 'local_storage/uploads');

// Helper: Get full path to SB3 file
function getProjectPath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.sb3`);
}

// Helper: Read comments from SB3
function readCommentsFromSb3(projectPath) {
  try {
    const zip = new AdmZip(projectPath);
    const entry = zip.getEntry('comments.json');
    if (entry) {
      const data = zip.readAsText(entry);
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading comments:', e);
  }
  return [];
}

// Helper: Write comments into SB3
function writeCommentsToSb3(projectPath, comments) {
  const zip = new AdmZip(projectPath);
  zip.deleteFile('comments.json'); // Remove old comments file
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
router.post('/:projectId/comments', (req, res) => {
  const { text, user } = req.body;
  const projectId = req.params.projectId;
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const comments = readCommentsFromSb3(projectPath);
  const idP = uuidv4();
  const newComment = {
    id: idP,
    projectId,
    text,
    createdAt: new Date().toISOString(),
    user: user?.username || 'Anonymous',
    replies: []
  };

  comments.push(newComment);
  writeCommentsToSb3(projectPath, comments);

  try {
    const zip = new AdmZip(projectPath);
    const dataEntry = zip.getEntry('data.json');
    if (dataEntry) {
      const dataStr = zip.readAsText(dataEntry);
      const json = JSON.parse(dataStr);
      const projectAuthor = json.author?.username;

      if (projectAuthor) {
        addMessage(
          projectAuthor,
          `${user?.username || 'Someone'} posted on your project: <a href="/projects/#${json.id}">${json.title}</a>. View comment here: <a href="/projects/#${json.id}?comment=${idP}">Comment</a>`
        );
      }
    }
  } catch (e) {
    console.error('Error notifying user:', e);
  }

  res.status(201).json({ success: true });
});

// POST reply to a comment
router.post('/:projectId/comments/:commentId/reply', (req, res) => {
  const { text, user } = req.body;
  const { projectId, commentId } = req.params;
  const projectPath = getProjectPath(projectId);

  if (!fs.existsSync(projectPath)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const comments = readCommentsFromSb3(projectPath);

  function addReplyRecursive(commentList) {
    for (const comment of commentList) {
      if (comment.id === commentId) {
        comment.replies = comment.replies || [];
        comment.replies.push({
          id: uuidv4(),
          text,
          createdAt: new Date().toISOString(),
          user: { username: user?.username || 'Anonymous' }
        });
        return true;
      }
      if (comment.replies && addReplyRecursive(comment.replies)) return true;
    }
    return false;
  }

  if (!addReplyRecursive(comments)) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  writeCommentsToSb3(projectPath, comments);

  try {
    const zip = new AdmZip(projectPath);
    const dataEntry = zip.getEntry('data.json');
    if (dataEntry) {
      const dataStr = zip.readAsText(dataEntry);
      const json = JSON.parse(dataStr);
      const projectAuthor = json.author?.username;

      if (projectAuthor) {
        addMessage(
          projectAuthor,
          `${user?.username || 'Someone'} replied to a comment on your project: <a href="/projects/#${projectId}">${json.title}</a>. View comment here: <a href="/projects/#${json.id}?comment=${commentId}">Comment</a>`
        );
      }
    }
  } catch (e) {
    console.error('Error notifying user:', e);
  }

  res.status(201).json({ success: true });
});

module.exports = router;
