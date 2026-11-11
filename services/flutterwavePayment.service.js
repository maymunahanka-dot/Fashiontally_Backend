const Payment = require('../models/Payment');
const User = require('../models/User');
const { sendSubscriptionReceipt, sendPaymentFailedEmail } = require('./emailService');
const { sendOnce } = require('./notificationOnce');
const { sendNotification } = require('./notification.service');

/** "Payment successful" push to the account owner's devices. Never throws. */
const pushPaymentSuccess = (user, payment = {}) => {
  if (!user?._id) return;
  const plan = payment.plantype || payment.planType || user.planType || 'FashionTally';
  const end = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
  const until = end && end > new Date()
    ? ` until ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : '';
  sendNotification(
    String(user._id),
    '✅ Payment successful',
    `Your ${plan} plan is active${until}. Thank you!`,
    { type: 'payment_success' },
    { audience: 'owner' },
  ).catch(() => {});
};

const PLAN_PRICES = {
  STARTER: 5000,
  GROWTH: 10000,
  PROFESSIONAL: 15000,
};

// Yearly = 10 months' price (same as the web app's config/subscriptionPricing.js)
const YEARLY_PLAN_PRICES = {
  STARTER: 50000,
  GROWTH: 100000,
  PROFESSIONAL: 150000,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Monthly or yearly is decided by what was actually paid, never by what the
 * browser says: paying at least the plan's yearly price gives 365 days.
 */
const billingFor = (plan, amount) =>
  Number(amount) >= (YEARLY_PLAN_PRICES[plan] || Infinity)
    ? { billingCycle: 'yearly', days: 365 }
    : { billingCycle: 'monthly', days: 30 };

/**
 * New end date for a payment. Renewing a paid plan early keeps the days already
 * paid for: the new period starts when the current one ends. Trials and expired
 * plans start from the payment date (paying ends a free trial).
 */
const newSubscriptionEnd = (user, paidAt, days) => {
  const paidAtMs = new Date(paidAt).getTime();
  const currentEnd = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate).getTime() : NaN;
  const start = user?.subscriptionType === 'paid' && currentEnd > paidAtMs ? currentEnd : paidAtMs;
  return new Date(start + days * DAY_MS).toISOString();
};

/**
 * Start of the paid period shown to the user. An early renewal extends the
 * current period, so it keeps that period's start; otherwise it's the payment date.
 */
const newSubscriptionStart = (user, paidAt) => {
  const paidAtMs = new Date(paidAt).getTime();
  const currentEnd = user?.subscriptionEndDate ? new Date(user.subscriptionEndDate).getTime() : NaN;
  const renewingEarly = user?.subscriptionType === 'paid' && currentEnd > paidAtMs;
  return renewingEarly ? user.subscriptionStartDate || user.payment_date || paidAt : paidAt;
};

/**
 * The plan the amount actually paid covers. The requested plan comes from the
 * browser, so it's only honoured if enough was paid; otherwise the best plan the
 * money covers is used. Throws if it doesn't cover even the cheapest plan.
 */
const planCoveredBy = (requestedPlan, amount) => {
  const paid = Number(amount) || 0;
  if (paid >= (PLAN_PRICES[requestedPlan] || Infinity)) return requestedPlan;
  const covered = ['PROFESSIONAL', 'GROWTH', 'STARTER'].find((p) => paid >= PLAN_PRICES[p]);
  if (!covered) {
    throw new Error(`Amount paid (₦${paid}) is below the cheapest plan (₦${PLAN_PRICES.STARTER}) — not activated`);
  }
  console.warn(`[payment] ₦${paid} doesn't cover ${requestedPlan} (₦${PLAN_PRICES[requestedPlan]}) — activating ${covered} instead`);
  return covered;
};

const normalizePlan = (value) => {
  const plan = String(value || '').trim().toUpperCase();
  if (plan === 'STARTER' || plan === 'GROWTH' || plan === 'PROFESSIONAL') return plan;
  return '';
};

const planFromAmount = (amount) => {
  const value = Number(amount) || 0;
  if (value >= YEARLY_PLAN_PRICES.PROFESSIONAL) return 'PROFESSIONAL';
  if (value >= YEARLY_PLAN_PRICES.GROWTH) return 'GROWTH';
  if (value >= YEARLY_PLAN_PRICES.STARTER) return 'STARTER';
  if (value >= PLAN_PRICES.PROFESSIONAL) return 'PROFESSIONAL';
  if (value >= PLAN_PRICES.GROWTH) return 'GROWTH';
  if (value >= PLAN_PRICES.STARTER) return 'STARTER';
  return 'GROWTH';
};

