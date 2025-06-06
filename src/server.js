const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

const projectsRoute = require('./projects');
const commentsRouter = require('./comments');
const usersRouter = require('./users');

dotenv.config();
const app = express();
app.use(cors())
app.use(express.json());

app.use('/', require('./createProject'));
app.use('/', require('./saveProject'));
app.use('/', require('./metadata'));
app.use('/', require('./projectJson'));
app.use('/', require('./serveAsset'));
app.use('/', require('./projectStats'));

const PORT = process.env.PORT || 3000;

app.use(projectsRoute);
app.use('/api/projects', commentsRouter);
app.use(usersRouter);
app.use(index);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
