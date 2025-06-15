const express = require('express');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const router = express.Router();
const LOCAL_UPLOAD_PATH = path.join(__dirname, '..', 'local_storage/uploads');

// Helper function to set nested value by path (like lodash.set)
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = value;
}

// GET route - read metadata
router.get('/api/projects/:id/meta', (req, res) => {
  const { id } = req.params;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    const data = JSON.parse(entry.getData().toString('utf-8'));
    if(data.visibility === 'unshared') {
      const username = req.headers.Authorization;
      if(username === data.author?.username) {
        res.json(data);
      } else {
        res.status(403).json({ error: 'Unauthorized' });
      }
    } else { // Added else block for shared projects
        res.json(data);
    }
  } catch (err) {
    console.error('Metadata read error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to read project metadata' });
  }
});

// PUT route - edit metadata
router.put('/api/projects/:id/meta', (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' );
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    let data;
    try {
      data = JSON.parse(entry.getData().toString('utf-8'));
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse existing project metadata' });
    }

    // Apply updates without lodash
    for (const key in updates) {
      setNestedValue(data, key, updates[key]);
    }

    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
    zip.writeZip(filePath);

    res.json({ success: true, updated: updates });
  } catch (err) {
    console.error('Metadata update error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to update project metadata' });
  }
});

// NEW PUT route - share project (set visibility to 'visible')
router.put('/api/share/:id', (req, res) => {
  const { id } = req.params;

  // Input validation for project ID
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'Invalid project ID format' });
  }

  const filePath = path.join(LOCAL_UPLOAD_PATH, `${id}.sb3`);

  try {
    // Check if the project file exists
    fs.accessSync(filePath, fs.constants.F_OK);

    const zip = new AdmZip(filePath);
    const entry = zip.getEntry('data.json');

    // Ensure data.json exists within the zip
    if (!entry) {
      return res.status(404).json({ error: 'data.json not found in project file' });
    }

    let data;
    // Parse the existing data.json content
    try {
      data = JSON.parse(entry.getData().toString('utf-8'));
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse existing project metadata' });
    }

    // Update the visibility to 'visible'
    data.visibility = 'visible';

    // Delete the old data.json and add the updated one
    zip.deleteFile('data.json');
    zip.addFile('data.json', Buffer.from(JSON.stringify(data, null, 2)));
    zip.writeZip(filePath); // Write changes back to the .sb3 file

    res.json({ success: true, message: `Project ${id} visibility set to 'visible'` });
  } catch (err) {
    // Handle file access or zip operation errors
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: 'Project file not found' });
    }
    console.error('Share project error:', err.stack || err.message);
    return res.status(500).json({ error: 'Failed to share project' });
  }
});

module.exports = router;
