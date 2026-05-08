const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    id: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    tailorId: { type: String, default: '' },
    clientId: { type: String, default: '' },
    clientName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    comment: { type: String, default: '' },
    productName: { type: String, default: '' },
    orderNumber: { type: String, default: '' },
    invoiceNumber: { type: String, default: '' },
    status: { type: String, default: 'pending' },
    isPublic: { type: Boolean, default: true },
    reply: { type: String, default: '' },
    repliedAt: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('Feedback', feedbackSchema, 'feedback');
