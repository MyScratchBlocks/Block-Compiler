const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();

// Helper function to fetch and extract project.json from .sb3 file
async function fetchAndParseSb3(url) {
    try {
        // Fetch the SB3 file using axios with responseType as 'arraybuffer'
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        if (response.status === 200) {
            // Write the file to disk temporarily
            const tempFilePath = path.join(__dirname, '../temp.sb3');
            fs.writeFileSync(tempFilePath, response.data);

            // Extract the SB3 file (which is a zip archive)
            const zip = new AdmZip(tempFilePath);
            const zipEntries = zip.getEntries(); // Get all files inside the SB3

            // Extract the JSON file inside the SB3 (usually the 'project.json' file)
            let projectJson;
            zipEntries.forEach(entry => {
                if (entry.entryName === 'project.json') {
                    projectJson = JSON.parse(entry.getData().toString('utf8'));
                }
            });

            // Delete the temporary SB3 file after extraction
            fs.unlinkSync(tempFilePath);

            return projectJson;
        } else {
            throw new Error(`Failed to fetch SB3 file: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error fetching or extracting SB3 file:', error);
        throw error;
    }
}

// Route to fetch and return project.json from a .sb3 file
router.get('/:id', async (req, res) => {
    const sb3Id = req.params.id; // Extract the 'id' from the URL
    const sb3Url = `https://raw.githubusercontent.com/MyScratchBlocks/Editor-Compiler/main/uploads/${sb3Id}.sb3`; // Dynamic URL

    try {
        // Fetch and parse the SB3 file
        const projectJson = await fetchAndParseSb3(sb3Url);

        // Convert the JSON object into a buffer
        const jsonBuffer = Buffer.from(JSON.stringify(projectJson, null, 2));

        // Set the response headers to force the browser to download the file
        res.setHeader('Content-Disposition', `attachment; filename="${sb3Id}-project.json"`);
        res.setHeader('Content-Type', 'application/json');

        // Send the JSON file as a downloadable response
        res.send(jsonBuffer);
    } catch (error) {
        // Return a 500 server error if something goes wrong
        res.status(500).send('Error processing the SB3 file.');
    }
});

module.exports = router;
