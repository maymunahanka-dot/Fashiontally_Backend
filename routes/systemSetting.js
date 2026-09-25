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
    getVersionCheck,
    updateForceUpdateSetting,
    getForceUpdateSetting,
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

// Version check — public (called by mobile on launch)
router.get('/version-check', getVersionCheck);

// Force update settings — admin only
router.get('/force-update', verifyAdminToken, getForceUpdateSetting);
router.put('/force-update', verifyAdminToken, updateForceUpdateSetting);

module.exports = router;
