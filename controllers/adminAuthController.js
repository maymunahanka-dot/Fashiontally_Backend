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

    const enteredCode = code.trim();

    // ── DEBUG: count total docs in collection ──────────────────────────
    const totalDocs = await AdminCredential.countDocuments();
    console.log('🔐 Admin login attempt:');
    console.log('   Entered code          :', enteredCode);
    console.log('   Entered code length   :', enteredCode.length);
    console.log('   Entered code charCodes:', [...enteredCode].map(c => c.charCodeAt(0)).join(', '));
    console.log('   DB: collection        :', AdminCredential.collection.name);
    console.log('   DB: total docs        :', totalDocs);

    if (totalDocs === 0) {
      console.warn('⚠️  fashiontally_admin_credentials collection is EMPTY — no codes have been saved to MongoDB.');
      console.warn('   The add-admin-code.js script saves codes to FIRESTORE, not MongoDB. That is why login fails.');
      console.warn('   Fix: use POST /api/admin/setup to create a code in MongoDB, or insert one directly.');
    }

    // ── DEBUG: list all stored codes ───────────────────────────────────
    const allCreds = await AdminCredential.find({}, { code: 1, label: 1, isActive: 1 }).lean();
    if (allCreds.length > 0) {
      console.log('   DB: stored codes:');
      allCreds.forEach((c, i) => {
        console.log(`     [${i}] code="${c.code}" (len=${c.code.length}) label="${c.label}" isActive=${c.isActive}`);
        console.log(`         charCodes: ${[...c.code].map(ch => ch.charCodeAt(0)).join(', ')}`);
      });
    }

    const credential = await AdminCredential.findOne({ code: enteredCode });
    console.log('   Match found           :', credential ? `YES — label="${credential.label}"` : 'NO');

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

    console.log('✅ Admin login SUCCESS for label:', credential.label);
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
