const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.post('/login', adminController.login);
router.get('/overview', adminAuth, adminController.getOverview);
router.get('/users', adminAuth, adminController.getAllUsers);
router.get('/users/:id', adminAuth, adminController.getUserDetail);
router.get('/transactions', adminAuth, adminController.getAllTransactions);
router.get('/providers', adminAuth, adminController.getProviderStats);
router.get('/analytics/daily', adminAuth, adminController.getDailyStats);
router.get('/wallets/stats', adminAuth, adminController.getWalletStats);
router.get('/savings/overview', adminAuth, adminController.getSavingsOverview);
router.get('/reversals', adminAuth, adminController.getReversalStats);
router.get('/users/top', adminAuth, adminController.getTopUsers);
router.post('/transactions/:reference/reverse', adminAuth, adminController.reverseTransaction);

module.exports = router;
