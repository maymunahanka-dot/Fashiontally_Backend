const User = require('../models/User');

// GET all users with subscription data
const getSubscriptions = async (req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });

    const usersList = users.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name || 'Unknown User',
      phone: u.phone || '',
      role: u.role || 'Designer',
      createdAt: u.createdAt,
      isSubscribed: u.isSubscribed || false,
      subscriptionType: u.subscriptionType || 'free',
      planType: u.planType || 'Free',
      paymentAmount: u.payment_amount || 0,
      subscriptionStartDate: u.trialStartDate || u.createdAt || null,
      subscriptionEndDate: u.subscriptionEndDate || null,
      isTrialActive: u.isTrialActive || false,
    }));

    const totalUsers = usersList.length;
    const subscribedUsers = usersList.filter((u) => u.isSubscribed).length;
    const trialUsers = usersList.filter((u) => u.subscriptionType === 'trial').length;
    const monthlyRevenue = usersList
      .filter((u) => u.subscriptionType === 'paid' && u.paymentAmount)
      .reduce((sum, u) => sum + u.paymentAmount, 0);

    res.json({
      success: true,
      data: { users: usersList, stats: { totalUsers, subscribedUsers, trialUsers, monthlyRevenue } },
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST grant trial to a user
const grantTrial = async (req, res) => {
  try {
    const { email, planType, months } = req.body;
    if (!email || !planType || !months) {
      return res.status(400).json({ success: false, error: 'email, planType and months are required' });
    }

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + parseInt(months));

    const updated = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          isSubscribed: true,
          subscriptionType: 'trial',
          planType,
          subscriptionEndDate: endDate.toISOString(),
          trialStartDate: new Date().toISOString(),
          isTrialActive: true,
          updatedAt: new Date().toISOString(),
        },
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: `Trial granted to ${updated.name}` });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST cancel subscription
const cancelSubscription = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, error: 'email is required' });

    const updated = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: {
          isSubscribed: false,
          subscriptionType: 'free',
          planType: 'Free',
          isTrialActive: false,
          subscriptionEndDate: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      { new: true }
    );

    if (!updated) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, message: `Subscription cancelled for ${updated.name}` });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getSubscriptions, grantTrial, cancelSubscription };
