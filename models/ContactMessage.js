const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  id:       { type: String, required: true, unique: true },
  name:     { type: String, required: true },
  email:    { type: String, required: true },
  company:  { type: String, default: '' },
  phone:    { type: String, default: '' },
  subject:  { type: String, default: '' },
  message:  { type: String, required: true },
  priority: { type: String, default: 'medium' },
  status:   { type: String, default: 'new' },
  seen:     { type: Boolean, default: false },
  createdAt:{ type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_contact_messages', contactMessageSchema);
