const express = require('express');
const router = express.Router();

router.use('/', require('./createProject'));
router.use('/', require('./saveProject'));
router.use('/', require('./metadata'));
router.use('/', require('./projectJson'));
router.use('/', require('./serveAsset'));
router.use('/', require('./projectStats'));

module.exports = router;
