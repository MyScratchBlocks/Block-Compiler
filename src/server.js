const express = require('express');
const path = require('path');
const cors = require('cors');

// Initialize Express
const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 5000;

// --- Middleware ---

// Enable CORS for origins that include 'myscratchblocks'
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (origin.includes('myscratchblocks')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify allowed methods
  credentials: true // If you're using cookies/sessions
}));

// Parse JSON request bodies
app.use(express.json());

// Parse URL-encoded bodies (if you have forms submitting data)
app.use(express.urlencoded({ extended: true }));

// --- Route Loading ---

// Health check (place before other routes to ensure it's always accessible)
app.get('/', (req, res) => {
  res.send('MyScratchBlocks Compiler Backend is running');
});

// Load modular API routes
app.use(require('./backupDb'));
app.use('/', require('./createProject')); // Example: /api/create-project
app.use('/', require('./saveProject'));   // Example: /api/save-project
app.use('/', require('./metadata'));     // Example: /api/projects/:id/meta
app.use('/', require('./projectJson'));  // Example: /api/projects/:id/json
app.use('/', require('./serveAsset'));   // Example: /assets/:assetId
app.use('/', require('./projectStats')); // Example: /api/stats/:id

const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');
const { router: messagesRouter } = require('./messages');

app.use(require('./ads'));
app.use(messagesRouter);
app.use(commentsRouter);
app.use(projectsRoute);
app.use(usersRouter);

// --- Error Handling Middleware ---

// 404 Not Found Handler
app.use((req, res, next) => {
  const error = new Error(`Not Found - The requested URL ${req.originalUrl} does not exist on this server.`);
  error.status = 404;
  next(error);
});

// Generic Error Handler
app.use((error, req, res, next) => {
  console.error(error.stack);

  const statusCode = error.status || 500;

  const jsonResponse = {
    error: {
      message: error.message || 'An unexpected server error occurred.'
    }
  };

  if (statusCode === 403) {
    jsonResponse.error.code = 'FORBIDDEN_ACCESS';
  } else if (statusCode === 404) {
    jsonResponse.error.code = 'RESOURCE_NOT_FOUND';
  } else {
    jsonResponse.error.code = 'INTERNAL_SERVER_ERROR';
    if (app.get('env') === 'production' && statusCode === 500) {
      jsonResponse.error.message = 'An internal server error occurred. Please try again later.';
    }
  }

  res.status(statusCode).json(jsonResponse);
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`CORS enabled for origins including: 'myscratchblocks'`);
  console.log(`Environment: ${app.get('env')}`);
});
