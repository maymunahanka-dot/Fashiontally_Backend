const crypto = require('crypto');

/** Cryptographically secure random hex token */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Token expiry Date (default 60 min) */
function tokenExpiry(minutes = 60) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

module.exports = { generateToken, tokenExpiry };
