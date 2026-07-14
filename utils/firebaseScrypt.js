

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
