const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

let pData = [];
const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'CodeSnap-ORG';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    throw new Error('Missing GITHUB_TOKEN in environment variables');
}

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

        return files.length ? Math.max(...files) + 1 : 1;
    } catch (err) {
        if (err.response?.status === 404) return 1;
        throw err;
    }
}

router.post('/', upload.single('project'), async (req, res) => {
    const username = req.body.username;
    const projectName = req.body.projectName;
    pData.push(username);

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

        // Upload the .sb3 file to GitHub
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

        // ----------- Extract and Build Metadata JSON ----------
        const zip = new AdmZip(filePath);
        const projectJson = zip.readAsText('project.json');
        const projectData = JSON.parse(projectJson);

        const randomToken = `${Date.now()}_${uuidv4().replace(/-/g, '')}`;
        const metadata = {
            id: fileNum,
            title: projectData.info?.title || projectName || 'Untitled Project',
            description: projectData.info?.description || '',
            instructions: projectData.info?.instructions || '',
            visibility: "visible",
            public: true,
            comments_allowed: true,
            is_published: true,
            author: {
                id: Math.floor(Math.random() * 1000000000),
                username: username || "unknown_user",
                scratchteam: false,
                history: {
                    joined: "1900-01-01T00:00:00.000Z"
                },
                profile: {
                    id: null,
                    images: {
                        "90x90": "",
                        "60x60": "",
                        "55x55": "",
                        "50x50": "",
                        "32x32": ""
                    }
                }
            },
            image: `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_480x360.png`,
            images: {
                "282x218": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_282x218.png?v=${Date.now()}`,
                "216x163": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_216x163.png?v=${Date.now()}`,
                "200x200": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_200x200.png?v=${Date.now()}`,
                "144x108": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_144x108.png?v=${Date.now()}`,
                "135x102": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_135x102.png?v=${Date.now()}`,
                "100x80": `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_100x80.png?v=${Date.now()}`
            },
            history: {
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                shared: new Date().toISOString()
            },
            stats: {
                views: 0,
                loves: 0,
                favorites: 0,
                remixes: 0
            },
            remix: {
                parent: null,
                root: null
            },
            project_token: randomToken
        };

        const metaFileName = `${fileNum}_data.json`;
        const metaFilePath = `${GITHUB_UPLOAD_PATH}/${metaFileName}`;
        const metaContent = Buffer.from(JSON.stringify(metadata, null, 2)).toString('base64');

        // Upload data.json to GitHub
        await axios.put(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${metaFilePath}`,
            {
                message: `Add metadata for project #${fileNum}`,
                content: metaContent
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

        res.json({
            message: 'Project and metadata uploaded successfully',
            sb3File: githubFileName,
            metadataFile: metaFileName,
            url: uploadResponse.data.content.html_url
        });

    } catch (err) {
        console.error('Upload error:', err.response?.data || err.message);
        res.status(500).json({
            error: 'Upload failed',
            details: err.response?.data || err.message
        });
    }
});

module.exports = router;
