const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const insightsController = require('../controllers/insightsController');

router.get('/insights', auth, insightsController.getInsights);
router.get('/budget', auth, insightsController.budgetRecommendations);
router.post('/chat', auth, insightsController.chatWithCoach);
router.get('/chat/history', auth, insightsController.getChatHistory);
router.post('/chat/history', auth, insightsController.clearChatHistory);

module.exports = router;
