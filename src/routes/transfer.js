const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const transferController = require('../controllers/transferController');

router.post('/send', auth, transferController.sendMoney);
router.get('/history', auth, transferController.getHistory);

module.exports = router;