const express = require('express');
const router = express.Router();
const {
    createSystemSetting,
    deleteSystemSetting,
    editSystemSetting,
    getSystemSetting,
    getAllSystemSettings,
    getSubscriptionSetting,
    updateSubscriptionSetting,
} = require('../controllers/systemSettingController');
const { verifyAdminToken } = require('../middleware/adminAuth');

router.post('/create', createSystemSetting);
router.delete('/delete/:id', deleteSystemSetting);
router.put('/edit/:id', editSystemSetting);
router.get('/get/:id', getSystemSetting);
router.get('/all', getAllSystemSettings);

// Subscription kill-switch — public read, admin write
router.get('/subscription', getSubscriptionSetting);
router.put('/subscription', verifyAdminToken, updateSubscriptionSetting);

module.exports = router;
