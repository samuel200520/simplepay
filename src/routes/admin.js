const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.post('/login', adminController.login);
router.get('/transactions', adminAuth, adminController.getAllTransactions);
router.post('/transactions/:reference/reverse', adminAuth, adminController.reverseTransaction);

module.exports = router;