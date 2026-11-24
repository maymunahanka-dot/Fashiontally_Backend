const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { verifyToken } = require('../middleware/auth');
const c = require('../controllers/refabController');

const router = express.Router();

// Public counters and reports: keep them from being spammed
const publicLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => String(req.headers['x-forwarded-for'] || req.ip).split(',')[0].trim(),
  handler: (req, res) => res.status(429).json({ success: false, error: 'Too many requests. Please try again later.' }),
});

// Fashion Refab: /api/refab
// Public (no login)
router.get('/listings', c.listPublic);
router.get('/listings/:id', c.getPublic);
router.post('/listings/:id/track', publicLimiter, c.track);
router.post('/listings/:id/report', publicLimiter, c.report);

// The signed-in business's own listings
router.get('/mine', verifyToken, c.listMine);
router.post('/', verifyToken, c.create);
router.put('/:id', verifyToken, c.update);
router.patch('/:id/status', verifyToken, c.setStatus);
router.delete('/:id', verifyToken, c.remove);

module.exports = router;
