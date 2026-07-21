const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const insightsController = require('../controllers/insightsController');

router.get('/insights', auth, insightsController.getInsights);
router.post('/chat', auth, insightsController.chatWithCoach);

module.exports = router;
