const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();

// Enable CORS for specific origin
app.use(cors({
  origin: 'https://myscratchblocks.github.io'
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// Load modular routes
app.use('/', require('./createProject'));
app.use('/', require('./saveProject'));
app.use('/', require('./metadata'));
app.use('/', require('./projectJson'));
app.use('/', require('./serveAsset'));
app.use('/', require('./projectStats'));

const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');


app.use(require('./hackv2'));
// app.use(require('./upload'));
app.use(commentsRouter); // Comments
app.use(projectsRoute);  // Projects
app.use(usersRouter);       // Users

// Root health check
app.get('/', (req, res) => {
  res.send('MyScratchBlocks Compiler is running');
});

// Start the server using app.listen
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
