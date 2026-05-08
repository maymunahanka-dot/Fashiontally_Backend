const mongoose = require('mongoose');

const brandSettingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    businessName: { type: String, default: '' },
    businessEmail: { type: String, default: '' },
    businessPhone: { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    businessWebsite: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#000000' },
    secondaryColor: { type: String, default: '#ffffff' },
    footerText: { type: String, default: '' },
    termsAndConditions: { type: String, default: '' },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_brand_settings', brandSettingSchema);
