/**
 * GET /api/verify-session?session_id=cs_xxx
 * Verifies Stripe Checkout Session and returns customer email + PDF download URL.
 * Requires: STRIPE_SECRET_KEY, PDF_DOWNLOAD_URL (or generate signed URL from your storage)
 */
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sessionId = req.query.session_id;
  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const pdfUrl = process.env.PDF_DOWNLOAD_URL;

  if (!stripeSecret) {
    console.error('STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const stripe = new Stripe(stripeSecret);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer_details']
    });

    if (session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Payment not completed' });
    }

    const email = session.customer_details?.email || session.customer_email || null;

    return res.status(200).json({
      email: email || null,
      downloadUrl: pdfUrl || null
    });
  } catch (err) {
    console.error('Stripe session retrieval failed:', err.message);
    if (err.code === 'resource_missing') {
      return res.status(404).json({ error: 'Invalid or expired session' });
    }
    return res.status(500).json({ error: 'Could not verify payment' });
  }
};
