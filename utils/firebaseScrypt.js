/**
 * firebaseScrypt.js
 *
 * Firebase scrypt password verification using project-specific parameters
 * fetched from: identitytoolkit.googleapis.com/v2/projects/fashiontallycloud/config
 *
 * Params:
 *   signerKey    x4WIMM29AgREoc80bEtA8oDf0yQXWl8HhxNJA9quxu7mIBmtZtadgWu9pfpD/Pil10DEwPUYdk1T/xW/F9HVew==
 *   saltSeparator Bw==
 *   rounds        8
 *   memCost       14
 */

const { FirebaseScrypt } = require('firebase-scrypt');

const SCRYPT_PARAMS = {
  memCost:       parseInt(process.env.FIREBASE_SCRYPT_MEM_COST  || '14', 10),
  rounds:        parseInt(process.env.FIREBASE_SCRYPT_ROUNDS    || '8',  10),
  saltSeparator: process.env.FIREBASE_SCRYPT_SALT_SEPARATOR     || 'Bw==',
  signerKey:     process.env.FIREBASE_SCRYPT_SIGNER_KEY         ||
    'x4WIMM29AgREoc80bEtA8oDf0yQXWl8HhxNJA9quxu7mIBmtZtadgWu9pfpD/Pil10DEwPUYdk1T/xW/F9HVew==',
};

// Single instance — constructed once at module load
const scryptInstance = new FirebaseScrypt(SCRYPT_PARAMS);

console.log('[firebaseScrypt] Loaded with params:', {
  memCost:       SCRYPT_PARAMS.memCost,
  rounds:        SCRYPT_PARAMS.rounds,
  saltSeparator: SCRYPT_PARAMS.saltSeparator,
  signerKey:     SCRYPT_PARAMS.signerKey.substring(0, 20) + '...',
});

/**
 * Verify a plain-text password against a Firebase scrypt hash.
 *
 * @param {string} password      plain-text from login request
 * @param {string} passwordHash  base64 hash from auth_users
 * @param {string} passwordSalt  base64 salt from auth_users
 * @returns {Promise<boolean>}
 */
async function verifyFirebasePassword(password, passwordHash, passwordSalt) {
  try {
    console.log('[firebaseScrypt] verifyFirebasePassword →');
    console.log('[firebaseScrypt]   saltLen:', passwordSalt?.length, '  hashLen:', passwordHash?.length);

    const isValid = await scryptInstance.verify(password, passwordSalt, passwordHash);

    console.log('[firebaseScrypt]   result:', isValid);
    return isValid;
  } catch (err) {
    console.error('[firebaseScrypt] Verification error:', err.message);
    return false;
  }
}

module.exports = { verifyFirebasePassword, SCRYPT_PARAMS };
