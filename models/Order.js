const mongoose = require('mongoose');

const measurementsSchema = new mongoose.Schema({
    chest: { type: String, default: '' },
    hips: { type: String, default: '' },
    length: { type: String, default: '' },
    notes: { type: String, default: '' },
    shoulder: { type: String, default: '' },
    sleeveLength: { type: String, default: '' },
    waist: { type: String, default: '' },
}, { _id: false });

const orderSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    tailorId: { type: String, default: '' },
    clientName: { type: String, default: '' },
    clientPhone: { type: String, default: '' },
    clientId: { type: String, default: '' },
    orderDate: { type: String, default: '' },
    dueDate: { type: String, default: '' },
    status: { type: String, default: 'in-progress' },
    paymentStatus: { type: String, default: 'partial' },
    garmentType: { type: String, default: '' },
    garmentDescription: { type: String, default: '' },
    specialInstructions: { type: String, default: '' },
    color: { type: String, default: '' },
    fabric: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    price: { type: Number, default: 0 },
    deposit: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    measurements: { type: measurementsSchema, default: () => ({}) },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_orders', orderSchema);
