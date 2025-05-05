const express = require('express');
const AdmZip = require('adm-zip');
const fetch = require('node-fetch');

const router = express.Router();

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/CodeSnap-ORG/Editor-Compiler/main/uploads';

router.get('/:id', async (req, res) => {
    const fileId = req.params.id;
    const fileUrl = `${GITHUB_RAW_BASE}/${fileId}.sb3`;

    try {
        const response = await fetch(fileUrl);

        if (!response.ok) {
            return res.status(404).send('SB3 file not found on GitHub');
        }

        const buffer = await response.buffer();
        const zip = new AdmZip(buffer);
        const projectJsonEntry = zip.getEntry('project.json');

        if (!projectJsonEntry) {
            return res.status(400).send('project.json not found in SB3 file');
        }

        const projectJson = projectJsonEntry.getData().toString('utf8');
        const projectData = JSON.parse(projectJson);

        res.setHeader('Content-Disposition', 'attachment; filename=project.json');
        res.setHeader('Content-Type', 'application/json');
        res.send(projectJson);
        
    } catch (err) {
        console.error('Error processing SB3 file:', err);
        res.status(500).send('Failed to fetch or process SB3 file');
    }
});

module.exports = router;
