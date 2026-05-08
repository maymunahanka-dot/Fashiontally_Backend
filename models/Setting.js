const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    theme: { type: String, default: 'light' },
    fontSize: { type: String, default: 'medium' },
    compactMode: { type: Boolean, default: false },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_settings', settingSchema);
