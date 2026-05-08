const mongoose = require('mongoose');

const subAdminSchema = new mongoose.Schema({
  uid:        { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  phone:      { type: String, default: '' },
  role:       { type: String, default: 'SubAdmin' },
  invitedBy:  { type: String, required: true }, // owner's email
  permissions:{ type: mongoose.Schema.Types.Mixed, default: {} },
  status:     { type: String, default: 'active' },
  createdAt:  { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_admins', subAdminSchema);
