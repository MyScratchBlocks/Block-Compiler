const express = require('express');
const axios = require('axios');
const router = express.Router();

const BIN_ID = '681a3e258a456b796698c06e';
const API_KEY = process.env.JSONBIN_TOKEN;

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Master-Key': API_KEY
};

// Helper: recursively add a reply to a nested comment
function addReply(comments, parentId, reply) {
  for (let comment of comments) {
    if (comment.id === parentId) {
      comment.replies = comment.replies || [];
      comment.replies.push(reply);
      return true;
    } else if (comment.replies && comment.replies.length > 0) {
      if (addReply(comment.replies, parentId, reply)) return true;
    }
  }
  return false;
}

// GET comments for a project
router.get('/:projectId', async (req, res) => {
  try {
    const { data } = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: HEADERS
    });

    const all = data.record.comments || [];
    const projectComments = all.filter(c => c.projectId === req.params.projectId && c.parentId === null);

    res.json(projectComments);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to load comments' });
  }
});

// POST new comment or reply
router.post('/:projectId', async (req, res) => {
  const { username, text, parentId } = req.body;
  if (!username || !text) {
    return res.status(400).json({ error: 'Username and text required' });
  }

  try {
    const getRes = await axios.get(`https://api.jsonbin.io/v3/b/${BIN_ID}/latest`, {
      headers: HEADERS
    });

    const record = getRes.data.record;
    record.comments = record.comments || [];

    const newComment = {
      id: Date.now().toString(),
      username,
      text,
      projectId: req.params.projectId,
      parentId: parentId || null,
      replies: []
    };

    if (parentId) {
      // Add reply to correct parent comment
      const success = addReply(record.comments, parentId, newComment);
      if (!success) return res.status(404).json({ error: 'Parent comment not found' });
    } else {
      record.comments.push(newComment);
    }

    // Save updated comments to JSONBin
    await axios.put(`https://api.jsonbin.io/v3/b/${BIN_ID}`, record, {
      headers: HEADERS
    });

    res.status(201).json({ message: 'Comment saved' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to save comment' });
  }
});

module.exports = router;
