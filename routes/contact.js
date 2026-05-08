const express = require('express');
const router = express.Router();
const { createContactMessage } = require('../controllers/contactController');

// Public route — no token required
router.post('/send', createContactMessage);

module.exports = router;
