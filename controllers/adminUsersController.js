const mongoose = require('mongoose');
const User = require('../models/User');
const SubAdmin = require('../models/SubAdmin');
const AuthUser = require('../models/AuthUser');
const Payment = require('../models/Payment');
const { subscriptionSummary } = require('../services/subscriptionSummary');
const { markDisabled } = require('../services/disabledAccounts');
const { sendNotification } = require('../services/notification.service');
const { sendAdminMessageEmail } = require('../services/emailService');
const { firebaseAccountTimes, joinedDate } = require('../services/firebaseAccountTimes');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exactEmail = (email) => new RegExp(`^${escapeRegex(String(email).trim())}$`, 'i');
const adminName = (req) => req.admin?.label || 'Admin';
const logEntry = (req, action, details, note) => ({
  action,
  details: details || '',
  note: String(note || '').trim().slice(0, 1000),
  admin: adminName(req),
  at: new Date().toISOString(),
});

/** Business records counted on the user detail panel: collection → fields holding the owner's email */
const COUNTED = {
  clients: ['fashiontally_clients', ['userEmail', 'tailorId']],
  orders: ['fashiontally_orders', ['userEmail', 'tailorId']],
  invoices: ['fashiontally_invoices', ['userEmail', 'tailorId']],
  inventory: ['fashiontally_inventory', ['userEmail', 'tailorId']],
  designs: ['fashiontally_designs', ['userEmail', 'tailorId']],
  measurements: ['fashiontally_measurements', ['userEmail']],
  appointments: ['fashiontally_appointments', ['userEmail']],
  transactions: ['fashiontally_transactions', ['userEmail', 'tailorId']],
};

/**
 * Finds the account an admin action is about. `id` is normally the email (any case);
 * older links may pass the Mongo _id. (Matching an email against _id used to crash.)
 */
const findTarget = async (userType, id) => {
  const value = decodeURIComponent(String(id || '')).trim();
  if (!value) return null;
  const Model = userType === 'admin' ? SubAdmin : User;
  if (value.includes('@')) return Model.findOne({ email: exactEmail(value) });
  if (mongoose.Types.ObjectId.isValid(value)) return Model.findById(value);
  return Model.findOne({ $or: [{ uid: value }, { id: value }] });
};

/** Sign-up method shown in the list */
const signupMethod = (user, auth) => {
  if (user.isPhoneBasedAccount) return 'phone';
  if (auth?.provider === 'google') return 'google';
  return 'email';
};

/** Turns the login on/off in MongoDB and (best effort) Firebase Auth, so the hourly sync can't undo it. */
const setLoginDisabled = async (email, disabled) => {
  const key = String(email).toLowerCase();
  await AuthUser.updateOne({ email: key }, { $set: { disabled, updatedAt: new Date() } });
  markDisabled(key, disabled);
  try {
    const admin = require('../firebase/firebase-admin');
    const fbUser = await admin.auth().getUserByEmail(key);
    await admin.auth().updateUser(fbUser.uid, { disabled });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') console.warn('[admin-users] firebase disable:', error.message);
  }
};

/** Latest of the given ISO dates (or null) */
const latest = (...values) =>
  values.filter((v) => v && !Number.isNaN(new Date(v).getTime())).sort((a, b) => new Date(b) - new Date(a))[0] || null;

/** Login + activity dates for one account */
const activityDates = (doc, fb) => ({
  createdAt: joinedDate(doc.createdAt, fb),
  lastLoginAt: latest(doc.lastLoginAt, fb?.signIn),
  lastActiveAt: latest(doc.lastLoginAt, fb?.signIn, fb?.refresh),
});

