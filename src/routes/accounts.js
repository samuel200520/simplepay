const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const accountsController = require('../controllers/accountsController');

router.get('/', auth, accountsController.getAccounts);
router.post('/', auth, accountsController.linkAccount);
router.delete('/:id', auth, accountsController.unlinkAccount);

module.exports = router;