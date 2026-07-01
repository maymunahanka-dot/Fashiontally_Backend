const express = require('express');
const router  = express.Router();
const { getResetPasswordPage, resetPassword } = require('../controllers/resetPasswordController');

// GET  /api/auth/reset-password?token=xxx  → serve HTML form
router.get('/reset-password', getResetPasswordPage);

// POST /api/auth/reset-password  → process form or JSON API call
router.post('/reset-password', resetPassword);

module.exports = router;
