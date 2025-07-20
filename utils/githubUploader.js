const fs = require('fs');
const path = require('path');
const axios = require('axios');

/**
 * Uploads or updates a file to a GitHub repository via REST API.
 */
async function uploadFileToGitHub(localFilePath, githubRepo, githubPath, githubToken, logger = console.log) {
  try {
    const fileContent = fs.readFileSync(localFilePath);
    const base64Content = fileContent.toString('base64');
    const fileName = path.basename(localFilePath);

    const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${githubPath}/${fileName}`;

    let sha;
    try {
      const res = await axios.get(apiUrl, {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: 'application/vnd.github.v3+json'
        }
      });
      sha = res.data.sha;
    } catch (err) {
      if (err.response?.status !== 404) throw err;
    }

    const payload = {
      message: `${sha ? 'Update' : 'Add'} ${fileName}`,
      content: base64Content,
      ...(sha ? { sha } : {})
    };

    await axios.put(apiUrl, payload, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    logger(`[githubUploader] ${sha ? 'Updated' : 'Uploaded'}: ${fileName}`);
    return { success: true, action: sha ? 'updated' : 'created', file: fileName };

  } catch (err) {
    logger(`[githubUploader] Upload Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Fetches a file from a GitHub repository and writes it locally.
 */
async function fetchFileFromGitHub(githubRepo, githubPath, localSavePath, githubToken, logger = console.log) {
  try {
    const fileName = path.basename(githubPath);
    const apiUrl = `https://api.github.com/repos/${githubRepo}/contents/${githubPath}`;

    const res = await axios.get(apiUrl, {
      headers: {
        Authorization: `token ${githubToken}`,
        Accept: 'application/vnd.github.v3.raw'
      },
      responseType: 'arraybuffer'
    });

    fs.writeFileSync(localSavePath, res.data);
    logger(`[githubUploader] Downloaded ${fileName} to ${localSavePath}`);

    return { success: true, file: localSavePath };
  } catch (err) {
    logger(`[githubUploader] Download Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

module.exports = {
  uploadFileToGitHub,
  fetchFileFromGitHub
};
