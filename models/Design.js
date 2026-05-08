const mongoose = require('mongoose');

const designSchema = new mongoose.Schema({
  id:             { type: String, required: true, unique: true },
  userEmail:      { type: String, required: true },
  tailorId:       { type: String, default: '' },
  name:           { type: String, default: '' },
  title:          { type: String, default: '' },
  category:       { type: String, default: '' },
  customCategory: { type: String, default: '' },
  description:    { type: String, default: '' },
  clientId:       { type: String, default: '' },
  clientName:     { type: String, default: '' },
  clientPhone:    { type: String, default: '' },
  price:          { type: Number, default: 0 },
  imageUrl:       { type: String, default: '' },
  images:         { type: [String], default: [] },
  progress:       { type: Number, default: 0 },
  status:         { type: String, default: 'Active' },
  dueDate:        { type: String, default: '' },
  createdAt:      { type: String, default: () => new Date().toISOString() },
  updatedAt:      { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_designs', designSchema);
