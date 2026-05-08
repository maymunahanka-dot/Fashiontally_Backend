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

module.exports = {
    createSystemSetting,
    deleteSystemSetting,
    editSystemSetting,
    getSystemSetting,
    getAllSystemSettings,
    getSubscriptionSetting,
    updateSubscriptionSetting,
};
