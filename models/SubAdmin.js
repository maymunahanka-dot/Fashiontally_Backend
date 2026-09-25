const mongoose = require('mongoose');

const subAdminSchema = new mongoose.Schema({
  uid:        { type: String, required: true, unique: true },
  name:       { type: String, required: true },
  email:      { type: String, required: true, unique: true },
  phone:      { type: String, default: '' },       // new backend field
  phoneNumber:{ type: String, default: '' },       // old app field — kept in sync
  role:       { type: String, default: 'SubAdmin' },
  invitedBy:  { type: String, required: true },    // owner's email
  permissions:{ type: mongoose.Schema.Types.Mixed, default: {} },
  status:     { type: String, default: 'active' },
  createdAt:  { type: String, default: () => new Date().toISOString() },
  updatedAt:  { type: String, default: () => new Date().toISOString() },
  password:   { type: String, default: '' },       // old app stores plain password for display
});

module.exports = mongoose.model('fashiontally_admins', subAdminSchema);
