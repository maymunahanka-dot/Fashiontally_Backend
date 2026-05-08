const express = require('express');
const router = express.Router();
const { loginUser } = require('../controllers/loginController');
const { verifyToken } = require('../middleware/auth');

router.post('/login', loginUser);

router.get('/verify', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
