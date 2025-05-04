const express = require('express');
const axios = require('axios');
const { users } = require('./upload');

const router = express.Router();
 
const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'CodeSnap-ORG';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    throw new Error('Missing GITHUB_TOKEN in environment variables');
}

router.get('/projects/:id', async (req, res) => {
    const { id } = req.params;

    const filename = `${id}.sb3`;
    const filePath = `${GITHUB_UPLOAD_PATH}/${filename}`;

    try {
        // Get file metadata (includes download URL)
        const metadataRes = await axios.get(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'CodeSnap-Loader'
                }
            }
        );

        const downloadUrl = metadataRes.data.download_url;

        // Stream the file content
        const fileRes = await axios.get(downloadUrl, { responseType: 'stream' });
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        fileRes.data.pipe(res);
    } catch (err) {
        console.error(`Error loading project ${id}:`, err.response?.data || err.message);
        res.status(404).json({ error: `Project ${id} not found` });
    }
});

router.get('/projects/:id/user', (req, res) => {
    const { id } = req.params;
    const projectData = users[id];

    if (projectData) {
        res.json(projectData);
    } else {
        res.status(404).json({ error: `No data found for project ${id}` });
    }
});

module.exports = router;
