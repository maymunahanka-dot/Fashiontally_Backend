const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
    category: { type: String, default: '' },
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    tailorId: { type: String, default: '' },
    invoiceNumber: { type: String, default: '' },
    clientName: { type: String, default: '' },
    clientEmail: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    status: { type: String, default: 'Unpaid' },
    paymentMethod: { type: String, default: '' },
    items: { type: [invoiceItemSchema], default: [] },
    linkedDesigns: { type: [String], default: [] },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    notes: { type: String, default: '' },
    requiresSignature: { type: Boolean, default: false },
    signatureNote: { type: String, default: '' },
    createdDate: { type: String, default: () => new Date().toISOString() },
    dueDate: { type: String, default: '' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_invoices', invoiceSchema);
