const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const loadRoute = require('./load');
const uploadRoute = require('./upload');
const fetcherRoute = require('./fetcher');
const projectsRoute = require('./projects');
const commentRoute = require('./test');

dotenv.config();
const app = express();
app.use(cors())
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use(loadRoute);
app.use(fetcherRoute);
app.use(projectsRoute);
app.use(uploadRoute);
app.use('/api/comments', commentRoute);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
