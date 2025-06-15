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

app.use(cors({
  origin: 'https://myscratchblocks.github.io'
}));

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
app.listen(5000, () => {
  console.log("Server running");
});
