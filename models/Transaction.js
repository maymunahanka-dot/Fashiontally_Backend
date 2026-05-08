const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    tailorId: { type: String, default: '' },
    type: { type: String, default: '' },
    category: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    paymentMethod: { type: String, default: '' },
    reference: { type: String, default: '' },
    description: { type: String, default: '' },
    notes: { type: String, default: '' },
    date: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_transactions', transactionSchema);
