const mongoose = require('mongoose');

// Same collection as the main backend — fashiontally_orders
const orderSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  userEmail:   { type: String, required: true },
  tailorId:    { type: String, default: '' },
  clientName:  { type: String, default: '' },
  clientPhone: { type: String, default: '' },
  clientId:    { type: String, default: '' },
  orderDate:   { type: String, default: '' },
  dueDate:     { type: String, default: '' },
  status:      { type: String, default: 'in-progress' },
  paymentStatus:{ type: String, default: 'partial' },
  garmentType: { type: String, default: '' },
  garmentDescription: { type: String, default: '' },
  quantity:    { type: Number, default: 1 },
  price:       { type: Number, default: 0 },
  deposit:     { type: Number, default: 0 },
  balance:     { type: Number, default: 0 },
  createdAt:   { type: String, default: () => new Date().toISOString() },
  updatedAt:   { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_orders', orderSchema, 'fashiontally_orders');
