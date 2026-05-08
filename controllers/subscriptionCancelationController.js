const SubscriptionCancelation = require('../models/SubscriptionCancelation');
const User = require('../models/User');

const createSubscriptionCancelation = async (req, res) => {
  try {
    const { userEmail, userId, userName, planType, subscriptionType, reason, subscriptionEndDate, isTrialActive } = req.body;

    // Save cancellation record
    const cancelation = new SubscriptionCancelation({
      userEmail,
      userId,
      userName,
      planType,
      subscriptionType,
      reason,
      subscriptionEndDate,
      isTrialActive,
      cancelledAt: new Date().toISOString(),
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
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deleteSubscriptionCancelation = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await SubscriptionCancelation.findByIdAndDelete(id);
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
    const updated = await SubscriptionCancelation.findByIdAndUpdate(id, { $set: req.body }, { new: true });
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
    const record = await SubscriptionCancelation.findById(id);
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
    const records = await SubscriptionCancelation.find({ userEmail: email.toLowerCase() });
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
