const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const walletController = require('../controllers/walletController');

router.post('/transfers', auth, walletController.transferBetweenWallets);

module.exports = router;

