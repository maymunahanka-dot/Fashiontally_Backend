/**
 * subAdminController.js  — no Firebase
 *
 * createSubAdmin now creates an AuthUser in MongoDB (bcrypt) instead of
 * calling admin.auth().createUser() in Firebase.
 */

const crypto = require('crypto');
const SubAdmin = require('../models/SubAdmin');
const AuthUser = require('../models/AuthUser');
const { hashPassword } = require('../utils/passwordUtils');

const createSubAdmin = async (req, res) => {
  console.log('[subAdmin] ── CREATE SUBADMIN ──────────────────────────');
  try {
    const { name, email, phone, role, permissions } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'name and email are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const ownerEmail      = req.effectiveEmail;

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

    // Create AuthUser in MongoDB with bcrypt hash (no Firebase)
    console.log(`[subAdmin] Creating AuthUser for: ${normalizedEmail}`);
    const bcryptHash = await hashPassword(password);
    const uid        = crypto.randomUUID();

    await new AuthUser({
      email:         normalizedEmail,
      firebaseUid:   null,
      provider:      'email',
      bcryptHash,
      displayName:   name.trim(),
      emailVerified: false,
      disabled:      false,
    }).save();
    console.log('[subAdmin] AuthUser created ✅');

    const subAdmin = new SubAdmin({
      uid,
      name:        name.trim(),
      email:       normalizedEmail,
      phone:       phone || '',
      role:        role || 'SubAdmin',
      invitedBy:   ownerEmail,
      permissions: permissions || {},
    });

    await subAdmin.save();
    console.log('[subAdmin] SubAdmin saved ✅');

    res.status(201).json({
      success: true,
      message: 'SubAdmin created successfully',
      data:     subAdmin,
      password, // returned so frontend can display it once
    });
  } catch (error) {
    console.error('[subAdmin] createSubAdmin error:', error.message);
    // Mongo duplicate key
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

    res.json({ success: true, message: 'SubAdmin deleted successfully' });
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

    const updated = await SubAdmin.findOneAndUpdate(
      { email: normalizedEmail, invitedBy: ownerEmail },
      { $set: data },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'SubAdmin not found or not authorized' });
    }

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