// GET all users + sub-admins (only what the admin list needs: no device tokens or passwords)
const getAllUsers = async (req, res) => {
  try {
    const [users, subAdmins, auths, payments, signIns] = await Promise.all([
      User.find({}, '-adminLog -bio -txRef -transactionId').sort({ createdAt: -1 }).lean(),
      SubAdmin.find({}, '-password -adminLog').sort({ createdAt: -1 }).lean(),
      AuthUser.find({}, 'email provider disabled emailVerified').lean(),
      Payment.find({ status: 'successful' }, 'email planPrice').lean(),
      firebaseAccountTimes(),
    ]);

    const authByEmail = new Map(auths.map((a) => [String(a.email).toLowerCase(), a]));
    const paidByEmail = new Map();
    for (const p of payments) {
      const key = String(p.email || '').toLowerCase();
      paidByEmail.set(key, (paidByEmail.get(key) || 0) + (Number(p.planPrice) || 0));
    }
    const teamByOwner = new Map();
    for (const a of subAdmins) {
      const key = String(a.invitedBy || '').toLowerCase();
      teamByOwner.set(key, (teamByOwner.get(key) || 0) + 1);
    }

    const now = Date.now();
    const usersList = users.map((u) => {
      const key = String(u.email || '').toLowerCase();
      const auth = authByEmail.get(key);
      const sum = subscriptionSummary(u, now);
      const { fcmTokens, ...rest } = u;
      return {
        ...rest,
        userType: 'user',
        phone: u.phone || u.phoneNumber || '',
        isActive: !auth?.disabled,
        status: auth?.disabled ? 'inactive' : 'active',
        emailVerified: Boolean(auth?.emailVerified),
        signupMethod: signupMethod(u, auth),
        subscriptionStatus: !u.subscriptionType && !sum.endDate ? 'free' : sum.status,
        subscriptionActive: sum.isActive,
        plan: sum.plan,
        billingCycle: sum.billingCycle,
        subscriptionEndDate: sum.endDate,
        daysLeft: sum.daysLeft,
        totalPaid: paidByEmail.get(key) || 0,
        teamCount: teamByOwner.get(key) || 0,
        deviceCount: (fcmTokens || []).length,
        ...activityDates(u, signIns.get(key)),
      };
    });

    const adminsList = subAdmins.map((a) => {
      const auth = authByEmail.get(String(a.email || '').toLowerCase());
      const ownerAuth = authByEmail.get(String(a.invitedBy || '').toLowerCase());
      const active = !auth?.disabled && a.status !== 'inactive';
      return {
        ...a,
        userType: 'admin',
        phone: a.phone || a.phoneNumber || '',
        isActive: active,
        status: active ? 'active' : 'inactive',
        ownerDisabled: Boolean(ownerAuth?.disabled),
        signupMethod: auth?.provider === 'google' ? 'google' : 'email',
        ...activityDates(a, signIns.get(String(a.email || '').toLowerCase())),
      };
    });

    res.json({ success: true, data: { users: usersList, admins: adminsList } });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET one account in detail: business record counts, payments, team, devices, admin history
const getUserDetails = async (req, res) => {
  try {
    const { userType, id } = req.params;
    const target = await findTarget(userType, id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    const email = String(target.email).toLowerCase();
    const ownerEmail = userType === 'admin' ? String(target.invitedBy || '').toLowerCase() : email;
    const db = mongoose.connection.db;
    const match = exactEmail(ownerEmail);

    const countEntries = await Promise.all(
      Object.entries(COUNTED).map(async ([label, [collection, fields]]) => {
        try {
          const n = await db.collection(collection).countDocuments({ $or: fields.map((f) => ({ [f]: match })) });
          return [label, n];
        } catch {
          return [label, null];
        }
      })
    );

    const [auth, payments, team, owner] = await Promise.all([
      AuthUser.findOne({ email }, 'provider disabled emailVerified createdAt').lean(),
      userType === 'admin' ? [] : Payment.find({ email: exactEmail(email) }).lean(),
      userType === 'admin' ? [] : SubAdmin.find({ invitedBy: exactEmail(email) }, 'name email status role lastLoginAt').lean(),
      userType === 'admin' ? User.findOne({ email: match }, 'name email businessName').lean() : null,
    ]);

    const t = target.toObject();
    res.json({
      success: true,
      data: {
        counts: Object.fromEntries(countEntries),
        subscription: userType === 'admin' ? null : subscriptionSummary(t),
        login: {
          provider: auth?.provider || null,
          disabled: Boolean(auth?.disabled),
          emailVerified: Boolean(auth?.emailVerified),
          lastLoginAt: t.lastLoginAt || null,
        },
        payments: payments
          .map((p) => ({
            id: p.id,
            amount: Number(p.planPrice) || 0,
            plan: p.plantype,
            billingCycle: p.billingCycle,
            status: p.status,
            gateway: p.gateway,
            reference: p.providerTransactionId || p.transactionId || '',
            paidAt: p.paidAt || p.createdAt,
          }))
          .sort((a, b) => new Date(b.paidAt || 0) - new Date(a.paidAt || 0)),
        team,
        owner,
        devices: (t.fcmTokens || []).map((d) => ({
          platform: d.platform,
          deviceName: d.deviceName,
          addedAt: d.addedAt,
          signedInAs: d.signedInAs,
          enabled: d.enabled !== false,
        })),
        adminLog: (t.adminLog || []).slice().reverse(),
      },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// PUT edit user (profile fields, and activate / deactivate)
const editUser = async (req, res) => {
  try {
    const { id, userType } = req.params;
    const { name, phone, role, country, state, language, isActive, notes } = req.body;

    const target = await findTarget(userType, id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    const update = { updatedAt: new Date().toISOString() };
    const changed = [];
    const setField = (field, value) => {
      if (value === undefined || value === target[field]) return;
      update[field] = value;
      changed.push(field);
    };
    setField('name', name);
    if (phone !== undefined) {
      setField('phone', phone);
      update.phoneNumber = phone; // the old apps read phoneNumber
    }
    setField('role', role);
    setField('country', country);
    setField('state', state);
    if (language === 'en' || language === 'fr') setField('language', language);

    const log = [];
    if (changed.length) log.push(logEntry(req, 'edit', `Edited ${changed.join(', ')}`, notes));

    if (typeof isActive === 'boolean') {
      await setLoginDisabled(target.email, !isActive);
      if (userType === 'admin') update.status = isActive ? 'active' : 'inactive';
      log.push(logEntry(req, isActive ? 'activate' : 'deactivate', isActive ? 'Account activated' : 'Account deactivated (cannot sign in or use the app)', notes));
    }

    const Model = userType === 'admin' ? SubAdmin : User;
    const updated = await Model.findOneAndUpdate(
      { _id: target._id },
      { $set: update, ...(log.length ? { $push: { adminLog: { $each: log } } } : {}) },
      { new: true, projection: '-password -fcmTokens' }
    ).lean();

    res.json({ success: true, message: 'User updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE user. An owner is removed everywhere (login, profile, team and all business
 * data, MongoDB and Firebase) using the same code as "Delete my account" in the apps.
 * A team member only loses their own login.
 */
const deleteUser = async (req, res) => {
  try {
    const { id, userType } = req.params;
    const target = await findTarget(userType, id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    if (userType === 'admin') {
      const { removeTeamMember } = require('./subAdminController');
      await removeTeamMember(target.email, String(target.invitedBy || '').toLowerCase(), {
        notice: `${target.name || target.email} was removed from your team by FashionTally support.`,
      });
      markDisabled(target.email, false);
      console.log(`[admin-users] ${adminName(req)} deleted team member ${target.email}`);
      return res.json({ success: true, message: 'Team member deleted' });
    }

    const { deleteAccountEverywhere } = require('../services/accountDeletion.service');
    const summary = await deleteAccountEverywhere(target.email, [target.email, target.originalEmail]);
    markDisabled(target.email, false);
    console.log(`[admin-users] ${adminName(req)} deleted account ${target.email}:`, JSON.stringify(summary));
    res.json({
      success: true,
      message: summary.errors.length ? 'User deleted, but some records could not be removed' : 'User and all their data deleted',
      data: summary,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST add an admin note to an account
const addNote = async (req, res) => {
  try {
    const { userType, id } = req.params;
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, error: 'note is required' });
    const target = await findTarget(userType, id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    const entry = logEntry(req, 'note', 'Note', note);
    const Model = userType === 'admin' ? SubAdmin : User;
    await Model.updateOne({ _id: target._id }, { $push: { adminLog: entry } });
    res.json({ success: true, data: entry });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST email the user a password reset link
const sendPasswordReset = async (req, res) => {
  try {
    const { userType, id } = req.params;
    const target = await findTarget(userType, id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    const authUser = await AuthUser.findOne({ email: String(target.email).toLowerCase() });
    if (!authUser) return res.status(404).json({ success: false, error: 'This account has no login record' });
    if (authUser.provider === 'google' && !authUser.bcryptHash && !authUser.passwordHash) {
      return res.status(400).json({ success: false, error: 'This account signs in with Google, so it has no password to reset' });
    }
    const { sendResetLink } = require('./forgotPasswordController');
    await sendResetLink(target, authUser);
    const Model = userType === 'admin' ? SubAdmin : User;
    await Model.updateOne({ _id: target._id }, { $push: { adminLog: logEntry(req, 'password_reset', 'Sent a password reset email') } });
    res.json({ success: true, message: `Password reset email sent to ${target.email}` });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/** Push and/or email one owner account. Returns what was sent. */
const notifyOne = async (req, user, { title, message, push, email }) => {
  const sent = [];
  if (push) {
    await sendNotification(String(user._id), title, message, { type: 'admin_message' }, { audience: 'owner' }).catch(() => {});
    sent.push('push');
  }
  if (email) {
    const r = await sendAdminMessageEmail(user.email, { name: user.name, subject: title, message });
    if (r?.success) sent.push('email');
  }
  await User.updateOne(
    { _id: user._id },
    { $push: { adminLog: logEntry(req, 'message', `Sent ${sent.join(' + ') || 'nothing'}: ${title}`, message) } }
  );
  return sent;
};

const readMessage = (body) => ({
  title: String(body.title || '').trim().slice(0, 120),
  message: String(body.message || '').trim().slice(0, 2000),
  push: body.push !== false,
  email: Boolean(body.email),
});

// POST send a push notification and/or email to one user
const notifyUser = async (req, res) => {
  try {
    const { userType, id } = req.params;
    const msg = readMessage(req.body);
    if (!msg.title || !msg.message) return res.status(400).json({ success: false, error: 'title and message are required' });
    if (!msg.push && !msg.email) return res.status(400).json({ success: false, error: 'Choose push, email or both' });
    if (userType === 'admin') return res.status(400).json({ success: false, error: 'Messages can only be sent to account owners' });
    const target = await findTarget('user', id);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });
    const sent = await notifyOne(req, target, msg);
    res.json({ success: true, message: sent.length ? `Sent by ${sent.join(' and ')}` : 'Nothing could be sent', sent });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST bulk action on selected accounts.
 * body: { action: 'activate'|'deactivate'|'notify', targets: [{ userType, id }], title, message, push, email, notes }
 */
const bulkAction = async (req, res) => {
  try {
    const { action, notes } = req.body;
    const targets = Array.isArray(req.body.targets) ? req.body.targets.slice(0, 500) : [];
    if (!targets.length) return res.status(400).json({ success: false, error: 'No users selected' });
    if (!['activate', 'deactivate', 'notify'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Unknown action' });
    }
    const msg = readMessage(req.body);
    if (action === 'notify' && (!msg.title || !msg.message)) {
      return res.status(400).json({ success: false, error: 'title and message are required' });
    }

    let done = 0;
    const skipped = [];
    for (const t of targets) {
      const target = await findTarget(t.userType, t.id);
      if (!target) {
        skipped.push(t.id);
        continue;
      }
      if (action === 'notify') {
        if (t.userType === 'admin') {
          skipped.push(target.email);
          continue;
        }
        await notifyOne(req, target, msg);
      } else {
        const active = action === 'activate';
        await setLoginDisabled(target.email, !active);
        const Model = t.userType === 'admin' ? SubAdmin : User;
        await Model.updateOne(
          { _id: target._id },
          {
            $set: { updatedAt: new Date().toISOString(), ...(t.userType === 'admin' ? { status: active ? 'active' : 'inactive' } : {}) },
            $push: { adminLog: logEntry(req, action, active ? 'Account activated (bulk)' : 'Account deactivated (bulk)', notes) },
          }
        );
      }
      done += 1;
    }
    res.json({ success: true, message: `${done} account(s) updated${skipped.length ? `, ${skipped.length} skipped` : ''}`, done, skipped });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET export all user emails as CSV
const exportUserEmails = async (req, res) => {
  try {
    const users = await User.find({}, 'email -_id').lean();

    const csvRows = ['email', ...users.map((u) => u.email)];
    const csvContent = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="user_emails.csv"');
    res.status(200).send(csvContent);
  } catch (error) {
    console.error('❌ Error exporting emails:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  getAllUsers,
  getUserDetails,
  editUser,
  deleteUser,
  addNote,
  sendPasswordReset,
  notifyUser,
  bulkAction,
  exportUserEmails,
};
