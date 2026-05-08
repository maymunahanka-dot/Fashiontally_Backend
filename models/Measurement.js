const mongoose = require('mongoose');

const measurementSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userEmail: { type: String, required: true },
  clientId: { type: String, required: true },
  name: { type: String, required: true },   // e.g. "Waist", "Bust"
  value: { type: String, required: true },  // e.g. "32"
  unit: { type: String, default: 'inches' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_measurements', measurementSchema);
