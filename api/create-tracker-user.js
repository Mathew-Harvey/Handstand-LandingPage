/**
 * POST /api/create-tracker-user
 * Body: { sessionId, name, email }
 * Verifies Stripe session, creates Progress Tracker user, sends login email.
 * Requires: STRIPE_SECRET_KEY, TRACKER_API_URL, TRACKER_API_SECRET (or auth), EMAIL_* (e.g. Resend/SendGrid)
 */
const Stripe = require('stripe');
const crypto = require('crypto');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, name, email } = req.body || {};
  if (!sessionId || !name || !email) {
    return res.status(400).json({ error: 'Missing sessionId, name, or email' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const trackerApiUrl = process.env.TRACKER_API_URL;  // e.g. https://tracker.yoursite.com/api/users
  const trackerApiSecret = process.env.TRACKER_API_SECRET;
  const trackerLoginUrl = process.env.TRACKER_LOGIN_URL || process.env.TRACKER_APP_URL;  // e.g. https://tracker.yoursite.com/login
  const fromEmail = process.env.EMAIL_FROM;
  const emailProvider = process.env.EMAIL_PROVIDER;   // 'resend' | 'sendgrid' | 'smtp' | etc.

  if (!stripeSecret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const stripe = new Stripe(stripeSecret);

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(403).json({ error: 'Payment not completed' });
    }
    const sessionEmail = session.customer_details?.email || session.customer_email;
    if (sessionEmail && sessionEmail.toLowerCase() !== email.toLowerCase()) {
      return res.status(400).json({ error: 'Email does not match payment' });
    }
  } catch (err) {
    console.error('Stripe session check failed:', err.message);
    return res.status(400).json({ error: 'Invalid session' });
  }

  const tempPassword = crypto.randomBytes(12).toString('base64').replace(/[+/=]/g, '').slice(0, 12);

  if (trackerApiUrl && trackerApiSecret) {
    try {
      const createRes = await fetch(trackerApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + trackerApiSecret,
          'X-API-Key': trackerApiSecret
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim(),
          temporaryPassword: tempPassword,
          forcePasswordChange: true
        })
      });
      if (!createRes.ok) {
        const errBody = await createRes.text();
        console.error('Tracker API error:', createRes.status, errBody);
        return res.status(500).json({ error: 'Could not create tracker account. Please contact support.' });
      }
    } catch (err) {
      console.error('Tracker API request failed:', err.message);
      return res.status(500).json({ error: 'Could not create tracker account. Please try again or contact support.' });
    }
  }
  // If no TRACKER_API_URL, skip user creation (you can implement DB here or use webhook)

  if (fromEmail && emailProvider) {
    const loginLink = trackerLoginUrl || 'https://your-tracker-url.com/login';
    const subject = 'Your Handstand Progress Tracker login';
    const html = `
      <p>Hi ${name.trim()},</p>
      <p>Your Progress Tracker account is ready.</p>
      <p><strong>Login URL:</strong> <a href="${loginLink}">${loginLink}</a></p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Temporary password:</strong> ${tempPassword}</p>
      <p>You will be asked to set a new password the first time you log in.</p>
      <p>— The Bodyweight Gym</p>
    `;
    const text = `Hi ${name},\n\nYour Progress Tracker account is ready.\nLogin: ${loginLink}\nEmail: ${email}\nTemporary password: ${tempPassword}\n\nSet a new password on first login.\n\n— The Bodyweight Gym`;

    try {
      if (emailProvider === 'resend' && process.env.RESEND_API_KEY) {
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.RESEND_API_KEY
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject,
            html,
            text
          })
        });
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          console.error('Resend error:', err);
          return res.status(500).json({ error: 'Failed to send email. Please contact support with your email.' });
        }
      } else if (emailProvider === 'sendgrid' && process.env.SENDGRID_API_KEY) {
        const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + process.env.SENDGRID_API_KEY
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: fromEmail.replace(/^.*<(.+)>.*$/, '$1'), name: 'The Bodyweight Gym' },
            subject,
            content: [
              { type: 'text/plain', value: text },
              { type: 'text/html', value: html }
            ]
          })
        });
        if (!r.ok) {
          const err = await r.text();
          console.error('SendGrid error:', err);
          return res.status(500).json({ error: 'Failed to send email. Please contact support.' });
        }
      } else {
        return res.status(500).json({ error: 'Email not configured. Please contact support.' });
      }
    } catch (err) {
      console.error('Send email failed:', err.message);
      return res.status(500).json({ error: 'Failed to send email. Please try again or contact support.' });
    }
  }

  return res.status(200).json({ success: true });
};
