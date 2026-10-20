const mongoose = require('mongoose');

const customerServiceCredentialSchema = new mongoose.Schema({
  passwordHash: { type: String, default: '' },
  isSet:        { type: Boolean, default: false },
  updatedAt:    { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_cs_credential', customerServiceCredentialSchema);
