/**
 * passwordUtils.js
 *
 * Unified password helpers — handles both legacy Firebase scrypt and bcrypt.
 *
 * Strategy:
 *   - Existing (imported) users  → passwordHash / passwordSalt (Firebase scrypt)
 *   - New signups                → bcryptHash
 *   - After first successful scrypt login → transparently migrate to bcrypt
 */

const bcrypt = require('bcryptjs');
const { verifyFirebasePassword } = require('./firebaseScrypt');

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plain-text password with bcrypt.
 * Used for new signups and password resets.
 */
async function hashPassword(password) {
  console.log('[passwordUtils] hashPassword: bcrypt rounds=' + BCRYPT_ROUNDS);
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify password against an AuthUser document.
 *
 * Returns { valid: boolean, needsMigration: boolean }
 *   needsMigration = true  →  caller should migrate this user to bcrypt.
 *
 * @param {string} password   plain-text from request
 * @param {object} authUser   AuthUser mongoose document
 */
async function verifyPassword(password, authUser) {
  const email = authUser.email;

  // ── Path 1: bcrypt (new / already migrated) ──
  if (authUser.bcryptHash) {
    console.log(`[passwordUtils] [${email}] bcrypt path`);
    const valid = await bcrypt.compare(password, authUser.bcryptHash);
    console.log(`[passwordUtils] [${email}] bcrypt result: ${valid}`);
    return { valid, needsMigration: false };
  }

  // ── Path 2: Firebase scrypt (legacy) ──
  if (authUser.passwordHash && authUser.passwordSalt) {
    console.log(`[passwordUtils] [${email}] Firebase scrypt path (legacy)`);
    const valid = await verifyFirebasePassword(password, authUser.passwordHash, authUser.passwordSalt);
    console.log(`[passwordUtils] [${email}] Firebase scrypt result: ${valid}`);
    return { valid, needsMigration: valid }; // migrate only on success
  }

  console.warn(`[passwordUtils] [${email}] No password hash found`);
  return { valid: false, needsMigration: false };
}

/**
 * Migrate a user from Firebase scrypt → bcrypt.
 * Call after a successful Firebase scrypt login.
 * Non-fatal — errors are logged but swallowed so login still succeeds.
 *
 * @param {object} authUser  AuthUser mongoose doc
 * @param {string} password  plain-text password that just verified
 */
async function migrateTobcrypt(authUser, password) {
  try {
    console.log(`[passwordUtils] [${authUser.email}] Migrating → bcrypt`);
    authUser.bcryptHash   = await bcrypt.hash(password, BCRYPT_ROUNDS);
    authUser.passwordHash = null;
    authUser.passwordSalt = null;
    await authUser.save();
    console.log(`[passwordUtils] [${authUser.email}] Migration done ✅`);
  } catch (err) {
    console.error(`[passwordUtils] [${authUser.email}] Migration failed (non-fatal):`, err.message);
  }
}

module.exports = { hashPassword, verifyPassword, migrateTobcrypt };
