const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const loadRoute = require('./load');
const uploadRoute = require('./upload');
const fetcherRoute = require('./fetcher');
const projectsRoute = require('./projects');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(loadRoute);
app.use(fetcherRoute);
app.use(projectsRoute);
app.use(uploadRoute);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
