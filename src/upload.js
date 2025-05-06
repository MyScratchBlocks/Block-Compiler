const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');

let pData = [];
const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });  // Temporary folder for file uploads

const GITHUB_REPO = 'Editor-Compiler';
const GITHUB_OWNER = 'CodeSnap-ORG';
const GITHUB_UPLOAD_PATH = 'uploads';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;  // Ensure this is set in your environment

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

        // Filter for files with .sb3 extension and get their numeric part to find the next number
        const files = response.data
            .filter(file => file.name.endsWith('.sb3'))
            .map(file => parseInt(file.name))
            .filter(n => !isNaN(n));

        const max = files.length ? Math.max(...files) : 0;
        return max + 1;  // Return the next available file number
    } catch (err) {
        if (err.response?.status === 404) {
            // If folder doesn't exist, start from 1
            return 1;
        }
        throw err;
    }
}

// POST route to handle file upload and create metadata file
router.post('/', upload.single('project'), async (req, res) => {
    const username = req.body.username;
    const projectName = req.body.projectName;
    pData.push(username);

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;  // Temporary file path

    try {
        // Step 1: Get the next available file number for the .sb3 file
        const fileNum = await getNextFileNumber();
        const githubFileName = `${fileNum}.sb3`;
        const githubFilePath = `${GITHUB_UPLOAD_PATH}/${githubFileName}`;

        // Step 2: Read and encode the uploaded .sb3 file in base64
        const fileContent = fs.readFileSync(filePath);
        const base64Content = fileContent.toString('base64');

        // Step 3: Upload the .sb3 file to GitHub
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

        // Step 4: Create an additional metadata file based on projectName (no file extension)
        const safeProjectName = projectName.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase();
        const projectMetaPath = `${GITHUB_UPLOAD_PATH}/${safeProjectName}`;

        // Create metadata content for the project file
        const metaContent = Buffer.from(
            `Username: ${username}\nProject: ${projectName}\nUploaded as: ${githubFileName}\n`
        ).toString('base64');

        // Step 5: Upload the metadata file to GitHub
        await axios.put(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${projectMetaPath}`,
            {
                message: `Add metadata file for ${projectName}`,
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

        // Clean up the temporary file after upload
        fs.unlinkSync(filePath);

        // Respond with success message
        res.json({
            message: 'Uploaded to GitHub',
            sb3File: githubFileName,
            metadataFile: projectMetaPath,
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
