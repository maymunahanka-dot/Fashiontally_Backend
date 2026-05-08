const express = require('express');
const router = express.Router();
const { createDemoRequest } = require('../controllers/demoRequestController');

// Public route — no token required
router.post('/create', createDemoRequest);

module.exports = router;