const getSecretKey = () =>
  process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLW_SECRET_KEY || '';

const getWebhookHash = () =>
  process.env.FLUTTERWAVE_SECRET_HASH || process.env.FLW_SECRET_HASH || '';

const hasSecretKey = () => Boolean(getSecretKey());

/**
 * Parse tx_ref formats:
 * - subscription-{userKey}-{PLAN}-{timestamp}
 * - subscription-{userKey}-{timestamp}  (legacy)
 */
const parseTxRef = (txRef) => {
  const raw = String(txRef || '').trim();
  if (!raw) return { userKey: '', plan: '' };

  const parts = raw.split('-');
  if (parts[0] !== 'subscription' || parts.length < 3) {
    return { userKey: '', plan: '' };
  }

  const maybePlan = normalizePlan(parts[parts.length - 2]);
  if (maybePlan) {
    return {
      userKey: parts.slice(1, -2).join('-'),
      plan: maybePlan,
    };
  }

  return {
    userKey: parts.slice(1, -1).join('-'),
    plan: '',
  };
};

const findUserForPayment = async ({ userKey, email }) => {
  const candidates = [email, userKey]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const value of candidates) {
    // Emails are compared without caring about capital letters (some accounts were saved with them).
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let user = await User.findOne({ email: new RegExp(`^${escaped}$`, 'i') });
    if (user) return user;

    user = await User.findOne({ uid: value });
    if (user) return user;

    user = await User.findOne({ id: value });
    if (user) return user;
  }

  return null;
};

const verifyFlutterwaveTransaction = async (transactionId) => {
  const secret = getSecretKey();
  if (!secret) {
    throw new Error('Flutterwave secret key is not configured on the server');
  }
  if (!transactionId) {
    throw new Error('transactionId is required');
  }

  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const payload = await response.json();
  if (!response.ok || payload.status !== 'success' || !payload.data) {
    throw new Error(payload.message || 'Failed to verify Flutterwave transaction');
  }

  return payload.data;
};

/**
 * Idempotent activation from a verified Flutterwave transaction payload.
 */
