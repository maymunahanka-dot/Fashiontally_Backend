const crypto = require('crypto');
const PaymentLink = require('../models/PaymentLink');
const User = require('../models/User');
const { subscriptionSummary } = require('../services/subscriptionSummary');

/** How long a link from the app stays usable. */
const LINK_TTL_MS = 30 * 60 * 1000;

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Some accounts were saved with capital letters in the email, so match either way. */
const findUserByEmail = async (email) => {
  const value = String(email || '').trim();
  if (!value) return null;
  return (
    (await User.findOne({ email: value })) ||
    (await User.findOne({ email: new RegExp(`^${escapeRegex(value)}$`, 'i') }))
  );
};

const webBase = () =>
  String(process.env.FRONTEND_URL || process.env.WEB_APP_URL || 'https://www.fashiontally.com').replace(/\/+$/, '');

/**
 * POST /api/pay-link/create  (logged-in app user)
 * Returns a link to the web pay page for the account that pays the bills
 * (a team member's link pays for the owner's account).
 */
const createPaymentLink = async (req, res) => {
  try {
    const user = await findUserByEmail(req.effectiveEmail || req.user?.email);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    const { email } = user;

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + LINK_TTL_MS);
    await PaymentLink.create({ tokenHash: hashToken(token), email, expiresAt });

    res.json({ success: true, data: { url: `${webBase()}/pay?t=${token}`, expiresAt } });
  } catch (error) {
    console.error('[pay-link] create failed:', error.message);
    res.status(500).json({ success: false, error: 'Could not create payment link' });
  }
};

/**
 * GET /api/pay-link/:token  (public, used by the web pay page)
 * Returns only what the pay page needs to show and start Flutterwave checkout.
 */
const getPaymentLink = async (req, res) => {
  try {
    const link = await PaymentLink.findOne({ tokenHash: hashToken(req.params.token) });
    if (!link || link.expiresAt.getTime() < Date.now()) {
      return res.status(410).json({
        success: false,
        code: 'LINK_EXPIRED',
        error: 'This payment link has expired. Go back to the app and tap "Choose a plan & pay" again.',
      });
    }

    const user = await findUserByEmail(link.email);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const summary = subscriptionSummary(user);
    res.json({
      success: true,
      data: {
        uid: user.uid,
        name: user.name,
        email: user.email,
        phone: user.phoneNumber || user.phone || '',
        businessName: user.businessName || '',
        subscription: {
          status: summary.status,
          isActive: summary.isActive,
          plan: summary.plan,
          billingCycle: summary.billingCycle,
          endDate: summary.endDate,
          daysLeft: summary.daysLeft,
        },
        expiresAt: link.expiresAt,
      },
    });
  } catch (error) {
    console.error('[pay-link] get failed:', error.message);
    res.status(500).json({ success: false, error: 'Could not load payment link' });
  }
};

module.exports = { createPaymentLink, getPaymentLink };
