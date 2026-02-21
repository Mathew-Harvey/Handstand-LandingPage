/**
 * GET /api/create-checkout
 * Creates a Stripe Checkout Session and redirects to Stripe.
 * Success URL will include session_id so thank-you page can verify and show PDF + form.
 * Requires: STRIPE_SECRET_KEY, STRIPE_PRICE_ID (or product/price ID), NEXT_PUBLIC_SITE_URL or SITE_URL
 */
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).setHeader('Allow', 'GET').end();
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) || 'http://localhost:3000';

  if (!stripeSecret || !priceId) {
    console.error('STRIPE_SECRET_KEY or STRIPE_PRICE_ID not set');
    return res.status(500).send('Checkout is not configured. Please try again later.');
  }

  const stripe = new Stripe(stripeSecret);
  const baseUrl = siteUrl.replace(/\/$/, '');
  const successUrl = `${baseUrl}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/index.html#buy`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: undefined,
      allow_promotion_codes: true
    });

    return res.redirect(302, session.url);
  } catch (err) {
    console.error('Checkout session create failed:', err.message, err.code || '', err.type || '');
    return res.status(500).send('Could not start checkout. Please try again.');
  }
};
