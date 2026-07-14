const mongoose = require('mongoose');

const designSchema = new mongoose.Schema({
  id:                 { type: String, required: true, unique: true },
  userEmail:          { type: String, required: true },
  tailorId:           { type: String, default: '' },

  // Shared type flag — "design" or "order"
  type:               { type: String, default: 'design' },

  // Design fields
  name:               { type: String, default: '' },
  title:              { type: String, default: '' },
  category:           { type: String, default: '' },
  customCategory:     { type: String, default: '' },
  description:        { type: String, default: '' },
  imageUrl:           { type: String, default: '' },
  images:             { type: [String], default: [] },
  progress:           { type: Number, default: 0 },
  status:             { type: String, default: 'Active' },

  // Client info
  clientId:           { type: String, default: '' },
  clientName:         { type: String, default: '' },
  clientPhone:        { type: String, default: '' },
  clientEmail:        { type: String, default: '' },

  // Pricing
  price:              { type: Number, default: 0 },
  basePrice:          { type: Number, default: 0 },
  deposit:            { type: Number, default: 0 },
  depositPaid:        { type: Number, default: 0 },
  balance:            { type: Number, default: 0 },
  balanceDue:         { type: Number, default: 0 },
  paymentStatus:      { type: String, default: '' },

  // Order-specific fields
  orderType:          { type: String, default: '' },
  garmentType:        { type: String, default: '' },
  garmentDescription: { type: String, default: '' },
  fabric:             { type: String, default: '' },
  materials:          { type: [String], default: [] },
  color:              { type: String, default: '' },
  quantity:           { type: Number, default: 1 },
  measurements:       { type: mongoose.Schema.Types.Mixed, default: {} },
  additionalItems:    { type: [mongoose.Schema.Types.Mixed], default: [] },
  specialInstructions:{ type: String, default: '' },
  notes:              { type: String, default: '' },
  orderDate:          { type: String, default: '' },
  dueDate:            { type: String, default: '' },

  createdAt:          { type: String, default: () => new Date().toISOString() },
  updatedAt:          { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_designs', designSchema);
