const express = require('express');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const MESSAGES_FILE = path.join(UPLOAD_DIR, 'messages.txt');
const EMAILS_FILE = path.join(UPLOAD_DIR, 'emails.txt');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// In-memory emails object
let emails = {};

// Ensure emails.txt exists or create with defaults
if (!fs.existsSync(EMAILS_FILE)) {
  emails = {
    MyScratchedAccount: 'benjmain801@icloud.com',
    kRxZy_kRxZy: 'londonhussein1992@gmail.com'
  };
  saveEmailsToFile();
} else {
  // Load emails from emails.txt
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
}

// Ensure messages.txt exists or create empty
if (!fs.existsSync(MESSAGES_FILE)) {
  try {
    fs.writeFileSync(MESSAGES_FILE, '', 'utf-8');
  } catch (e) {
    console.error('[init] Failed to create messages.txt:', e.message);
  }
}

// Messages stored in-memory, keyed by user
const messages = {};

// Email sending status with extended info
let lastEmailStatus = {
  success: null,
  message: 'No emails have been sent yet.',
  time: null,
  user: null,
  recipientEmail: null,
  error: null,
  info: null,
  rawResponse: null
};

// Nodemailer transporter for Zoho Mail
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 587,
  secure: false, // use STARTTLS
  auth: {
    user: 'noreply@myscratchblocks.dedyn.io', // your Zoho custom domain email
    pass: '7auLwJ4R3Akm'                      // your Zoho app password
  },
  tls: {
    rejectUnauthorized: false // optional, sometimes helps with cert issues
  }
});

// Save emails object to emails.txt file
function saveEmailsToFile() {
  try {
    const lines = Object.entries(emails)
      .map(([user, email]) => `${user}: ${email}`)
      .join('\n');
    fs.writeFileSync(EMAILS_FILE, lines, 'utf-8');
  } catch (e) {
    console.error('[email] Failed to write emails.txt:', e.message);
  }
}

// Append a message line to messages.txt
function appendMessageToFile(user, message) {
  const line = `[${new Date().toISOString()}] ${user}: ${message}\n`;
  try {
    fs.appendFileSync(MESSAGES_FILE, line, 'utf-8');
  } catch (e) {
    console.error('[messages] Failed to write to messages.txt:', e.message);
  }
}

// API: Get messages for a user
router.get('/users/:user/messages', (req, res) => {
  const user = req.params.user;
  res.json({ messages: messages[user] || [] });
});

// API: Set email for a user via query param
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

// API: Get all registered emails
router.get('/emails', (req, res) => {
  res.json({ emails });
});

// API: Get detailed last email sending status
router.get('/email/status', (req, res) => {
  res.json({
    success: lastEmailStatus.success,
    message: lastEmailStatus.message,
    timestamp: lastEmailStatus.time,
    user: lastEmailStatus.user,
    recipientEmail: lastEmailStatus.recipientEmail,
    errorDetails: lastEmailStatus.error ? {
      message: lastEmailStatus.error.message,
      stack: lastEmailStatus.error.stack
    } : null,
    info: lastEmailStatus.info || null,
    rawResponse: lastEmailStatus.rawResponse || null
  });
});

// Function to add message for user and send notification email
function addMessage(user, message) {
  if (!messages[user]) {
    messages[user] = [];
  }
  messages[user].push(message);
  appendMessageToFile(user, message);

  const recipientEmail = emails[user];
  if (!recipientEmail) {
    lastEmailStatus = {
      success: false,
      message: `No email address set for user "${user}"`,
      time: new Date().toISOString(),
      user,
      recipientEmail: null,
      error: new Error(`No email address set for user "${user}"`),
      info: null,
      rawResponse: null
    };
    return;
  }

  const mailOptions = {
    from: '"MyScratchBlocks Team" <noreply@myscratchblocks.dedyn.io>',
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
    const now = new Date().toISOString();

    if (error) {
      console.error('Email error:', error);
      lastEmailStatus = {
        success: false,
        message: error.message,
        time: now,
        user,
        recipientEmail,
        error,
        info: null,
        rawResponse: null
      };
    } else {
      console.log(`Email sent to ${recipientEmail}:`, info.response);
      lastEmailStatus = {
        success: true,
        message: 'Email sent successfully',
        time: now,
        user,
        recipientEmail,
        error: null,
        info,
        rawResponse: info.response
      };
    }
  });
}

module.exports = { addMessage, router };
