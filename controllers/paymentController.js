const Payment = require('../models/Payment');
const User    = require('../models/User');
const { sendSubscriptionReceipt } = require('../services/emailService');
const {
  getWebhookHash,
  hasSecretKey,
  verifyAndActivate,
  activateFromVerifiedTransaction,
  verifyFlutterwaveTransaction,
  activateFromCallbackRedirect,
  getActivationStatus,
} = require('../services/flutterwavePayment.service');

const createPayment = async (req, res) => {
  try {
    const data  = req.body;
    const email = req.effectiveEmail;
    const newPayment = new Payment({
      ...data,
      id:        data.id || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await newPayment.save();

    // Send receipt email (non-blocking)
    User.findOne({ email }).then((user) => {
      sendSubscriptionReceipt(email, newPayment.toObject(), user || {}).catch(() => {});
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Payment created successfully', data: newPayment });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Payment.findOneAndDelete({ id });

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
    const data = req.body;

    const updated = await Payment.findOneAndUpdate(
      { id },
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
    const payment = await Payment.findOne({ id });

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

const isPaidRedirectStatus = (status) => {
  const value = String(status || '').toLowerCase();
  return value === 'successful' || value === 'success' || value === 'completed';
};

const formatActivationResponse = (result) => ({
  success: true,
  pending: false,
  message: result.message,
  alreadyProcessed: result.alreadyProcessed,
  data: {
    payment: result.payment,
    user: result.user
      ? {
          email: result.user.email,
          name: result.user.name,
          subscriptionType: result.user.subscriptionType,
          planType: result.user.planType,
          subscriptionEndDate: result.user.subscriptionEndDate,
          isSubscribed: result.user.isSubscribed,
        }
      : null,
  },
});

/**
 * Browser callback:
 * If Flutterwave redirected with completed/successful → save payment + activate.
 * If secret key exists, also try API verify (preferred), but callback still works if API errors.
 */
const verifyFlutterwavePayment = async (req, res) => {
  try {
    const transactionId = req.body.transactionId || req.body.transaction_id || '';
    const txRef = req.body.txRef || req.body.tx_ref || '';
    const planType = req.body.planType || req.body.plantype || '';
    const redirectStatus = String(req.body.status || '').toLowerCase();
    const email = req.effectiveEmail || req.body.email || '';

    console.log('[flutterwave-verify] callback', {
      transactionId,
      txRef,
      redirectStatus,
      email: email || '(from tx_ref)',
      hasSecret: hasSecretKey(),
    });

    if (!transactionId && !txRef) {
      return res.status(400).json({ success: false, error: 'transactionId or tx_ref is required' });
    }

    // 1) Preferred Flutterwave API verify when secret is configured
    if (hasSecretKey() && transactionId) {
      try {
        const result = await verifyAndActivate({
          transactionId,
          txRef,
          email,
          planType,
          allowEmailOverride: false,
        });
        if (!result.pending) {
          return res.json(formatActivationResponse(result));
        }
        console.warn('[flutterwave-verify] API still pending — falling back to callback activate');
      } catch (error) {
        console.warn('[flutterwave-verify] API verify failed — falling back to callback:', error.message);
      }
    }

    // 2) Callback must work for completed/successful redirects even if secret/API fails
    if (isPaidRedirectStatus(redirectStatus) || !redirectStatus) {
      const activated = await activateFromCallbackRedirect({
        email,
        transactionId,
        txRef,
        planType,
        amount: req.body.amount,
      });
      return res.json(formatActivationResponse(activated));
    }

    return res.status(400).json({
      success: false,
      error: `Payment redirect status was "${redirectStatus || 'unknown'}" — not activated`,
    });
  } catch (error) {
    console.error('[flutterwave-verify]', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
};

const flutterwavePaymentStatus = async (req, res) => {
  try {
    const transactionId = req.query.transactionId || req.query.transaction_id || '';
    const txRef = req.query.txRef || req.query.tx_ref || '';
    const result = await getActivationStatus({ transactionId, txRef });
    res.json({
      success: true,
      activated: result.activated,
      data: result.activated
        ? {
            email: result.user?.email || result.payment?.email,
            planType: result.user?.planType || result.payment?.plantype,
            subscriptionEndDate: result.user?.subscriptionEndDate,
            isSubscribed: result.user?.isSubscribed,
          }
        : null,
    });
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
  createPayment,
  deletePayment,
  editPayment,
  getPayment,
  getPaymentByEmail,
  verifyFlutterwavePayment,
  flutterwavePaymentStatus,
  flutterwaveWebhook,
};
