const mongoose = require('mongoose');

const brandSettingSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    businessName: { type: String, default: '' },
    businessEmail: { type: String, default: '' },
    businessPhone: { type: String, default: '' },
    businessAddress: { type: String, default: '' },
    businessWebsite: { type: String, default: '' },
    instagramHandle: { type: String, default: '' },
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountName: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#000000' },
    secondaryColor: { type: String, default: '#ffffff' },
    footerText: { type: String, default: '' },
    termsAndConditions: { type: String, default: '' },
    // Currency money is shown in (any ISO code, e.g. NGN, USD, CNY). Amounts are always saved in Naira.
    inventoryCurrency: {
        type: String,
        default: 'NGN',
        uppercase: true,
        trim: true,
        validate: { validator: (v) => /^[A-Z]{3}$/.test(v), message: 'Currency must be a 3-letter code like NGN or USD' },
    },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_brand_settings', brandSettingSchema);
