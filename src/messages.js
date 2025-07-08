const express = require('express');
const router = express.Router();

const messages = {};

router.get('/users/:user/messages', (req, res) => {
  const user = req.params.user;
  res.json({ messages: messages[user] || [] });
});

function addMessage(user, message) {
  if (!messages[user]) {
    messages[user] = [];
  }
  messages[user].push(message);
}

module.exports = { addMessage, router };
