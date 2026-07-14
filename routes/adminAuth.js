const express = require('express');
const router = express.Router();
const { hasCode, setupCode, adminLogin, adminLogout } = require('../controllers/adminAuthController');

router.get('/has-code', hasCode);
router.post('/setup', setupCode);
router.post('/login', adminLogin);
router.post('/logout', adminLogout);

module.exports = router;
