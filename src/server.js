const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');

dotenv.config();

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

// These might be better organized by mount path
app.use('/api/projects', commentsRouter); // Already mounted on `/api/projects`
app.use('/', projectsRoute);              // Consider mounting on `/api/projects` for consistency
app.use('/', usersRouter);       // Safer to namespace all APIs under `/api/*`

// Root health check or homepage
app.get('/', (req, res) => {
    res.send('MyScratchBlocks Compiler is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
