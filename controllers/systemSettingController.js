const SystemSetting = require('../models/SystemSetting');

const createSystemSetting = async (req, res) => {
    try {
        const data = req.body;
        const newSetting = new SystemSetting({
            ...data,
            updatedAt: new Date().toISOString(),
        });
        await newSetting.save();

        res.status(201).json({
            success: true,
            message: 'System setting created successfully',
            data: newSetting
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteSystemSetting = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await SystemSetting.findOneAndDelete({ id });

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'System setting not found' });
        }

        res.json({ success: true, message: 'System setting deleted successfully', data: deleted });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const editSystemSetting = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const updated = await SystemSetting.findOneAndUpdate(
            { id },
            { $set: { ...data, updatedAt: new Date().toISOString() } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'System setting not found' });
        }

        res.json({ success: true, message: 'System setting updated successfully', data: updated });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getSystemSetting = async (req, res) => {
    try {
        const { id } = req.params;
        const setting = await SystemSetting.findOne({ id });

        if (!setting) {
            return res.status(404).json({ success: false, error: 'System setting not found' });
        }

        res.json({ success: true, data: setting });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getAllSystemSettings = async (req, res) => {
    try {
        const settings = await SystemSetting.find();
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET subscription kill-switch — public
const getSubscriptionSetting = async (req, res) => {
    try {
        let setting = await SystemSetting.findOne({ id: 'subscription' });
        if (!setting) {
            // Default: subscriptions enabled
            return res.json({ success: true, data: { subscriptionsEnabled: true } });
        }
        res.json({ success: true, data: { subscriptionsEnabled: setting.subscriptionsEnabled } });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// PUT subscription kill-switch — admin only
const updateSubscriptionSetting = async (req, res) => {
    try {
        const { subscriptionsEnabled } = req.body;
        if (typeof subscriptionsEnabled !== 'boolean') {
            return res.status(400).json({ success: false, error: 'subscriptionsEnabled must be a boolean' });
        }

        const updated = await SystemSetting.findOneAndUpdate(
            { id: 'subscription' },
            { $set: { subscriptionsEnabled, updatedAt: new Date().toISOString() } },
            { new: true, upsert: true }
        );

        res.json({ success: true, data: { subscriptionsEnabled: updated.subscriptionsEnabled } });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET version check — called by mobile app on launch (public, no auth)
const getVersionCheck = async (req, res) => {
    try {
        const { version } = req.query;
        let setting = await SystemSetting.findOne({ id: 'subscription' });

        const forceUpdate     = setting?.forceUpdate     ?? false;
        const minimumVersion  = setting?.minimumVersion  ?? '1.0.0';
        const updateMessage   = setting?.updateMessage   ?? 'A new version is available. Please update the app to continue.';
        const storeUrlAndroid = setting?.storeUrlAndroid ?? '';
        const storeUrlIos     = setting?.storeUrlIos     ?? '';

        // Compare versions: split by '.' and compare each part numerically
        let needsUpdate = false;
        if (forceUpdate && version) {
            const current = version.split('.').map(Number);
            const minimum = minimumVersion.split('.').map(Number);
            for (let i = 0; i < 3; i++) {
                const c = current[i] || 0;
                const m = minimum[i] || 0;
                if (c < m) { needsUpdate = true; break; }
                if (c > m) { needsUpdate = false; break; }
            }
        }

        res.json({
            success:      true,
            forceUpdate:  forceUpdate && needsUpdate,
            minimumVersion,
            currentVersion: version || null,
            updateMessage,
            storeUrlAndroid,
            storeUrlIos,
        });
    } catch (error) {
        console.error('❌ getVersionCheck error:', error);
        // On error always allow the app through — never block due to server error
        res.json({ success: true, forceUpdate: false });
    }
};

// PUT update force-update settings — admin only
const updateForceUpdateSetting = async (req, res) => {
    try {
        const { forceUpdate, minimumVersion, updateMessage, storeUrlAndroid, storeUrlIos } = req.body;

        const update = { updatedAt: new Date().toISOString() };
        if (typeof forceUpdate     === 'boolean') update.forceUpdate     = forceUpdate;
        if (minimumVersion         !== undefined) update.minimumVersion  = minimumVersion;
        if (updateMessage          !== undefined) update.updateMessage   = updateMessage;
        if (storeUrlAndroid        !== undefined) update.storeUrlAndroid = storeUrlAndroid;
        if (storeUrlIos            !== undefined) update.storeUrlIos     = storeUrlIos;

        const updated = await SystemSetting.findOneAndUpdate(
            { id: 'subscription' },
            { $set: update },
            { new: true, upsert: true, returnDocument: 'after' }
        );

        res.json({ success: true, data: updated });
    } catch (error) {
        console.error('❌ updateForceUpdateSetting error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// GET force-update settings — admin only
const getForceUpdateSetting = async (req, res) => {
    try {
        const setting = await SystemSetting.findOne({ id: 'subscription' });
        res.json({
            success: true,
            data: {
                forceUpdate:      setting?.forceUpdate      ?? false,
                minimumVersion:   setting?.minimumVersion   ?? '1.0.0',
                updateMessage:    setting?.updateMessage    ?? 'A new version is available. Please update the app to continue.',
                storeUrlAndroid:  setting?.storeUrlAndroid  ?? '',
                storeUrlIos:      setting?.storeUrlIos      ?? '',
            },
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
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
};
