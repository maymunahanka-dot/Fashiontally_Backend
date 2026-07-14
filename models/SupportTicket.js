const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender:    { type: String, enum: ['user', 'support'], required: true },
  text:      { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { _id: false });

const supportTicketSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  userEmail:   { type: String, required: true },
  category:    { type: String, required: true },
  subIssue:    { type: String, required: true },
  description: { type: String, required: true },
  dateNoticed: { type: String, default: '' },
  status:      { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  attachments: { type: [String], default: [] },
  messages:    { type: [messageSchema], default: [] },
  createdAt:   { type: String, default: () => new Date().toISOString() },
  updatedAt:   { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_support_tickets', supportTicketSchema);
