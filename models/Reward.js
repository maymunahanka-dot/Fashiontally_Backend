const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tailorId: { type: String, required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    pointsCost: { type: Number, default: 0 },
    icon: { type: String, default: '' },
    category: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    usageCount: { type: Number, default: 0 },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_rewards', rewardSchema);
