const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const walletController = require('../controllers/walletController');

router.get('/', auth, walletController.getWalletCards);
router.post('/:walletId/sync', auth, walletController.syncWallet);
router.get('/:walletId/transactions', auth, walletController.getWalletHistory);
router.get('/:walletId/ledger', auth, walletController.getWalletTransactions);

module.exports = router;

