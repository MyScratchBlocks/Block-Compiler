const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Path config
const UPLOAD_DIR = path.join(__dirname, '..', 'local_storage/uploads');
const ADS_FILE = path.join(UPLOAD_DIR, 'ads.txt');

// In-memory ads array
let ads = [];

// Ensure upload directory exists
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Load existing ads from ads.txt if it exists
if (fs.existsSync(ADS_FILE)) {
  try {
    const content = fs.readFileSync(ADS_FILE, 'utf-8');
    ads = content.split('\n').filter(line => line.trim().length > 0);
  } catch (err) {
    console.error('[ads] Failed to load ads.txt:', err.message);
  }
}

// Utility: Save ads to ads.txt
function saveAdsToFile() {
  try {
    fs.writeFileSync(ADS_FILE, ads.join('\n'), 'utf-8');
  } catch (err) {
    console.error('[ads] Failed to write ads.txt:', err.message);
  }
}

// Route: Set ad by ID
router.get('/ad/:id/set/:ad', (req, res) => {
  const { id, ad } = req.params;
  const index = parseInt(id, 10);

  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  // Ensure array is large enough
  while (ads.length <= index) {
    ads.push('');
  }

  ads[index] += ad;
  saveAdsToFile();

  res.status(200).json({ message: 'Ad updated', ad: ads[index] });
});

// Route: Get random ad
router.get('/ad/random', (req, res) => {
  if (ads.length === 0) {
    return res.status(404).json({ error: 'No ads available' });
  }

  const randomIndex = Math.floor(Math.random() * ads.length);
  const selectedAd = ads[randomIndex];
  res.status(200).json({ ad: `ad:${selectedAd}`, id: randomIndex });
});

module.exports = router;
