const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'CodeSnap-ORG';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    throw new Error('Missing GITHUB_TOKEN in environment variables');
}

// Helper to get the next available file number
async function getNextFileNumber() {
    try {
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_UPLOAD_PATH}`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'CodeSnap-Uploader'
                }
            }
        );

        const files = response.data
            .filter(file => file.name.endsWith('.sb3'))
            .map(file => parseInt(file.name))
            .filter(n => !isNaN(n));

        const max = files.length ? Math.max(...files) : 0;
        return max + 1;
    } catch (err) {
        if (err.response?.status === 404) {
            // Folder does not exist yet
            return 1;
        }
        throw err;
    }
}

router.post('/upload-project', upload.single('project'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
        const fileNum = await getNextFileNumber();
        const githubFileName = `${fileNum}.sb3`;
        const githubFilePath = `${GITHUB_UPLOAD_PATH}/${githubFileName}`;

        const fileContent = fs.readFileSync(filePath);
        const base64Content = fileContent.toString('base64');

        const uploadResponse = await axios.put(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
            {
                message: `Upload project #${fileNum}`,
                content: base64Content
            },
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'CodeSnap-Uploader',
                    Accept: 'application/vnd.github+json'
                }
            }
        );

        fs.unlinkSync(filePath);

        res.json({ message: 'Uploaded to GitHub', file: githubFileName, url: uploadResponse.data.content.html_url });
    } catch (err) {
        console.error('Upload error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Upload failed', details: err.response?.data || err.message });
    }
});

module.exports = router;
