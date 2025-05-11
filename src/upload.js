const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'CodeSnap-ORG';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
    throw new Error('Missing GITHUB_TOKEN in environment variables');
}

// Helper function to get the next available file number for .sb3 files
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

// POST route to handle the file upload
router.post('/', upload.single('project'), async (req, res) => {
    const username = req.body.username || 'unknown_user';
    const projectName = req.body.projectName || 'Untitled';

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
        // Step 1: Get the next available file number for the .sb3 file
        const fileNum = await getNextFileNumber();
        const githubFileName = `${fileNum}.sb3`;
        const githubFilePath = `${GITHUB_UPLOAD_PATH}/${githubFileName}`;

        // Step 2: Unzip the uploaded .sb3 file
        const zip = new AdmZip(filePath);
        const projectJson = JSON.parse(zip.readAsText('project.json'));

        // Step 3: Generate the metadata for data.json
        const timestamp = Date.now();
        const token = `${timestamp}_${uuidv4().replace(/-/g, '')}`;

        const dataJson = {
            id: fileNum,
            title: projectJson.info?.title || projectName,
            description: projectJson.info?.description || '',
            instructions: projectJson.info?.instructions || '',
            visibility: 'visible',
            public: true,
            comments_allowed: true,
            is_published: true,
            author: {
                id: Math.floor(Math.random() * 1000000000),
                username: username,
                scratchteam: false,
                history: {
                    joined: '1900-01-01T00:00:00.000Z'
                },
                profile: {
                    id: null,
                    images: {
                        '90x90': 'https://trampoline.turbowarp.org/avatars/1',
                        '60x60': 'https://trampoline.turbowarp.org/avatars/1',
                        '55x55': 'https://trampoline.turbowarp.org/avatars/1',
                        '50x50': 'https://trampoline.turbowarp.org/avatars/1',
                        '32x32': 'https://trampoline.turbowarp.org/avatars/1'
                    }
                }
            },
            image: `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_480x360.png`,
            images: {
                '282x218': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_282x218.png?v=${timestamp}`,
                '216x163': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_216x163.png?v=${timestamp}`,
                '200x200': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_200x200.png?v=${timestamp}`,
                '144x108': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_144x108.png?v=${timestamp}`,
                '135x102': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_135x102.png?v=${timestamp}`,
                '100x80': `https://cdn2.scratch.mit.edu/get_image/project/${fileNum}_100x80.png?v=${timestamp}`
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
            project_token: token
        };

        // Step 4: Add data.json to the zip without removing project.json
        zip.addFile('data.json', Buffer.from(JSON.stringify(dataJson, null, 2)));

        // Step 5: Save the modified .sb3 file
        const modifiedSb3Path = path.join('temp_uploads', `${fileNum}_modified.sb3`);
        zip.writeZip(modifiedSb3Path);

        // Step 6: Upload the modified .sb3 to GitHub
        const fileContent = fs.readFileSync(modifiedSb3Path);
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

        // Clean up temporary files
        fs.unlinkSync(filePath);
        fs.unlinkSync(modifiedSb3Path);

        // Step 7: Respond with success
        res.json({
            message: 'Project uploaded successfully with embedded metadata',
            sb3File: githubFileName,
            githubUrl: uploadResponse.data.content.html_url,
            projectData: dataJson,
            id: fileNum
        });

    } catch (err) {
        console.error('Upload error:', err.response?.data || err.message);
        res.status(500).json({
            error: 'Upload failed',
            details: err.response?.data || err.message
        });
    }
});


// GET route to retrieve project metadata (data.json)
router.get('/api/projects/:id/meta', async (req, res) => {
    const projectId = req.params.id;
    const githubFilePath = `${GITHUB_UPLOAD_PATH}/${projectId}.sb3`;

    try {
        // Step 1: Fetch the project file (the .sb3 file) from GitHub
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'CodeSnap-Uploader',
                    Accept: 'application/vnd.github+json',
                },
            }
        );

        // Step 2: Download the .sb3 file and unzip it to read the data.json
        const fileContent = Buffer.from(response.data.content, 'base64');
        const zip = new AdmZip(fileContent);

        // Step 3: Read data.json from the .sb3 archive
        const dataJsonText = zip.readAsText('data.json');

        if (!dataJsonText) {
            return res.status(404).json({ error: 'data.json not found in the project file.' });
        }

        // Step 4: Parse and return the data.json content
        const dataJson = JSON.parse(dataJsonText);

        // Step 5: Send the data.json as the response
        res.json(dataJson);
    } catch (err) {
        console.error('Error retrieving metadata:', err.response?.data || err.message);
        res.status(500).json({
            error: 'Failed to retrieve project metadata',
            details: err.response?.data || err.message,
        });
    }
});

// GET route to retrieve project.json from a specific .sb3 file
router.get('/json/:id', async (req, res) => {
    const projectId = req.params.id;
    const githubFilePath = `${GITHUB_UPLOAD_PATH}/${projectId}.sb3`;

    try {
        const response = await axios.get(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${githubFilePath}`,
            {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'CodeSnap-Uploader',
                    Accept: 'application/vnd.github+json',
                },
            }
        );

        const fileContent = Buffer.from(response.data.content, 'base64');
        const zip = new AdmZip(fileContent);
        const projectJsonText = zip.readAsText('project.json');

        if (!projectJsonText) {
            return res.status(404).json({ error: 'project.json not found in the project file.' });
        }

        const projectJson = JSON.parse(projectJsonText);
        res.json(projectJson);
    } catch (err) {
        console.error('Error retrieving project.json:', err.response?.data || err.message);
        res.status(500).json({
            error: 'Failed to retrieve project.json',
            details: err.response?.data || err.message,
        });
    }
});

// Serve individual assets by MD5 (e.g. abc123.png)
router.get('/assets/:assetName', async (req, res) => {
    const assetName = req.params.assetName;

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

        const sb3Files = response.data.filter(file => file.name.endsWith('.sb3'));

        for (const file of sb3Files) {
            const fileData = await axios.get(file.download_url, { responseType: 'arraybuffer' });
            const zip = new AdmZip(Buffer.from(fileData.data));
            const assetEntry = zip.getEntry(assetName);
            if (assetEntry) {
                const contentType = getMimeType(assetName);
                res.setHeader('Content-Type', contentType);
                return res.send(assetEntry.getData());
            }
        }

        res.status(404).json({ error: 'Asset not found' });
    } catch (err) {
        console.error('Asset fetch error:', err.message);
        res.status(500).json({ error: 'Internal error retrieving asset' });
    }
});

// Helper
function getMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const types = {
        png: 'image/png',
        svg: 'image/svg+xml',
        wav: 'audio/wav',
        mp3: 'audio/mpeg',
        json: 'application/json'
    };
    return types[ext] || 'application/octet-stream';
}


module.exports = router;
