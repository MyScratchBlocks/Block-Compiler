const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const pool = require('./db');

const router = express.Router();
const upload = multer({ dest: 'temp_uploads/' });

router.post('/:id/save', upload.single('project'), async (req, res) => {
  const { id } = req.params;
  const sb3Blob = req.file;
  const { projectName } = req.body;

  if (!sb3Blob) return res.status(400).json({ error: 'No project file provided' });

  try {
    const uploadedZip = new AdmZip(sb3Blob.path);

    // Extract data.json (metadata)
    const dataEntry = uploadedZip.getEntry('data.json');
    if (!dataEntry) throw new Error('Missing data.json in uploaded project');
    const dataJson = JSON.parse(dataEntry.getData().toString());

    // Optionally update project title
    if (typeof projectName === 'string') {
      dataJson.title = projectName;
    }

    // Extract project.json
    const projectJsonEntry = uploadedZip.getEntry('project.json');
    if (!projectJsonEntry) throw new Error('Missing project.json in uploaded project');
    const projectJson = JSON.parse(projectJsonEntry.getData().toString());

    // Begin DB transaction
    await pool.query('BEGIN');

    // Update metadata in projects table
    await pool.query(
      `UPDATE projects SET data = $1 WHERE id = $2`,
      [dataJson, id]
    );

    // Upsert project_json in project_jsons table
    await pool.query(
      `INSERT INTO project_jsons (project_id, project_json) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET project_json = EXCLUDED.project_json`,
      [id, projectJson]
    );

    // Extract and upsert assets
    const assetEntries = uploadedZip.getEntries().filter(e => /\.(png|svg|wav|mp3)$/.test(e.entryName));

    for (const entry of assetEntries) {
      const filename = entry.entryName;
      const fileBuffer = entry.getData();

      await pool.query(
        `INSERT INTO assets (project_id, filename, data) VALUES ($1, $2, $3)
         ON CONFLICT (project_id, filename) DO UPDATE SET data = EXCLUDED.data`,
        [id, filename, fileBuffer]
      );
    }

    await pool.query('COMMIT');

    // Clean up temp upload
    fs.unlinkSync(sb3Blob.path);

    res.json({ message: 'Project JSON and assets updated', id, updatedTitle: dataJson.title });

  } catch (err) {
    console.error('Error saving project:', err.message);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback error:', rollbackErr.message);
    }
    if (sb3Blob && fs.existsSync(sb3Blob.path)) {
      fs.unlinkSync(sb3Blob.path);
    }
    res.status(500).json({ error: 'Failed to save project', message: err.message });
  }
});

module.exports = router;
