const express = require('express');
const path = require('path');
const cors = require('cors');

// Initialize Express
const app = express();

// --- Configuration ---
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = 'https://myscratchblocks.github.io'; // Or read from process.env for production

// --- Middleware ---

// Enable CORS for specific origin
app.use(cors({
  origin: ALLOWED_ORIGIN,
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
// Ensure your individual router files export an Express Router
app.use('/', require('./createProject')); // Example: /api/create-project
app.use('/', require('./saveProject'));   // Example: /api/save-project
app.use('/', require('./metadata'));     // Example: /api/projects/:id/meta
app.use('/', require('./projectJson'));  // Example: /api/projects/:id/json
app.use('/', require('./serveAsset'));   // Example: /assets/:assetId
app.use('/', require('./projectStats')); // Example: /api/stats/:id

// These might contain more specific or broader routes, order matters if paths overlap
const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');
const { router: messagesRouter } = require('./messages'); // Destructure to get the router

app.use(require('./ads')); // If this is a router, mount it
app.use(messagesRouter);
app.use(commentsRouter);
app.use(projectsRoute);
app.use(usersRouter);

// --- Error Handling Middleware ---

// 404 Not Found Handler
// This middleware will be reached if no other route has handled the request.
app.use((req, res, next) => {
  const error = new Error(`Not Found - The requested URL ${req.originalUrl} does not exist on this server.`);
  error.status = 404;
  // Pass the error to the next error handling middleware
  next(error);
});

// Generic Error Handler
// This catches any errors that are passed via next(error) or thrown in routes.
app.use((error, req, res, next) => {
  // Log the error for server-side debugging
  console.error(error.stack); // Or use a more sophisticated logger like Winston

  // Determine the status code. Default to 500 Internal Server Error.
  // We'll specifically handle 403 (Forbidden) here if the 'error' object has it set.
  const statusCode = error.status || 500;

  // Prepare the JSON response
  const jsonResponse = {
    error: {
      message: error.message || 'An unexpected server error occurred.'
    }
  };

  // Add specific error codes for clients to interpret
  if (statusCode === 403) {
    jsonResponse.error.code = 'FORBIDDEN_ACCESS';
  } else if (statusCode === 404) {
    jsonResponse.error.code = 'RESOURCE_NOT_FOUND';
  } else {
    jsonResponse.error.code = 'INTERNAL_SERVER_ERROR';
    // In production, you might want a more generic message for 500 errors
    // to avoid leaking sensitive internal details.
    if (app.get('env') === 'production' && statusCode === 500) {
      jsonResponse.error.message = 'An internal server error occurred. Please try again later.';
    }
  }

  // Send the JSON error response
  res.status(statusCode).json(jsonResponse);
});

// --- Server Start ---
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`CORS enabled for origin: ${ALLOWED_ORIGIN}`);
  console.log(`Environment: Development`); // 'development' by default
});
