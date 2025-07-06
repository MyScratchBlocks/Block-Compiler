const express = require('express');
const router = express.Router();

const messages = {};

router.get('/users/:user/messages', (req, res) => {
  res.json({ messages: messages[req.params.user] || [] });
});

function addMessage(user, message) {
  messages[user] = messages[user] || [];
  messages[user].push(message);
}

module.exports = { addMessage, router };
