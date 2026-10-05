const express = require('express');
const router  = express.Router();
const { initializePayment } = require('../controllers/paymentCorController');

router.post('/initialize', initializePayment);

module.exports = router;
