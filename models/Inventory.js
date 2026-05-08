const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    userEmail: { type: String, required: true },
    tailorId: { type: String, default: '' },
    name: { type: String, default: '' },
    sku: { type: String, default: '' },
    category: { type: String, default: '' },
    subcategory: { type: String, default: '' },
    supplierName: { type: String, default: '' },
    quantity: { type: Number, default: 0 },
    unit: { type: String, default: '' },
    price: { type: Number, default: 0 },
    reorderPoint: { type: Number, default: 0 },
    color: { type: String, default: '' },
    description: { type: String, default: '' },
    status: { type: String, default: 'In Stock' },
    createdAt: { type: String, default: () => new Date().toISOString() },
    updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_inventory', inventorySchema, 'fashiontally_inventory');
