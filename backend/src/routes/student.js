const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const studentController = require('../controllers/studentController');

router.get('/profile', auth, studentController.getStudentProfile);
router.post('/profile', auth, studentController.createStudentProfile);
router.get('/transactions', auth, studentController.getStudentTransactions);
router.post('/transactions', auth, studentController.createStudentTransaction);

module.exports = router;
