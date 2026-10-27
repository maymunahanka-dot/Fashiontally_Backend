const Payment = require('../models/Payment');
const User = require('../models/User');
const { sendSubscriptionReceipt } = require('./emailService');

const PLAN_PRICES = {
  STARTER: 5000,
  GROWTH: 10000,
  PROFESSIONAL: 15000,
};

const normalizePlan = (value) => {
  const plan = String(value || '').trim().toUpperCase();
  if (plan === 'STARTER' || plan === 'GROWTH' || plan === 'PROFESSIONAL') return plan;
  return '';
};

const planFromAmount = (amount) => {
  const value = Number(amount) || 0;
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
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  for (const value of candidates) {
    let user = await User.findOne({ email: value });
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
  const plan =
    normalizePlan(options.planType) ||
    normalizePlan(meta.plantype || meta.planType || meta.plan) ||
    parsed.plan ||
    planFromAmount(tx.amount);

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
  const subscriptionEndDate = new Date(
    new Date(paidAt).getTime() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const planPrice = Number(tx.amount) || PLAN_PRICES[plan] || 0;

  const payment = new Payment({
    id: `PAY-${providerTransactionId || Date.now()}`,
    userId: user.uid || user.id || '',
    email: user.email,
    name: tx.customer?.name || user.name || '',
    phone: tx.customer?.phone_number || user.phone || '',
    plantype: plan,
    planPrice,
    status: 'successful',
    gateway: 'flutterwave',
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

/**
 * Activate from the browser callback when Flutterwave redirected with status=successful.
 * Used when the secret key is not set (local test) or as the callback path the product wants.
 */
const activateFromCallbackRedirect = async ({
  email,
  transactionId,
  txRef,
  planType,
  amount,
  name,
  phone,
}) => {
  if (!transactionId && !txRef) throw new Error('transactionId or tx_ref is required');

  const providerTransactionId = String(transactionId || txRef);
  const existing = await Payment.findOne({
    $or: [
      { providerTransactionId },
      ...(txRef ? [{ transactionId: String(txRef) }] : []),
    ],
  });
  if (existing) {
    const user = await User.findOne({ email: existing.email });
    return {
      alreadyProcessed: true,
      payment: existing,
      user,
      message: 'Payment was already activated',
    };
  }

  const parsed = parseTxRef(txRef);
  // Resolve account from login email, or from tx_ref user key (uid/email)
  const user = await findUserForPayment({
    userKey: parsed.userKey,
    email: email || '',
  });
  if (!user) {
    throw new Error(
      `No FashionTally user found for callback (email: ${email || 'n/a'}, tx_ref: ${txRef || 'n/a'})`
    );
  }

  const plan =
    normalizePlan(planType) ||
    parsed.plan ||
    planFromAmount(amount) ||
    'GROWTH';
  const planPrice = Number(amount) > 0 ? Number(amount) : PLAN_PRICES[plan] || 0;
  const paidAt = new Date().toISOString();
  const subscriptionEndDate = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const payment = new Payment({
    id: `PAY-${providerTransactionId}`,
    userId: user.uid || user.id || '',
    email: user.email,
    name: name || user.name || '',
    phone: phone || user.phone || '',
    plantype: plan,
    planPrice,
    status: 'successful',
    gateway: 'flutterwave',
    transactionId: txRef || '',
    providerTransactionId,
    paidAt,
    createdAt: paidAt,
    updatedAt: paidAt,
  });
  await payment.save();

  const updatedUser = await User.findOneAndUpdate(
    { email: user.email },
    {
      $set: {
        isSubscribed: true,
        subscriptionType: 'paid',
        planType: plan,
        subscriptionEndDate,
        isTrialActive: false,
        payment_amount: planPrice,
        payment_date: paidAt,
        txRef: txRef || '',
        transactionId: providerTransactionId,
        updatedAt: paidAt,
      },
    },
    { new: true }
  );

  sendSubscriptionReceipt(user.email, payment.toObject(), updatedUser || user).catch(() => {});

  return {
    alreadyProcessed: false,
    payment,
    user: updatedUser || user,
    message: 'Subscription activated',
  };
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

module.exports = {
  PLAN_PRICES,
  getWebhookHash,
  hasSecretKey,
  parseTxRef,
  verifyFlutterwaveTransaction,
  activateFromVerifiedTransaction,
  verifyAndActivate,
  activateFromCallbackRedirect,
  getActivationStatus,
};
