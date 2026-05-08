const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    updatedBy: { type: String, default: '' },
    subscriptionsEnabled: { type: Boolean, default: true },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_system_settings', systemSettingSchema);
