const { notifyPaymentFailed } = require('../services/flutterwavePayment.service');
const {
  hasPaystackSecret,
  verifyPaystackTransaction,
  toCommonTransaction,
  verifyAndActivatePaystack,
  isValidPaystackSignature,
} = require('../services/paystackPayment.service');
const { activateFromVerifiedTransaction } = require('../services/flutterwavePayment.service');

// Public routes: replies never say whose payment it was.
const pendingReply = (message) => ({
  success: true,
  pending: true,
  message: message || "We're still confirming your payment with Paystack. Your plan will activate automatically once it's confirmed.",
});

/**
 * POST /api/payment/paystack/verify  { reference, planType }
 * Called by the browser after Paystack checkout. Activates only after Paystack's
 * API confirms the payment; nothing the browser sends is trusted.
 */
const verifyPaystackPayment = async (req, res) => {
  const reference = String(req.body.reference || req.body.txRef || '').trim();
  const planType = req.body.planType || req.body.plantype || '';
  if (!reference) return res.status(400).json({ success: false, error: 'reference is required' });

  if (!hasPaystackSecret()) {
    console.error('[paystack-verify] PAYSTACK_SECRET_KEY is not set — cannot verify payments');
    return res.status(503).json({ success: false, error: 'Paystack payments are not available right now. Please contact support.' });
  }

  try {
    const result = await verifyAndActivatePaystack({ reference, planType });
    if (result.pending) return res.json(pendingReply(result.message));
    return res.json({
      success: true,
      pending: false,
      alreadyProcessed: Boolean(result.alreadyProcessed),
      message: result.message,
    });
  } catch (error) {
    if (/not successful/i.test(error.message)) {
      res.status(400).json({ success: false, error: "Your payment didn't go through. You have not been charged." });
      notifyPaymentFailed({ email: req.effectiveEmail || '', txRef: reference, planType, status: 'failed' });
      return;
    }
    if (/below the cheapest plan|reference mismatch|Unexpected currency/i.test(error.message)) {
      console.warn('[paystack-verify] rejected:', error.message);
      return res.status(400).json({ success: false, error: 'This payment could not be applied to a plan. Please contact support.' });
    }
    // Couldn't confirm with Paystack yet: never activate on trust; the webhook will.
    console.warn('[paystack-verify] could not confirm yet:', error.message);
    return res.json(pendingReply());
  }
};

/**
 * POST /api/payment/paystack/webhook
 * Paystack calls this when a charge succeeds, even if the customer never comes back.
 * Set the URL in Paystack: Settings → API Keys & Webhooks.
 */
const paystackWebhook = async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  if (!isValidPaystackSignature(raw, signature)) {
    console.warn('[paystack-webhook] Invalid or missing signature');
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }

  res.status(200).json({ success: true });

  const event = req.body?.event;
  const reference = req.body?.data?.reference;
  if (!reference || (event !== 'charge.success' && event !== 'charge.failed')) return;

  try {
    // Always re-check with Paystack rather than trusting the webhook body.
    const data = await verifyPaystackTransaction(reference);
    const status = String(data.status || '').toLowerCase();
    if (status === 'failed' || status === 'abandoned' || status === 'reversed') {
      const tx = toCommonTransaction(data);
      await notifyPaymentFailed({
        email: tx.customer.email,
        txRef: tx.tx_ref,
        transactionId: tx.id,
        amount: tx.amount,
        status: 'failed',
      });
      return;
    }
    if (status !== 'success') return;
    await activateFromVerifiedTransaction(toCommonTransaction(data), { gateway: 'paystack' });
    console.log('[paystack-webhook] Activated payment', reference);
  } catch (error) {
    console.error('[paystack-webhook] Activation failed:', error.message);
  }
};

module.exports = { verifyPaystackPayment, paystackWebhook };
