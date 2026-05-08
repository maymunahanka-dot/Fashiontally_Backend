const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
    id:            { type: String, required: true, unique: true },
    clientName:    { type: String, default: '' },
    date:          { type: String, default: '' },
    time:          { type: String, default: '' },
    purpose:       { type: String, default: '' },
    appointmentType: { type: String, default: '' },
    duration:      { type: String, default: '' },
    notes:         { type: String, default: '' },
    status:        { type: String, default: 'Scheduled' },
    location:      { type: String, default: 'Shop' },
    phone:         { type: String, default: '' },
    email:         { type: String, default: '' },
    userEmail:     { type: String, required: true },
    createdAt:     { type: String, default: () => new Date().toISOString() },
    updatedAt:     { type: String, default: () => new Date().toISOString() },
});

module.exports = mongoose.model('fashiontally_appointments', appointmentSchema);
