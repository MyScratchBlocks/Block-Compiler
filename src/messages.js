const express = require('express');
const router = express.Router();

let messages = {};

router.get('/users/:user/messages', (req, res) => {
  res.json({ messages: messages[req.params.user] || [] });
});

const addMessage = function (user, message) {
  if (!messages[user]) messages[user] = [];
  messages[user].push(message);
};

module.exports = { addMessage, router };
