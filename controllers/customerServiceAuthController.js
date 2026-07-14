const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const CSCred = require('../models/CustomerServiceCredential');

// ── GET /api/cs-auth/status ───────────────────────────────────────────────────
// Public — tells the frontend whether a password has been set yet
const getStatus = async (req, res) => {
  try {
    const cred = await CSCred.findOne();
    res.json({ success: true, isSet: cred ? cred.isSet : false });
  } catch (error) {
    console.error('❌ CS auth status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── POST /api/cs-auth/set-password ────────────────────────────────────────────
// Public — only works when no password has been set yet (first-time setup)
const setPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const existing = await CSCred.findOne();
    if (existing && existing.isSet) {
      return res.status(403).json({ success: false, error: 'Password is already set. Use the login endpoint.' });
    }

    const hash = await bcrypt.hash(password.trim(), 12);

    if (existing) {
      existing.passwordHash = hash;
      existing.isSet        = true;
      existing.updatedAt    = new Date().toISOString();
      await existing.save();
    } else {
      await CSCred.create({ passwordHash: hash, isSet: true, updatedAt: new Date().toISOString() });
    }

    // Return a token immediately so they are logged in right after setting
    const token = jwt.sign({ role: 'customer_service' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: 'Password set successfully', token });
  } catch (error) {
    console.error('❌ CS set-password error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── POST /api/cs-auth/login ───────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'Password is required' });
    }

    const cred = await CSCred.findOne();
    if (!cred || !cred.isSet) {
      return res.status(401).json({ success: false, error: 'No password set yet.', noPasswordSet: true });
    }

    const match = await bcrypt.compare(password, cred.passwordHash);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Incorrect password' });
    }

    const token = jwt.sign({ role: 'customer_service' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } catch (error) {
    console.error('❌ CS login error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── PUT /api/cs-auth/update-pin ──────────────────────────────────────────────
// Admin-protected — change the CS pin at any time
const updatePin = async (req, res) => {
  try {
    const { newPin } = req.body;
    if (!newPin || newPin.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Pin must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(newPin.trim(), 12);
    const cred = await CSCred.findOne();

    if (cred) {
      cred.passwordHash = hash;
      cred.isSet        = true;
      cred.updatedAt    = new Date().toISOString();
      await cred.save();
    } else {
      await CSCred.create({ passwordHash: hash, isSet: true, updatedAt: new Date().toISOString() });
    }

    console.log('✅ CS pin updated by admin');
    res.json({ success: true, message: 'Customer service pin updated successfully' });
  } catch (error) {
    console.error('❌ CS update-pin error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getStatus, setPassword, login, updatePin };
