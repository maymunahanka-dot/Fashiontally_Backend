const AdminCredential = require('../models/AdminCredential');
const jwt = require('jsonwebtoken');

const adminLogin = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Code is required' });
    }

    const credential = await AdminCredential.findOne({ code: code.trim() });

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

module.exports = { adminLogin, adminLogout };
