const express = require('express');
const nodemailer = require('nodemailer');
const router = express.Router();

const messages = {};
const emails = {};

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'myscratchblocks.team@gmail.com',
    pass: 'hiddenCode'
  }
});

// Route to get user messages
router.get('/users/:user/messages', (req, res) => {
  const user = req.params.user;
  res.json({ messages: messages[user] || [] });
});

// Route to set user email (expects ?email=some@example.com in query)
router.get('/users/:user/email/set', (req, res) => {
  const user = req.params.user;
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  emails[user] = email;
  res.json({ message: `Email for user ${user} set to ${email}` });
});

// Function to add a message and send an email
function addMessage(user, message) {
  if (!messages[user]) {
    messages[user] = [];
  }
  messages[user].push(message);

  const recipientEmail = emails[user];
  if (recipientEmail) {
    const mailOptions = {
      from: '"MyScratchBlocks Team" <myscratchblocks.team@gmail.com>',
      to: recipientEmail,
      subject: `New Message for ${user}`,
      html: `
        <p>Hello ${user},</p>
        <p>You have a new message:</p>
        <blockquote>${message}</blockquote>
        <p>Visit <a href="https://myscratchblocks.github.io">MyScratchBlocks</a> for more details.</p>
        <p>— The MyScratchBlocks Team</p>
      `
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email error:', error);
      } else {
        console.log(`Email sent to ${recipientEmail}:`, info.response);
      }
    });
  }
}

module.exports = { addMessage, router };
