const express = require('express');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

const router = express.Router();

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/CodeSnap-ORG/Editor-Compiler/main/uploads';

router.get('/:id', async (req, res) => {
    const fileId = req.params.id;
    const fileUrl = `${GITHUB_RAW_BASE}/${fileId}.sb3`;

    try {
        console.log(`Fetching SB3 file from URL: ${fileUrl}`);
        const response = await fetch(fileUrl);

        if (!response.ok) {
            console.error(`Failed to fetch file: ${response.statusText}`);
            return res.status(404).send('SB3 file not found on GitHub');
        }

        console.log(`SB3 file fetched successfully: ${fileUrl}`);
        const buffer = await response.buffer();

        console.log(`Buffer size: ${buffer.length} bytes`);
        const zip = new AdmZip(buffer);
        const projectJsonEntry = zip.getEntry('project.json');

        if (!projectJsonEntry) {
            console.error('project.json not found inside the SB3 file');
            return res.status(400).send('project.json not found in SB3 file');
        }

        console.log('project.json found, preparing to send as download');
        const projectJsonBuffer = projectJsonEntry.getData();

        // Set headers for file download
        res.setHeader('Content-Disposition', 'attachment; filename="project.json"');
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', projectJsonBuffer.length);

        res.send(projectJsonBuffer);
    } catch (err) {
        console.error('Error processing SB3 file:', err);
        res.status(500).send('Failed to fetch or process SB3 file');
    }
});

module.exports = router;
