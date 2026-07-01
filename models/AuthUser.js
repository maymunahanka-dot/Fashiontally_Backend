const mongoose = require('mongoose');

/**
 * AuthUser — stores credentials for auth_users collection.
 *
 * password handling:
 *   passwordHash / passwordSalt  → Firebase scrypt (legacy imported users)
 *   bcryptHash                   → bcrypt (new signups + migrated users)
 *
 * On every successful Firebase-scrypt login the user is transparently
 * migrated to bcrypt so Firebase dependency fades away over time.
 */
const authUserSchema = new mongoose.Schema({
  email:               { type: String, required: true, unique: true, lowercase: true, trim: true },
  firebaseUid:         { type: String, default: null },
  provider:            { type: String, default: 'email' }, // 'email' | 'google'
  googleUid:           { type: String, default: null },

  // Legacy Firebase scrypt (imported users)
  passwordHash:        { type: String, default: null },
  passwordSalt:        { type: String, default: null },

  // New bcrypt (new signups + migrated users)
  bcryptHash:          { type: String, default: null },

  displayName:         { type: String, default: '' },
  photoURL:            { type: String, default: '' },
  emailVerified:       { type: Boolean, default: false },
  disabled:            { type: Boolean, default: false },

  // Our own token-based password reset
  requiresPasswordReset: { type: Boolean, default: false },
  resetToken:          { type: String, default: null },
  resetTokenExpiry:    { type: Date,   default: null },

  createdAt:           { type: Date, default: Date.now },
  updatedAt:           { type: Date, default: Date.now },
});

authUserSchema.pre('save', async function () {
  this.updatedAt = new Date();
});

module.exports = mongoose.model('auth_users', authUserSchema);
