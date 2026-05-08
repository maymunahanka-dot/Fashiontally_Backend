const mongoose = require('mongoose');

const loyaltyMemberSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    tailorId: { type: String, required: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    level: { type: String, default: '' },
    points: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
    lastActivity: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('LoyaltyMember', loyaltyMemberSchema, 'loyaltyMembers');
