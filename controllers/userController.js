const User = require('../models/User');
const { sendAccountDeletedEmail } = require('../services/emailService');
const { subscriptionSummary } = require('../services/subscriptionSummary');

/**
 * Profile fields a user may set themselves. Everything else — subscription,
 * payment, email, ids, devices — is only ever changed by the backend
 * (e.g. after a confirmed payment), so it's dropped from requests.
 */
const EDITABLE_PROFILE_FIELDS = [
  'name', 'displayName', 'phone', 'phoneNumber', 'bio', 'photoURL',
  'country', 'state', 'lga', 'address',
  'businessName', 'businessCategory', 'logoUrl',
];

const profileFieldsFrom = (body) =>
  Object.fromEntries(Object.entries(body || {}).filter(([key]) => EDITABLE_PROFILE_FIELDS.includes(key)));

const createUser = async (req, res) => {
  try {
    const data = profileFieldsFrom(req.body);
    const newUser = new User({ ...data, email: req.effectiveEmail });
    await newUser.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: newUser
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    // A team member's requests act on the owner's account (req.effectiveEmail).
    // "Delete my account" for them must remove only their own team-member login.
    const signedInEmail = String(req.user?.email || '').toLowerCase();
    const ownerEmail    = String(req.effectiveEmail || '').toLowerCase();
    if (signedInEmail && signedInEmail !== ownerEmail) {
      const { removeTeamMember } = require('./subAdminController');
      const member = await removeTeamMember(signedInEmail, ownerEmail, {
        notice: `${signedInEmail} deleted their team member account.`,
      });
      if (!member) return res.status(404).json({ success: false, error: 'Team member account not found' });
      res.json({ success: true, message: 'Your team member account was deleted', data: { email: member.email } });
      sendAccountDeletedEmail(member.email, member.name);
      return;
    }

    const owner = await User.findOne({ email: req.effectiveEmail });
    if (!owner) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Login, Firebase user, profile, team and all business data — MongoDB and Firebase
    const { deleteAccountEverywhere } = require('../services/accountDeletion.service');
    const summary = await deleteAccountEverywhere(owner.email, [owner.email, owner.originalEmail]);
    if (summary.errors.length) console.error('[deleteUser] partial failures:', summary.errors);

    res.json({ success: true, message: 'User deleted successfully', data: owner });
    sendAccountDeletedEmail(owner.email, owner.name);
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editUser = async (req, res) => {
  try {
    // A team member's requests point at the owner's account; they can't edit the owner's profile
    if (String(req.user?.email || '').toLowerCase() !== String(req.effectiveEmail || '').toLowerCase()) {
      return res.status(403).json({ success: false, error: "Only the account owner can edit this profile." });
    }

    const data = profileFieldsFrom(req.body);
    const updated = await User.findOneAndUpdate(
      { email: req.effectiveEmail },
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getUser = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.effectiveEmail });

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // A team member gets their own language, not the owner's
    let language = user.language || 'en';
    if (String(req.user?.email || '').toLowerCase() !== String(req.effectiveEmail || '').toLowerCase()) {
      const SubAdmin = require('../models/SubAdmin');
      const member = await SubAdmin.findOne({ email: String(req.user.email).toLowerCase() }).select('language').lean();
      language = member?.language || 'en';
    }

    // `subscription` is the single summary both the web and mobile apps display.
    res.json({ success: true, data: { ...user.toObject(), language, subscription: subscriptionSummary(user) } });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/user/language  { language: 'en' | 'fr' }
 * Saves the signed-in person's app language (owner on the account, team member on their own record).
 */
const setLanguage = async (req, res) => {
  try {
    const language = String(req.body?.language || '').toLowerCase();
    if (!['en', 'fr'].includes(language)) {
      return res.status(400).json({ success: false, error: "Language must be 'en' or 'fr'" });
    }
    const me = String(req.user?.email || '').toLowerCase();
    const isOwner = me === String(req.effectiveEmail || '').toLowerCase();
    if (isOwner) {
      await User.updateOne({ email: req.effectiveEmail }, { $set: { language, updatedAt: new Date().toISOString() } });
    } else {
      const SubAdmin = require('../models/SubAdmin');
      await SubAdmin.updateOne({ email: me }, { $set: { language, updatedAt: new Date().toISOString() } });
    }
    res.json({ success: true, data: { language } });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  setLanguage,
  createUser,
  deleteUser,
  editUser,
  getUser,
};
