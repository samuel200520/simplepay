const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

router.get('/', auth, notificationController.getNotifications);
router.post('/read/:id', auth, notificationController.markAsRead);
router.post('/read-all', auth, notificationController.markAllAsRead);

module.exports = router;
