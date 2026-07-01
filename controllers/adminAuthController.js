const AdminCredential = require('../models/AdminCredential');
const jwt = require('jsonwebtoken');

// Check if any admin code has been set up yet
const hasCode = async (req, res) => {
  try {
    const count = await AdminCredential.countDocuments();
    res.json({ success: true, hasCode: count > 0 });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// First-time setup: create the initial admin code
const setupCode = async (req, res) => {
  try {
    // Only allowed when no code exists yet
    const count = await AdminCredential.countDocuments();
    if (count > 0) {
      return res.status(403).json({ success: false, error: 'Admin code already set. Use the login page.' });
    }

    const { code, label } = req.body;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }
    if (code.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Code must be at least 6 characters' });
    }

    await AdminCredential.create({ code: code.trim(), label: label?.trim() || 'Admin', isActive: true });
    console.log('✅ Admin code created via setup');
    res.json({ success: true, message: 'Admin code set successfully. You can now log in.' });
  } catch (error) {
    console.error('❌ Setup error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

const adminLogin = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const credential = await AdminCredential.findOne({ code: code.trim() });

    console.log('🔐 Admin login attempt:');
    console.log('   Entered code :', code.trim());
    console.log('   DB code      :', credential ? credential.code : '(no match found)');

    if (!credential) {
      return res.status(401).json({ success: false, error: 'Invalid code. Please check and try again.' });
    }

    if (!credential.isActive) {
      return res.status(401).json({ success: false, error: 'This code is not active. Please contact administrator.' });
    }

    // Create JWT token
    const token = jwt.sign(
      { role: 'admin', label: credential.label },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ success: true, token });
  } catch (error) {
    console.error('❌ Admin login error:', error);
    res.status(500).json({ success: false, error: 'An error occurred. Please try again.' });
  }
};

const adminLogout = (req, res) => {
  res.clearCookie('adminToken');
  res.json({ success: true, message: 'Logged out' });
};

module.exports = { hasCode, setupCode, adminLogin, adminLogout };
