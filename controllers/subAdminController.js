const SubAdmin = require('../models/SubAdmin');
const { admin } = require('../server');

const createSubAdmin = async (req, res) => {
  try {
    const { name, email, phone, role, permissions } = req.body;

    if (!email || !name) {
      return res.status(400).json({ success: false, error: 'name and email are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const ownerEmail = req.effectiveEmail;

    const existing = await SubAdmin.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(400).json({ success: false, error: 'SubAdmin already exists' });
    }

    // Generate password: first name + "123456"
    const firstName = name.split(' ')[0].toLowerCase();
    const password = `${firstName}123456`;

    // Create Firebase Auth user via Admin SDK (no auto-login side effects)
    const userRecord = await admin.auth().createUser({
      email: normalizedEmail,
      password,
      displayName: name.trim(),
    });

    const subAdmin = new SubAdmin({
      uid: userRecord.uid,
      name: name.trim(),
      email: normalizedEmail,
      phone: phone || '',
      role: role || 'SubAdmin',
      invitedBy: ownerEmail,
      permissions: permissions || {},
    });

    await subAdmin.save();
    res.status(201).json({
      success: true,
      message: 'SubAdmin created successfully',
      data: subAdmin,
      password, // return so frontend can display it
    });
  } catch (error) {
    console.error('❌ Error:', error);
    if (error.code === 'auth/email-already-exists') {
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
    const ownerEmail = req.effectiveEmail;

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
    const ownerEmail = req.effectiveEmail;

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
    const subAdmins = await SubAdmin.find({ invitedBy: ownerEmail });
    res.json({ success: true, data: subAdmins });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createSubAdmin,
  deleteSubAdmin,
  editSubAdmin,
  getSubAdmin,
};
