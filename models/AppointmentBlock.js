const mongoose = require('mongoose');

const appointmentBlockSchema = new mongoose.Schema({
  userEmail: { type: String, required: true, unique: true },
  blockWeekends: { type: Boolean, default: false },
  dates: { type: [String], default: [] },
  updatedAt: { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model(
  'fashiontally_appointment_blocks',
  appointmentBlockSchema,
  'fashiontally_appointment_blocks'
);
