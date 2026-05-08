const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    userEmail: { type: String, required: true },
    tailorId: { type: String, default: '' },
    status: { type: String, default: 'Active' },
    totalSpent: { type: Number, default: 0 },
    lastOrder: { type: String, default: null },
    notes: { type: String, default: '' },
    dressType: { type: String, default: '' },
    sleeveType: { type: String, default: '' },

    // Measurements
    neck: { type: String, default: '' },
    chest: { type: String, default: '' },
    breastPoint: { type: String, default: '' },
    shoulder: { type: String, default: '' },
    waist: { type: String, default: '' },
    hips: { type: String, default: '' },
    thigh: { type: String, default: '' },
    knees: { type: String, default: '' },
    inseam: { type: String, default: '' },
    sleeveLength: { type: String, default: '' },
    shirtLength: { type: String, default: '' },
    blouseLength: { type: String, default: '' },
    skirtLength: { type: String, default: '' },
    trouserLength: { type: String, default: '' },

    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_clients', clientSchema);
