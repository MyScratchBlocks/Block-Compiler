// routes/comments.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const COMMENTS_FILE = path.join(__dirname, '..', 'comments.json');

// Helper: read comments file or return empty array
function readComments() {
  try {
    const data = fs.readFileSync(COMMENTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Helper: write comments array to file
function writeComments(comments) {
  fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2));
}

// Helper: recursively add reply to correct comment
function addReply(comments, parentId, reply) {
  for (const comment of comments) {
    if (comment.id === parentId) {
      comment.replies = comment.replies || [];
      comment.replies.push(reply);
      return true;
    }
    if (comment.replies && comment.replies.length > 0) {
      if (addReply(comment.replies, parentId, reply)) return true;
    }
  }
  return false;
}

// GET all comments for a project
router.get('/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const allComments = readComments();
  // Filter comments for this project (including replies)
  const filtered = allComments.filter(c => c.projectId === projectId);
  res.json(filtered);
});

// POST new comment or reply
router.post('/:projectId', (req, res) => {
  const projectId = req.params.projectId;
  const { username, text, parentId } = req.body;

  if (!username || !text) return res.status(400).json({ error: 'Username and text required' });

  const allComments = readComments();

  const newComment = {
    id: Date.now().toString(),
    username,
    text,
    projectId,
    parentId: parentId || null,
    replies: []
  };

  if (parentId) {
    const success = addReply(allComments, parentId, newComment);
    if (!success) return res.status(404).json({ error: 'Parent comment not found' });
  } else {
    allComments.push(newComment);
  }

  writeComments(allComments);
  res.status(201).json({ message: 'Comment saved' });
});

module.exports = router;
