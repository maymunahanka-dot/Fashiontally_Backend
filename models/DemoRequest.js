const mongoose = require('mongoose');

const demoRequestSchema = new mongoose.Schema({
  id:            { type: String, required: true, unique: true },
  fullName:      { type: String, required: true },
  email:         { type: String, required: true },
  phoneNumber:   { type: String, default: '' },
  businessName:  { type: String, default: '' },
  businessType:  { type: String, default: '' },
  preferredDate: { type: String, default: '' },
  preferredTime: { type: String, default: '' },
  message:       { type: String, default: '' },
  status:        { type: String, default: 'pending' },
  seen:          { type: Boolean, default: false },
  createdAt:     { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_demo_requests', demoRequestSchema);
