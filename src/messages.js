const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const MESSAGES_FILE = path.join(UPLOAD_DIR, 'messages.txt');
const EMAILS_FILE = path.join(UPLOAD_DIR, 'emails.txt');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Load emails from emails.txt
let emails = {};
if (fs.existsSync(EMAILS_FILE)) {
  try {
    const lines = fs.readFileSync(EMAILS_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      const [user, ...emailParts] = line.split(':');
      if (user && emailParts.length) {
        emails[user.trim()] = emailParts.join(':').trim();
      }
    }
  } catch (e) {
    console.error('[init] Failed to read emails.txt:', e.message);
  }
} else {
  // Defaults if file doesn't exist
  emails = {
    MyScratchedAccount: 'benjmain801@icloud.com',
    kRxZy_kRxZy: 'londonhussein1992@gmail.com'
  };
}

// Messages stored in-memory
const messages = {};

// Email sending status
let lastEmailStatus = {
  success: null,
  message: 'No emails have been sent yet.'
};

// Nodemailer transporter for Zoho Mail with custom domain
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false, // use SSL
  auth: {
    user: 'noreply@myscratchblocks.dedyn.io',  // your Zoho custom domain email
    pass: '7auLwJ4R3Akm'                       // your Zoho app password
  }
});

// Save emails back to emails.txt
function saveEmailsToFile() {
  try {
    const lines = Object.entries(emails).map(([user, email]) => `${user}: ${email}`).join('\n');
    fs.writeFileSync(EMAILS_FILE, lines, 'utf-8');
  } catch (e) {
    console.error('[email] Failed to write emails.txt:', e.message);
  }
}

// Append message to messages.txt
function appendMessageToFile(user, message) {
  const line = `[${new Date().toISOString()}] ${user}: ${message}\n`;
  try {
    fs.appendFileSync(MESSAGES_FILE, line, 'utf-8');
  } catch (e) {
    console.error('[messages] Failed to write to messages.txt:', e.message);
  }
}

// Get messages for a user
router.get('/users/:user/messages', (req, res) => {
  const user = req.params.user;
  res.json({ messages: messages[user] || [] });
});

// Set email for user (via query param)
router.get('/users/:user/email/set', (req, res) => {
  const user = req.params.user;
  const email = req.query.email;

  if (!email) {
    return res.status(400).json({ error: 'Email query parameter is required' });
  }

  emails[user] = email;
  saveEmailsToFile();

  res.json({ message: `Email for user ${user} set to ${email}` });
});

// Get all registered emails
router.get('/emails', (req, res) => {
  res.json({ emails });
});

// Get last email sending status
router.get('/email/status', (req, res) => {
  res.json({ status: lastEmailStatus });
});

// Add message and send email
function addMessage(user, message) {
  if (!messages[user]) {
    messages[user] = [];
  }
  messages[user].push(message);
  appendMessageToFile(user, message);

  const recipientEmail = emails[user];
  if (recipientEmail) {
    const mailOptions = {
      from: '"MyScratchBlocks Team" <noreply@myscratchblocks.dedyn.io>', // your Zoho custom domain email
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
        lastEmailStatus = {
          success: false,
          message: error.message,
          time: new Date().toISOString(),
          user,
          recipientEmail
        };
      } else {
        console.log(`Email sent to ${recipientEmail}:`, info.response);
        lastEmailStatus = {
          success: true,
          message: info.response,
          time: new Date().toISOString(),
          user,
          recipientEmail
        };
      }
    });
  } else {
    lastEmailStatus = {
      success: false,
      message: `No email address set for user "${user}"`,
      time: new Date().toISOString(),
      user
    };
  }
}

module.exports = { addMessage, router };
