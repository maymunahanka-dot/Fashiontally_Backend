const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userId: { type: String, default: '' },
    email: { type: String, required: true },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    plantype: { type: String, default: '' },
    planPrice: { type: Number, default: 0 },
    status: { type: String, default: '' },
    gateway: { type: String, default: '' },
    paymentLink: { type: String, default: '' },
    transactionId: { type: String, default: '' },
    providerTransactionId: { type: String, default: '' },
    paidAt: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_payments', paymentSchema);
