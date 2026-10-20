const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
    id:                   { type: String, required: true, unique: true },
    updatedBy:            { type: String, default: '' },
    subscriptionsEnabled: { type: Boolean, default: true },
    // Force update fields
    forceUpdate:          { type: Boolean, default: false },
    minimumVersion:       { type: String, default: '1.0.0' },
    updateMessage:        { type: String, default: 'A new version is available. Please update the app to continue.' },
    storeUrlAndroid:      { type: String, default: '' },
    storeUrlIos:          { type: String, default: '' },
    updatedAt:            { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_system_settings', systemSettingSchema);
