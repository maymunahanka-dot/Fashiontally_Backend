const mongoose = require('mongoose');

const adminCredentialSchema = new mongoose.Schema({
  code:     { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  label:    { type: String, default: '' },
  createdAt:{ type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_admin_credentials', adminCredentialSchema);
