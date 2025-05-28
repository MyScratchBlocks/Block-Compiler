const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const uploadRoute = require('./upload');
const projectsRoute = require('./projects');
const clientRoute = require('./client');
const commentsRouter = require('./comments');

dotenv.config();
const app = express();
app.use(cors())
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(projectsRoute);
app.use(uploadRoute);
app.use(clientRoute);
app.use('/api/projects', commentsRouter);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
