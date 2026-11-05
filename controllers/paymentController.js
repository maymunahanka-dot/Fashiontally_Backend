const Payment = require('../models/Payment');
const {
  getWebhookHash,
  hasSecretKey,
  verifyAndActivate,
  activateFromVerifiedTransaction,
  verifyFlutterwaveTransaction,
  getActivationStatus,
  notifyPaymentFailed,
} = require('../services/flutterwavePayment.service');

/** A payment lookup limited to the signed-in account (older records may differ in case). */
const ownPayment = (req, id) => ({
  id,
  email: new RegExp(`^${String(req.effectiveEmail || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
});

// What a payment was for and who paid can't be changed after the fact
const LOCKED_PAYMENT_FIELDS = [
  '_id', 'id', 'email', 'userId', 'plantype', 'planPrice', 'billingCycle', 'status',
  'gateway', 'transactionId', 'providerTransactionId', 'paidAt', 'createdAt',
];

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Payment.findOneAndDelete(ownPayment(req, id));

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, message: 'Payment deleted successfully', data: deleted });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const editPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...(req.body || {}) };
    for (const field of LOCKED_PAYMENT_FIELDS) delete data[field];

    const updated = await Payment.findOneAndUpdate(
      ownPayment(req, id),
      { $set: { ...data, updatedAt: new Date().toISOString() } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, message: 'Payment updated successfully', data: updated });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findOne(ownPayment(req, id));

    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    res.json({ success: true, data: payment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const getPaymentByEmail = async (req, res) => {
  try {
    const email = req.effectiveEmail;
    const payments = await Payment.find({ email }).sort({ createdAt: -1 });
    res.json({ success: true, data: payments });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const isFailedRedirectStatus = (status) => /cancel|fail/i.test(String(status || ''));

// The callback route needs no login and ids are guessable, so replies never include whose payment it was
const activationReply = (result) => ({
  success: true,
  pending: false,
  alreadyProcessed: Boolean(result.alreadyProcessed),
  message: result.message,
});
const pendingReply = (message) => ({
  success: true,
  pending: true,
  message: message || "We're still confirming your payment with Flutterwave. Your plan will activate automatically once it's confirmed.",
});

/**
 * Browser callback after Flutterwave checkout.
 *
 * A plan is only activated after Flutterwave's API confirms the payment (and that
 * the amount covers the plan) — nothing the browser sends is trusted. If it can't
 * be confirmed yet, the reply is "pending" and the webhook activates it later.
 */
const verifyFlutterwavePayment = async (req, res) => {
  const transactionId = String(req.body.transactionId || req.body.transaction_id || '');
  const txRef = String(req.body.txRef || req.body.tx_ref || '');
  const planType = req.body.planType || req.body.plantype || '';
  const redirectStatus = String(req.body.status || '').toLowerCase();
  const email = req.effectiveEmail || '';

  console.log('[flutterwave-verify] callback', { transactionId, txRef, redirectStatus, hasSecret: hasSecretKey() });

  if (!transactionId && !txRef) {
    return res.status(400).json({ success: false, error: 'transactionId or tx_ref is required' });
  }

  try {
    // Already activated (e.g. the webhook got there first)
    const existing = await getActivationStatus({ transactionId, txRef });
    if (existing.activated) {
      return res.json(activationReply({ alreadyProcessed: true, message: 'Payment was already activated' }));
    }

    // Customer cancelled, or Flutterwave reported a failure on the redirect
    if (isFailedRedirectStatus(redirectStatus)) {
      res.status(400).json({ success: false, error: 'Payment was cancelled or failed — you have not been charged.' });
      notifyPaymentFailed({ email, txRef, transactionId, planType, status: redirectStatus });
      return;
    }

    // Without Flutterwave's transaction id there's nothing to verify; the webhook will activate it
    if (!transactionId) return res.json(pendingReply());

    if (!hasSecretKey()) {
      console.error('[flutterwave-verify] FLUTTERWAVE_SECRET_KEY is not set — cannot verify payments');
      return res.status(503).json({ success: false, error: 'Payment verification is not available right now. Please contact support.' });
    }

    const result = await verifyAndActivate({ transactionId, txRef, planType, allowEmailOverride: false });
    if (result.pending) return res.json(pendingReply(result.message));
    return res.json(activationReply(result));
  } catch (error) {
    // Flutterwave says the payment failed
    if (/not successful/i.test(error.message)) {
      res.status(400).json({ success: false, error: "Your payment didn't go through — you have not been charged." });
      notifyPaymentFailed({ email, txRef, transactionId, planType, status: 'failed' });
      return;
    }
    // Verified, but the money doesn't cover any plan, or doesn't match this checkout
    if (/below the cheapest plan|reference mismatch|Unexpected currency/i.test(error.message)) {
      console.warn('[flutterwave-verify] rejected:', error.message);
      return res.status(400).json({ success: false, error: 'This payment could not be applied to a plan. Please contact support.' });
    }
    // Couldn't reach / confirm with Flutterwave — never activate on trust; the webhook will retry
    console.warn('[flutterwave-verify] could not confirm yet:', error.message);
    return res.json(pendingReply());
  }
};

const flutterwavePaymentStatus = async (req, res) => {
  try {
    const transactionId = req.query.transactionId || req.query.transaction_id || '';
    const txRef = req.query.txRef || req.query.tx_ref || '';
    const result = await getActivationStatus({ transactionId, txRef });
    // Public (no login) and transaction ids are guessable, so only say whether
    // the payment was activated — never whose it was or their plan details.
    res.json({ success: true, activated: result.activated });
  } catch (error) {
    console.error('[flutterwave-status]', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

const flutterwaveWebhook = async (req, res) => {
  try {
    const secretHash = getWebhookHash();
    const signature = req.headers['verif-hash'];

    if (secretHash) {
      if (!signature || signature !== secretHash) {
        console.warn('[flutterwave-webhook] Invalid or missing verif-hash');
        return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
      }
    } else {
      console.warn('[flutterwave-webhook] FLUTTERWAVE_SECRET_HASH is not set — accepting webhook without hash check');
    }

    res.status(200).json({ success: true });

    const event = req.body?.event;
    const data = req.body?.data;
    if (event && event !== 'charge.completed') return;
    if (!data?.id) return;

    try {
      const verified = await verifyFlutterwaveTransaction(data.id);
      if (String(verified.status || '').toLowerCase() === 'failed') {
        await notifyPaymentFailed({
          email:         verified.customer?.email,
          txRef:         verified.tx_ref,
          transactionId: verified.id,
          amount:        verified.amount,
          status:        'failed',
        });
        console.log('[flutterwave-webhook] Payment failed — customer notified', data.id);
        return;
      }
      await activateFromVerifiedTransaction(verified);
      console.log('[flutterwave-webhook] Activated payment', data.id);
    } catch (error) {
      console.error('[flutterwave-webhook] Activation failed:', error.message);
    }
  } catch (error) {
    console.error('[flutterwave-webhook]', error.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = {
  deletePayment,
  editPayment,
  getPayment,
  getPaymentByEmail,
  verifyFlutterwavePayment,
  flutterwavePaymentStatus,
  flutterwaveWebhook,
};
