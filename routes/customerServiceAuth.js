const express = require('express');
const router  = express.Router();
const { getStatus, setPassword, login, updatePin } = require('../controllers/customerServiceAuthController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.get('/status',        getStatus);
router.post('/set-password',  setPassword);
router.post('/login',         login);
router.put('/update-pin',     verifyAdminToken, updatePin);

module.exports = router;
