/**
 * Paystack subscription payments.
 *
 * Paystack's verified transaction is turned into the same shape as a Flutterwave
 * one, then activated by the shared code in flutterwavePayment.service.js, so both
 * gateways apply exactly the same rules (plan must be covered by the amount paid,
 * early renewals keep remaining days, receipt email, push notification, etc.).
 */
const crypto = require('crypto');
const {
  activateFromVerifiedTransaction,
  getActivationStatus,
} = require('./flutterwavePayment.service');

const getPaystackSecret = () => process.env.PAYSTACK_SECRET_KEY || '';
const hasPaystackSecret = () => Boolean(getPaystackSecret());

/** Payment ids are stored with a prefix so they can never clash with Flutterwave ids. */
const paystackProviderId = (id) => (id ? `paystack_${id}` : '');

const PENDING_STATUSES = ['ongoing', 'pending', 'processing', 'queued'];

/** GET /transaction/verify/:reference from Paystack. Throws if Paystack can't be reached or doesn't know it. */
const verifyPaystackTransaction = async (reference) => {
  const secret = getPaystackSecret();
  if (!secret) throw new Error('Paystack secret key is not configured on the server');
  if (!reference) throw new Error('reference is required');

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status !== true || !payload.data) {
    throw new Error(payload.message || 'Failed to verify Paystack transaction');
  }
  return payload.data;
};

/** Paystack transaction → the Flutterwave-like shape the shared activation code expects. */
const toCommonTransaction = (data) => {
  const meta = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const customer = data.customer || {};
  return {
    id: paystackProviderId(data.id),
    status: data.status === 'success' ? 'successful' : String(data.status || ''),
    currency: data.currency,
    amount: (Number(data.amount) || 0) / 100, // Paystack amounts are in kobo
    tx_ref: data.reference,
    meta: {
      plantype: meta.plantype || meta.planType || '',
      email: meta.email || customer.email || '',
      userId: meta.userId || '',
      billingCycle: meta.billingCycle || '',
    },
    customer: {
      email: customer.email || '',
      name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || meta.name || '',
      phone_number: customer.phone || meta.phone || '',
    },
    created_at: data.paid_at || data.paidAt || data.created_at || new Date().toISOString(),
  };
};

/**
 * Verify with Paystack, then activate. Returns { pending: true } while a bank
 * transfer is still being confirmed; the webhook activates it later.
 */
const verifyAndActivatePaystack = async ({ reference, planType }) => {
  const existing = await getActivationStatus({ txRef: reference });
  if (existing.activated) {
    return { alreadyProcessed: true, message: 'Payment was already activated' };
  }

  const data = await verifyPaystackTransaction(reference);
  if (data.reference && String(data.reference) !== String(reference)) {
    throw new Error('Transaction reference mismatch');
  }

  const status = String(data.status || '').toLowerCase();
  if (PENDING_STATUSES.includes(status)) {
    return {
      pending: true,
      message: 'Payment is still processing. Bank transfers can take a few minutes.',
    };
  }

  return activateFromVerifiedTransaction(toCommonTransaction(data), { planType, gateway: 'paystack' });
};

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
const isValidPaystackSignature = (rawBody, signature) => {
  const secret = getPaystackSecret();
  if (!secret || !rawBody || !signature) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = {
  hasPaystackSecret,
  verifyPaystackTransaction,
  toCommonTransaction,
  verifyAndActivatePaystack,
  isValidPaystackSignature,
};
