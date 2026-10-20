/**
 * subAdminController.js
 *
 * createSubAdmin:
 *   1. Creates AuthUser in MongoDB (bcrypt) for new web login
 *   2. Creates Firebase Auth user so old mobile app can log in
 *   3. Saves SubAdmin doc in MongoDB
 *   4. Firestore doc is created via the firebaseSync middleware automatically
 *
 * Firebase → MongoDB sync is handled by syncScheduler (fashiontally_admins listener)
 */

const crypto = require('crypto');
const SubAdmin = require('../models/SubAdmin');
const AuthUser = require('../models/AuthUser');
const { hashPassword } = require('../utils/passwordUtils');
const admin = require('../firebase/firebase-admin');

const createSubAdmin = async (req, res) => {
  console.log('[subAdmin] ── CREATE SUBADMIN ──────────────────────────');
  try {
    const { name, email, phone, phoneNumber, role, permissions } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'name and email are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const ownerEmail      = req.effectiveEmail;
    // Support both 'phone' (new) and 'phoneNumber' (old app field name)
    const phoneValue      = phone || phoneNumber || '';

    // Check both SubAdmin and AuthUser for existing email
    console.log(`[subAdmin] Checking for existing records: ${normalizedEmail}`);
    const [existingSubAdmin, existingAuth] = await Promise.all([
      SubAdmin.findOne({ email: normalizedEmail }),
      AuthUser.findOne({ email: normalizedEmail }),
    ]);

    if (existingSubAdmin) {
      console.warn(`[subAdmin] SubAdmin already exists: ${normalizedEmail}`);
      return res.status(400).json({ success: false, error: 'SubAdmin already exists' });
    }
    if (existingAuth) {
      console.warn(`[subAdmin] Email already in use (auth_users): ${normalizedEmail}`);
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }

    // Generate password: firstName + "123456"
    const firstName = name.split(' ')[0].toLowerCase();
    const password  = `${firstName}123456`;

    // ── Step 1: Create AuthUser in MongoDB (bcrypt) for new web login ──
    console.log(`[subAdmin] Creating AuthUser in MongoDB: ${normalizedEmail}`);
    const bcryptHash = await hashPassword(password);
    const uid        = crypto.randomUUID();

    // ── Step 2: Create Firebase Auth user so old mobile app can log in ──
    let firebaseUid = null;
    try {
      const firebaseUser = await admin.auth().createUser({
        email:         normalizedEmail,
        password,
        displayName:   name.trim(),
        emailVerified: false,
      });
      firebaseUid = firebaseUser.uid;
      console.log(`[subAdmin] Firebase Auth user created: ${firebaseUid} ✅`);
    } catch (fbErr) {
      // Firebase user creation failed — log but don't block
      // Sub-admin can still log in via new web (bcrypt), just not old app
      if (fbErr.code === 'auth/email-already-exists') {
        // Firebase already has this user — get their UID
        try {
          const existing = await admin.auth().getUserByEmail(normalizedEmail);
          firebaseUid = existing.uid;
          console.log(`[subAdmin] Firebase user already exists, using uid: ${firebaseUid}`);
        } catch (_) {}
      } else {
        console.warn(`[subAdmin] Firebase Auth creation failed (non-fatal): ${fbErr.message}`);
      }
    }

    await new AuthUser({
      email:         normalizedEmail,
      firebaseUid,
      provider:      'email',
      bcryptHash,
      displayName:   name.trim(),
      emailVerified: false,
      disabled:      false,
    }).save();
    console.log('[subAdmin] AuthUser saved ✅');

    // ── Step 3: Save SubAdmin doc in MongoDB ──
    const subAdmin = new SubAdmin({
      uid:         firebaseUid || uid,
      name:        name.trim(),
      email:       normalizedEmail,
      phone:       phoneValue,
      phoneNumber: phoneValue, // keep both for compatibility with old app
      role:        role || 'SubAdmin',
      invitedBy:   ownerEmail,
      permissions: permissions || {},
      status:      'active',
    });

    await subAdmin.save();
    console.log('[subAdmin] SubAdmin saved ✅');

    // firebaseSync middleware will push this to Firestore automatically
    res.status(201).json({
      success:  true,
      message:  'SubAdmin created successfully',
      data:     subAdmin,
      password, // returned so frontend can display it once
    });
  } catch (error) {
    console.error('[subAdmin] createSubAdmin error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Email already in use' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteSubAdmin = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'SubAdmin email is required' });
    }

    const normalizedEmail = email.toLowerCase();
    const ownerEmail      = req.effectiveEmail;

    const deleted = await SubAdmin.findOneAndDelete({ email: normalizedEmail, invitedBy: ownerEmail });
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'SubAdmin not found or not authorized' });
    }

    // Also delete their AuthUser record
    await AuthUser.deleteOne({ email: normalizedEmail }).catch(() => {});

    // Also delete from Firebase Auth if they have a firebaseUid
    if (deleted.uid) {
      admin.auth().deleteUser(deleted.uid).catch(err => {
        console.warn(`[subAdmin] Firebase Auth delete failed (non-fatal): ${err.message}`);
      });
    }

    // firebaseSync middleware will push the delete to Firestore automatically
    res.json({ success: true, message: 'SubAdmin deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editSubAdmin = async (req, res) => {
  try {
    const { email, ...data } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: 'SubAdmin email is required' });
    }

    const normalizedEmail = email.toLowerCase();
    const ownerEmail      = req.effectiveEmail;

    // Normalise phone field — support both names
    if (data.phoneNumber && !data.phone) data.phone = data.phoneNumber;
    if (data.phone && !data.phoneNumber) data.phoneNumber = data.phone;

    const updated = await SubAdmin.findOneAndUpdate(
      { email: normalizedEmail, invitedBy: ownerEmail },
      { $set: data },
      { new: true, returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'SubAdmin not found or not authorized' });
    }

    // firebaseSync middleware will push the update to Firestore automatically
    res.json({ success: true, message: 'SubAdmin updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSubAdmin = async (req, res) => {
  try {
    const ownerEmail = req.effectiveEmail;
    const subAdmins  = await SubAdmin.find({ invitedBy: ownerEmail });
    res.json({ success: true, data: subAdmins });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { createSubAdmin, deleteSubAdmin, editSubAdmin, getSubAdmin };

