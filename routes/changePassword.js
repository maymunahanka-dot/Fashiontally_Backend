const express = require('express');
const router = express.Router();
const { changePassword } = require('../controllers/changePasswordController');
const { verifyToken } = require('../middleware/auth');

router.post('/change-password', verifyToken, changePassword);

module.exports = router;
