const SubscriptionCancelation = require('../models/SubscriptionCancelation');
const User = require('../models/User');
const { sendSubscriptionCancelledEmail } = require('../services/emailService');
const { notifyByEmail } = require('../services/notification.service');

// All routes run behind verifyToken: req.effectiveEmail is the account being acted on
// (the owner's, even when a team member is signed in) and req.user.email is who signed in.
const accountEmail = (req) => String(req.effectiveEmail || '').toLowerCase();
const isTeamMember = (req) => String(req.user?.email || '').toLowerCase() !== accountEmail(req);

/** Cancellation records belong to the signed-in account (older records may differ in case). */
const ownRecords = (req) => ({
  userEmail: new RegExp(`^${accountEmail(req).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
});

const createSubscriptionCancelation = async (req, res) => {
  try {
    if (isTeamMember(req)) {
      return res.status(403).json({ success: false, error: 'Only the account owner can cancel the subscription.' });
    }

    // Cancel the signed-in account — never an email taken from the request body
    const userEmail = accountEmail(req);
    const user = await User.findOne({ email: userEmail });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const { reason, userName } = req.body || {};

    // Save cancellation record (plan details come from the account, not the request)
    const cancelation = new SubscriptionCancelation({
      userEmail,
      userId:              user.uid,
      userName:            user.name || userName,
      planType:            user.planType,
      subscriptionType:    user.subscriptionType,
      reason,
      subscriptionEndDate: user.subscriptionEndDate,
      isTrialActive:       user.isTrialActive,
      cancelledAt:         new Date().toISOString(),
    });
    await cancelation.save();

    // Reset user subscription in MongoDB
    await User.findOneAndUpdate(
      { email: userEmail },
      {
        $set: {
          isSubscribed: false,
          subscriptionType: 'free',
          planType: 'Free',
          subscriptionEndDate: null,
          isTrialActive: false,
        },
      }
    );

    res.status(201).json({ success: true, message: 'Subscription cancelled successfully', data: cancelation });
    sendSubscriptionCancelledEmail(userEmail, { name: user.name, planType: user.planType });
    notifyByEmail(
      userEmail,
      'Subscription cancelled',
      `Your ${user.planType || 'FashionTally'} subscription has been cancelled. Your data is safe — resubscribe any time.`,
      { type: 'subscription_cancelled' },
      { audience: 'owner' },
    );
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteSubscriptionCancelation = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SubscriptionCancelation.findOneAndDelete({ _id: id, ...ownRecords(req) });
    if (!deleted) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editSubscriptionCancelation = async (req, res) => {
  try {
    const { id } = req.params;
    const { userEmail, _id, ...changes } = req.body || {}; // a record can't be moved to another account
    const updated = await SubscriptionCancelation.findOneAndUpdate(
      { _id: id, ...ownRecords(req) },
      { $set: changes },
      { new: true },
    );
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSubscriptionCancelation = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await SubscriptionCancelation.findOne({ _id: id, ...ownRecords(req) });
    if (!record) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: record });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getSubscriptionCancelationByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    if (String(email || '').toLowerCase() !== accountEmail(req)) {
      return res.status(403).json({ success: false, error: 'You can only view your own cancellations.' });
    }
    const records = await SubscriptionCancelation.find(ownRecords(req));
    res.json({ success: true, data: records });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createSubscriptionCancelation,
  deleteSubscriptionCancelation,
  editSubscriptionCancelation,
  getSubscriptionCancelation,
  getSubscriptionCancelationByEmail,
};
