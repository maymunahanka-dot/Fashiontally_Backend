const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { createPaymentLink, getPaymentLink } = require('../controllers/paymentLinkController');
const { verifyToken } = require('../middleware/auth');

// Links are random 256-bit tokens; this just stops anyone hammering the endpoint.
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });

// The mobile app asks for a link, then opens it in the in-app browser.
router.post('/create', verifyToken, createPaymentLink);
// The web /pay page reads who is paying from the link.
router.get('/:token', lookupLimiter, getPaymentLink);

module.exports = router;
