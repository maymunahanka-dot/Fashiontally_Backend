const mongoose = require('mongoose');

/**
 * Admin emails sent per day (Lagos date, YYYY-MM-DD). Kept in the database so every server
 * running the backend shares one count and the daily cap holds.
 */
const emailQuotaSchema = new mongoose.Schema({
  day: { type: String, required: true, unique: true },
  sent: { type: Number, default: 0 },
});

module.exports = mongoose.model('fashiontally_email_quota', emailQuotaSchema);
