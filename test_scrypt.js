/**
 * test_scrypt.js  — verify Firebase scrypt works against a real auth_users record
 *
 * Usage:
 *   node test_scrypt.js <email> <password>
 *
 * Returns:
 *   true  → scrypt params correct, password matches, login will work
 *   false → wrong password OR scrypt params mismatch
 */

require('dotenv').config();
const mongoose = require('mongoose');
const AuthUser = require('./models/AuthUser');
const { verifyFirebasePassword } = require('./utils/firebaseScrypt');

const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node test_scrypt.js <email> <password>');
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || 'ft' });
  console.log('✅ MongoDB connected\n');

  const authUser = await AuthUser.findOne({ email: email.toLowerCase() });
  if (!authUser) {
    console.error(`❌ No auth_users record found for: ${email}`);
    process.exit(1);
  }

  console.log(`📋 Auth record for: ${authUser.email}`);
  console.log(`   provider:      ${authUser.provider}`);
  console.log(`   hasBcrypt:     ${!!authUser.bcryptHash}`);
  console.log(`   hasFirebase:   ${!!(authUser.passwordHash && authUser.passwordSalt)}`);
  console.log(`   requiresReset: ${authUser.requiresPasswordReset}\n`);

  if (authUser.bcryptHash) {
    console.log('ℹ️  Already migrated to bcrypt — use test_login.js instead');
    await mongoose.disconnect();
    return;
  }

  if (!authUser.passwordHash || !authUser.passwordSalt) {
    console.error('❌ No password hash of any kind found');
    await mongoose.disconnect();
    return;
  }

  console.log(`🔑 Testing Firebase scrypt for: ${email}`);
  console.log(`   salt (first 10): ${authUser.passwordSalt.substring(0, 10)}...`);
  console.log(`   hash (first 10): ${authUser.passwordHash.substring(0, 10)}...\n`);

  const result = await verifyFirebasePassword(password, authUser.passwordHash, authUser.passwordSalt);

  if (result) {
    console.log('✅ Firebase scrypt PASSED — password correct');
    console.log('   (next login will auto-migrate this user to bcrypt)');
  } else {
    console.log('❌ Firebase scrypt FAILED — wrong password or scrypt params mismatch');
  }

  await mongoose.disconnect();
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
