/**
 * services/accountDeletion.service.js
 *
 * Permanently deletes an owner's account and everything it created, in both
 * MongoDB and Firebase (Firestore + Firebase Auth):
 *   - the login (auth_users) and Firebase Auth user — otherwise the hourly
 *     auth sync would recreate the login and the email couldn't sign up again
 *   - the profile, brand settings and settings
 *   - their team members (records, logins, Firebase users)
 *   - all business data: clients (+ measurements), orders, designs, invoices,
 *     inventory, appointments, transactions, CRM, payments, support tickets, ...
 *
 * Each collection lists the field that links a record to the account. Fields
 * holding a *client's* email (e.g. loyaltyMembers.email) are deliberately not used.
 */

const mongoose = require('mongoose');
const admin    = require('../firebase/firebase-admin');

/** MongoDB collection → fields that hold the owner's email */
const MONGO_OWNED = {
  fashiontally_users:                    ['email'],
  auth_users:                            ['email'],
  fashiontally_admins:                   ['invitedBy'],
  fashiontally_clients:                  ['userEmail'],
  fashiontally_measurements:             ['userEmail'],
  fashiontally_orders:                   ['userEmail'],
  fashiontally_designs:                  ['userEmail'],
  fashiontally_invoices:                 ['userEmail'],
  fashiontally_inventory:                ['userEmail'],
  fashiontally_appointments:             ['userEmail'],
  fashiontally_appointment_blocks:       ['userEmail'],
  fashiontally_transactions:             ['userEmail'],
  fashiontally_settings:                 ['userEmail'],
  fashiontally_brand_settings:           ['userEmail'],
  fashiontally_support_tickets:          ['userEmail'],
  fashiontally_subscription_cancelations: ['userEmail'],
  fashiontally_sms:                      ['userEmail', 'tailorId'],
  feedback:                              ['userEmail'],
  campaigns:                             ['userEmail', 'tailorId'],
  loyaltyMembers:                        ['tailorId'],
  rewards:                               ['tailorId'],
  fashiontally_rewards:                  ['tailorId'],
  payments:                              ['email'],
  fashiontally_payments:                 ['email'],
  fashiontally_contact_messages:         ['email'],
  fashiontally_demo_requests:            ['email'],
  notification_logs:                     ['email'],
  otp_codes:                             ['target'],
};

/** Firestore collection → fields that hold the owner's email */
const FIRESTORE_OWNED = {
  fashiontally_users:          ['email'],
  fashiontally_admins:         ['invitedBy'],
  fashiontally_clients:        ['userEmail'], // measurements subcollections go with them
  fashiontally_orders:         ['userEmail'],
  fashiontally_designs:        ['userEmail'],
  fashiontally_invoices:       ['userEmail'],
  fashiontally_inventory:      ['userEmail'],
  fashiontally_appointments:   ['userEmail'],
  fashiontally_transactions:   ['userEmail'],
  fashiontally_settings:       ['userEmail'],
  fashiontally_brand_settings: ['userEmail'],
  fashiontally_sms:            ['userEmail', 'tailorId'],
  feedback:                    ['userEmail'],
  campaigns:                   ['userEmail', 'tailorId'],
  loyaltyMembers:              ['tailorId'],
  rewards:                     ['tailorId'],
  payments:                    ['email'],
};

const exactEmail = (email) => new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/** Deletes a Firebase Auth user by email; missing users are fine. */
const deleteFirebaseAuthUser = async (email, counts) => {
  try {
    const user = await admin.auth().getUserByEmail(email);
    await admin.auth().deleteUser(user.uid);
    counts.firebaseAuthUsers += 1;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      counts.errors.push(`firebase auth ${email}: ${error.message}`);
    }
  }
};

/**
 * @param {string} ownerEmail
 * @param {string[]} [emailVariants] - extra spellings stored in Firestore (exact-match there)
 * @returns {Promise<object>} counts of what was deleted, plus any errors
 */
const deleteAccountEverywhere = async (ownerEmail, emailVariants = []) => {
  const email = String(ownerEmail).trim().toLowerCase();
  const variants = [...new Set([email, ...emailVariants.map((e) => String(e || '').trim()).filter(Boolean)])];
  const counts = { mongo: {}, firestore: {}, firebaseAuthUsers: 0, teamMembers: 0, errors: [] };
  const db = mongoose.connection.db;
  const fs = admin.firestore();

  // ── 1. Team members: their logins and Firebase users (records go below) ──
  const members = await db.collection('fashiontally_admins').find({ invitedBy: exactEmail(email) }).project({ email: 1 }).toArray();
  for (const member of members) {
    if (!member.email) continue;
    counts.teamMembers += 1;
    await db.collection('auth_users').deleteOne({ email: exactEmail(member.email) });
    await deleteFirebaseAuthUser(member.email.toLowerCase(), counts);
  }

  // ── 2. The owner's Firebase Auth user, before anything can resync it ──
  await deleteFirebaseAuthUser(email, counts);

  // ── 3. Firestore (recursiveDelete also removes subcollections, e.g. measurements) ──
  for (const [name, fields] of Object.entries(FIRESTORE_OWNED)) {
    try {
      const refs = new Map();
      for (const field of fields) {
        for (const value of variants) {
          const snap = await fs.collection(name).where(field, '==', value).get();
          snap.forEach((doc) => refs.set(doc.ref.path, doc.ref));
        }
      }
      for (const ref of refs.values()) await fs.recursiveDelete(ref);
      if (refs.size) counts.firestore[name] = refs.size;
    } catch (error) {
      counts.errors.push(`firestore ${name}: ${error.message}`);
    }
  }

  // ── 4. MongoDB ──
  for (const [name, fields] of Object.entries(MONGO_OWNED)) {
    try {
      const { deletedCount } = await db.collection(name).deleteMany({
        $or: fields.map((field) => ({ [field]: exactEmail(email) })),
      });
      if (deletedCount) counts.mongo[name] = deletedCount;
    } catch (error) {
      counts.errors.push(`mongo ${name}: ${error.message}`);
    }
  }

  console.log(`[account-deletion] ${email}:`, JSON.stringify(counts));
  return counts;
};

module.exports = { deleteAccountEverywhere, MONGO_OWNED, FIRESTORE_OWNED };
