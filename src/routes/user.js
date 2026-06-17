const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/profile', auth, userController.getProfile);
router.get('/providers', userController.getProviders);
router.get('/network-stats', auth, userController.getNetworkStats);

module.exports = router;