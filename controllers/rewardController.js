const Reward = require('../models/Reward');

const createReward = async (req, res) => {
    try {
        const data = req.body;
        const newReward = new Reward({
            ...data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        await newReward.save();

        res.status(201).json({
            success: true,
            message: 'Reward created successfully',
            data: newReward
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const deleteReward = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Reward.findOneAndDelete({ id });

        if (!deleted) {
            return res.status(404).json({ success: false, error: 'Reward not found' });
        }

        res.json({ success: true, message: 'Reward deleted successfully', data: deleted });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const editReward = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const updated = await Reward.findOneAndUpdate(
            { id },
            { $set: { ...data, updatedAt: new Date().toISOString() } },
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ success: false, error: 'Reward not found' });
        }

        res.json({ success: true, message: 'Reward updated successfully', data: updated });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getReward = async (req, res) => {
    try {
        const { id } = req.params;
        const reward = await Reward.findOne({ id });

        if (!reward) {
            return res.status(404).json({ success: false, error: 'Reward not found' });
        }

        res.json({ success: true, data: reward });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

const getRewardByEmail = async (req, res) => {
    try {
        const { email } = req.params;
        const rewards = await Reward.find({ tailorId: email });

        res.json({ success: true, data: rewards });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = {
    createReward,
    deleteReward,
    editReward,
    getReward,
    getRewardByEmail
};
