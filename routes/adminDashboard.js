const express = require('express');
const router = express.Router();
const { getDashboardStats } = require('../controllers/adminDashboardController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/stats', verifyAdminToken, getDashboardStats);

module.exports = router;
