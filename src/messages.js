const express = require('express');
const router = express.Router();

let messages = [];

router.get('/users/:user/messages', (req, res) => {
  res.json({ messages[req.params.user] });
});

const addMessage = function (user, message) {
  messages[user] += message;
 } 

module.exports = { addMessage, router };
