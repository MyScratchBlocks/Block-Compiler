const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const fs = require('fs');
const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');

// App modules
const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');
const logger = require('./cloud-server/logger');
const config = require('./cloud-server/config');
const wss = require('./cloud-server/server');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Load modular routes
app.use('/', require('./createProject'));
app.use('/', require('./saveProject'));
app.use('/', require('./metadata'));
app.use('/', require('./projectJson'));
app.use('/', require('./serveAsset'));
app.use('/', require('./projectStats'));

app.use('/api/projects', commentsRouter); // Comments
app.use('/api/projects', projectsRoute);  // Projects - updated to same mount path for consistency
app.use('/api/users', usersRouter);       // Users - namespaced under /api/users

// Root health check
app.get('/', (req, res) => {
  res.send('MyScratchBlocks Compiler is running');
});

// Create HTTP server and serve static files from 'public'
const serve = serveStatic('public');
const server = http.createServer((req, res) => {
  // Security headers
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'interest-cohort=()');
  serve(req, res, finalhandler(req, res)); // Static fallback
});

// WebSocket upgrade handling
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

server.on('close', () => {
  logger.info('Server closing');
  wss.close();
});

// Listen on port (from .env or fallback config)
const PORT = process.env.PORT || config.port || 3000;
server.listen(PORT, () => {
  if (typeof PORT === 'string' && PORT.startsWith('/') && config.unixSocketPermissions >= 0) {
    fs.chmod(PORT, config.unixSocketPermissions, (err) => {
      if (err) {
        logger.error('Could not chmod unix socket: ' + err);
        process.exit(1);
      }
    });
  }
  logger.info(`Server started on port: ${PORT}`);
});
