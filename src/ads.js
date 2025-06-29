const express = require('express');
const router = express.Router();

let ads = [];

router.get('/ad/:id/set/:ad', (req, res) => {
  const { id, ad } = req.params;
  const index = parseInt(id, 10);

  // Ensure index is valid
  if (isNaN(index) || index < 0) {
    return res.status(400).json({ error: 'Invalid ID' });
  }

  // Initialize if undefined
  if (!ads[index]) {
    ads[index] = '';
  }

  ads[index] += ad;
  res.status(200).json({ message: 'Ad updated', ad: ads[index] });
});

router.get('/ad/random', (req, res) => {
  if (ads.length === 0) {
    return res.status(404).json({ error: 'No ads available' });
  }

  const randomIndex = Math.floor(Math.random() * ads.length);
  res.status(200).json({ id: randomIndex, ad: ads[randomIndex] });
});

module.exports = router;
