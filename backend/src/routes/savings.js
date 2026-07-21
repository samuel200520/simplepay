const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const savingsController = require('../controllers/savingsController');

router.get('/goals', auth, savingsController.getGoals);
router.post('/goals', auth, savingsController.createGoal);
router.put('/goals/:id', auth, savingsController.updateGoal);
router.delete('/goals/:id', auth, savingsController.deleteGoal);
router.post('/goals/:id/deposit', auth, savingsController.depositToGoal);
router.post('/goals/:id/withdraw', auth, savingsController.withdrawFromGoal);
router.get('/goals/:id/history', auth, savingsController.getSavingsHistory);

module.exports = router;