const activateFromVerifiedTransaction = async (tx, options = {}) => {
  if (!tx || String(tx.status || '').toLowerCase() !== 'successful') {
    throw new Error('Payment was not successful');
  }

  if (tx.currency && String(tx.currency).toUpperCase() !== 'NGN') {
    throw new Error(`Unexpected currency: ${tx.currency}`);
  }

  const providerTransactionId = String(tx.id || '');
  if (providerTransactionId) {
    const existing = await Payment.findOne({ providerTransactionId });
    if (existing) {
      const user = await User.findOne({ email: existing.email });
      return {
        alreadyProcessed: true,
        payment: existing,
        user,
        message: 'Payment was already activated',
      };
    }
  }

  const parsed = parseTxRef(tx.tx_ref);
  const meta = tx.meta || {};
  const requestedPlan =
    normalizePlan(options.planType) ||
    normalizePlan(meta.plantype || meta.planType || meta.plan) ||
    parsed.plan ||
    planFromAmount(tx.amount);
  // tx.amount is what Flutterwave confirms was received
  const plan = planCoveredBy(requestedPlan, tx.amount);

  // Public verify must map from Flutterwave customer / tx_ref only.
  // Admin recover may pass emailOverride when the payer email differs from the account.
  const flwEmail = String(meta.email || tx.customer?.email || '').trim().toLowerCase();
  const overrideEmail = options.allowEmailOverride
    ? String(options.email || '').trim().toLowerCase()
    : '';

  const user = await findUserForPayment({
    userKey: parsed.userKey || meta.userId || '',
    email: overrideEmail || flwEmail,
  });

  if (!user) {
    throw new Error(
      `No FashionTally user found for this payment (email: ${overrideEmail || flwEmail || 'n/a'}, tx_ref: ${tx.tx_ref || 'n/a'})`
    );
  }

  const paidAt = tx.created_at || new Date().toISOString();
  const { billingCycle, days } = billingFor(plan, tx.amount);
  const subscriptionEndDate = newSubscriptionEnd(user, paidAt, days);
  const subscriptionStartDate = newSubscriptionStart(user, paidAt);
  const planPrice = Number(tx.amount) || PLAN_PRICES[plan] || 0;

  const payment = new Payment({
    id: `PAY-${providerTransactionId || Date.now()}`,
    userId: user.uid || user.id || '',
    email: user.email,
    name: tx.customer?.name || user.name || '',
    phone: tx.customer?.phone_number || user.phone || '',
    plantype: plan,
    planPrice,
    billingCycle,
    status: 'successful',
    gateway: options.gateway || 'flutterwave',
    transactionId: tx.tx_ref || '',
    providerTransactionId,
    paidAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  try {
    await payment.save();
  } catch (error) {
    // Race: webhook + callback both saved the same provider id
    if (error?.code === 11000 && providerTransactionId) {
      const existing = await Payment.findOne({ providerTransactionId });
      if (existing) {
        return {
          alreadyProcessed: true,
          payment: existing,
          user,
          message: 'Payment was already activated',
        };
      }
    }
    throw error;
  }

  const updatedUser = await User.findOneAndUpdate(
    { email: user.email },
    {
      $set: {
        isSubscribed: true,
        subscriptionType: 'paid',
        planType: plan,
        subscriptionEndDate,
        subscriptionStartDate,
        billingCycle,
        isTrialActive: false,
        payment_amount: planPrice,
        payment_date: paidAt,
        txRef: tx.tx_ref || '',
        transactionId: providerTransactionId,
        updatedAt: new Date().toISOString(),
      },
    },
    { new: true }
  );

  sendSubscriptionReceipt(user.email, payment.toObject(), updatedUser || user).catch(() => {});
  pushPaymentSuccess(updatedUser || user, payment);

  return {
    alreadyProcessed: false,
    payment,
    user: updatedUser || user,
    message: 'Subscription activated',
  };
};

const verifyAndActivate = async ({
  transactionId,
  txRef,
  email,
  planType,
  allowEmailOverride = false,
}) => {
  const tx = await verifyFlutterwaveTransaction(transactionId);

  if (txRef && tx.tx_ref && String(tx.tx_ref) !== String(txRef)) {
    throw new Error('Transaction reference mismatch');
  }

  const status = String(tx.status || '').toLowerCase();
  // Bank transfer / USSD often stays pending until Flutterwave confirms
  if (status === 'pending' || status === 'processing') {
    return {
      pending: true,
      alreadyProcessed: false,
      payment: null,
      user: null,
      message: 'Payment is still processing. Bank transfers can take a few minutes.',
      transaction: tx,
    };
  }

  return activateFromVerifiedTransaction(tx, {
    email,
    planType,
    allowEmailOverride,
  });
};

/** Used by the callback page to wait for webhook activation if verify was cut off. */
const getActivationStatus = async ({ transactionId, txRef }) => {
  const query = [];
  if (transactionId) query.push({ providerTransactionId: String(transactionId) });
  if (txRef) query.push({ transactionId: String(txRef) });
  if (!query.length) return { activated: false };

  const payment = await Payment.findOne({ $or: query }).sort({ createdAt: -1 });
  if (!payment) return { activated: false };

  const user = await User.findOne({ email: payment.email });
  return {
    activated: true,
    payment,
    user,
  };
};

/**
 * Emails the customer once per transaction when a payment fails or is cancelled,
 * whether we hear about it from the webhook or the browser callback.
 */
const notifyPaymentFailed = async ({ email, txRef, transactionId, planType, amount, status }) => {
  const key = txRef || transactionId;
  if (!key) return;
  try {
    const { userKey, plan } = parseTxRef(txRef);
    const user = await findUserForPayment({ userKey, email });
    const to = user?.email || email;
    if (!to) return;
    await sendOnce({ email: to, kind: 'payment_failed', key }, () =>
      sendPaymentFailedEmail(to, {
        name: user?.name,
        planType: planType || plan || user?.planType,
        amount,
        status,
      }));
  } catch (error) {
    console.error('[payment-failed-email]', error.message);
  }
};

module.exports = {
  PLAN_PRICES,
  YEARLY_PLAN_PRICES,
  billingFor,
  planCoveredBy,
  notifyPaymentFailed,
  pushPaymentSuccess,
  getWebhookHash,
  hasSecretKey,
  parseTxRef,
  verifyFlutterwaveTransaction,
  activateFromVerifiedTransaction,
  verifyAndActivate,
  getActivationStatus,
};
