/**
 * paymentCorController.js
 *
 * Proxies Cash on Rails payment initialization server-side to avoid CORS.
 * The secret key stays on the server — never exposed to the browser.
 */

const initializePayment = async (req, res) => {
  try {
    const { email, name, phone, plantype, planPrice, userId } = req.body || {};

    if (!email || !planPrice) {
      return res.status(400).json({ success: false, error: 'email and planPrice are required' });
    }

    const secret = process.env.CASHONRAILS_LIVE_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, error: 'Payment gateway not configured' });
    }

    const callbackUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/subscription/callback`
      : 'https://www.fashiontally.com/subscription/callback';

    const payload = {
      email,
      first_name: name || email,
      last_name:  phone || '',
      amount:     String(planPrice),
      currency:   'NGN',
      reference:  `subscription-${userId || email}-${Date.now()}`,
      redirectUrl: callbackUrl,
    };

    console.log('[payment-cor] Initializing COR payment for:', email, 'plan:', plantype);

    const response = await fetch('https://mainapi.cashonrails.com/api/v1/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log('[payment-cor] COR response status:', response.status);

    if (response.ok && data.success) {
      return res.json({
        success: true,
        data: {
          paymentLink:    data.data?.authorization_url,
          transactionRef: data.data?.transactionRef,
        },
      });
    }

    console.error('[payment-cor] COR error:', data);
    return res.status(400).json({ success: false, error: data.message || 'Payment initialization failed' });

  } catch (error) {
    console.error('[payment-cor] Unexpected error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { initializePayment };
