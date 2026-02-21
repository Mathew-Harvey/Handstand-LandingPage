/**
 * POST /api/create-tracker-user
 * Body: { sessionId, name, email }
 * Verifies Stripe session, creates Progress Tracker user, sends login email.
 * Requires: STRIPE_SECRET_KEY; for email: EMAIL_FROM + RESEND_API_KEY or SENDGRID_API_KEY; optional: TRACKER_*
 */
const Stripe = require('stripe');
const crypto = require('crypto');

function buildTrackerLoginEmail(name, email, tempPassword, loginUrl) {
  const loginLink = loginUrl || 'https://your-tracker-url.com/login';
  const escapedName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapedEmail = email.replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Progress Tracker login</title>
</head>
<body style="margin:0;padding:0;font-family:'Source Sans 3',-apple-system,BlinkMacSystemFont,sans-serif;background:#0a0f1a;color:#e2e8f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0f1a;">
    <tr>
      <td style="padding:40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#161d2f;border:1px solid rgba(255,255,255,0.06);border-radius:8px;">
          <tr>
            <td style="padding:40px 32px;">
              <p style="margin:0 0 24px 0;font-size:11px;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:#2d8bc9;">The Bodyweight Gym</p>
              <h1 style="margin:0 0 8px 0;font-size:24px;font-weight:800;color:#fff;letter-spacing:-0.02em;">Your Progress Tracker is ready</h1>
              <p style="margin:0 0 28px 0;font-size:16px;line-height:1.6;color:#94a3b8;">Hi ${escapedName},</p>
              <p style="margin:0 0 24px 0;font-size:16px;line-height:1.6;color:#e2e8f0;">Use the button below to open the Progress Tracker. You’ll log in with your email and the temporary password below, then set a new password on first sign-in.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px 0;">
                <tr>
                  <td>
                    <a href="${loginLink}" style="display:inline-block;padding:14px 28px;background:#2d8bc9;color:#fff !important;font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-decoration:none;border-radius:4px;">Set your password &amp; log in</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:rgba(45,139,201,0.1);border:1px solid rgba(45,139,201,0.2);border-radius:4px;">
                <tr>
                  <td style="padding:20px;">
                    <p style="margin:0 0 8px 0;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#94a3b8;">Your login details</p>
                    <p style="margin:0 0 4px 0;font-size:15px;color:#e2e8f0;"><strong>Email:</strong> ${escapedEmail}</p>
                    <p style="margin:0;font-size:15px;color:#e2e8f0;"><strong>Temporary password:</strong> <code style="background:rgba(0,0,0,0.2);padding:2px 8px;border-radius:2px;">${tempPassword}</code></p>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0 0;font-size:14px;line-height:1.5;color:#94a3b8;">If the button doesn’t work, copy and paste this link into your browser:</p>
              <p style="margin:4px 0 0 0;font-size:14px;"><a href="${loginLink}" style="color:#60a5fa;text-decoration:underline;">${loginLink}</a></p>
              <p style="margin:32px 0 0 0;font-size:14px;color:#94a3b8;">— The Bodyweight Gym</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = `The Bodyweight Gym – Your Progress Tracker is ready

Hi ${name},

Use the link below to open the Progress Tracker. Log in with your email and the temporary password below. You'll be asked to set a new password on first sign-in.

Set your password & log in: ${loginLink}

Your login details:
Email: ${email}
Temporary password: ${tempPassword}

If the link doesn't work, copy and paste it into your browser: ${loginLink}

— The Bodyweight Gym`;

  return { html, text };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionId, name, email } = req.body || {};
  if (!sessionId || !name || !email) {
    return res.status(400).json({ error: 'Missing sessionId, name, or email' });
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const trackerApiUrl = process.env.TRACKER_API_URL;
  const trackerApiSecret = process.env.TRACKER_API_SECRET;
  const trackerLoginUrl = process.env.TRACKER_LOGIN_URL || process.env.TRACKER_APP_URL;
  const fromEmail = process.env.EMAIL_FROM;
  const hasResend = !!process.env.RESEND_API_KEY;
  const hasSendGrid = !!process.env.SENDGRID_API_KEY;
  const emailProviderPref = (process.env.EMAIL_PROVIDER || '').toLowerCase();

  if (!stripeSecret) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!fromEmail || (!hasResend && !hasSendGrid)) {
    return res.status(503).json({
      error: 'Login emails are not set up yet. Please contact support with your email and we’ll send your Progress Tracker login details.'
    });
  }
  const effectiveProvider = (emailProviderPref === 'sendgrid' && hasSendGrid) ? 'sendgrid' : 'resend';

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

  const { html, text } = buildTrackerLoginEmail(name.trim(), email, tempPassword, trackerLoginUrl);
  const subject = 'Your Progress Tracker login — The Bodyweight Gym';

  try {
    if (effectiveProvider === 'resend' && process.env.RESEND_API_KEY) {
      console.log('Sending tracker login email to', email, 'from', fromEmail);
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
      const errBody = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error('Resend error:', r.status, errBody);
        const msg = errBody.message || (Array.isArray(errBody.message) ? errBody.message[0] : null) || errBody.error || (errBody.errors && errBody.errors[0] && errBody.errors[0].message) || 'Failed to send email.';
        return res.status(500).json({ error: msg });
      }
      console.log('Resend sent successfully:', errBody.id || 'ok');
    } else if (effectiveProvider === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      const fromAddr = fromEmail.replace(/^.*<([^>]+)>.*$/, '$1').trim() || fromEmail;
      const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.SENDGRID_API_KEY
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email }] }],
          from: { email: fromAddr, name: 'The Bodyweight Gym' },
          subject,
          content: [
            { type: 'text/plain', value: text },
            { type: 'text/html', value: html }
          ]
        })
      });
      if (!r.ok) {
        const err = await r.text();
        console.error('SendGrid error:', r.status, err);
        return res.status(500).json({ error: 'Failed to send email. Please contact support.' });
      }
    } else {
      return res.status(503).json({
        error: 'Login emails are not set up yet. Please contact support with your email and we’ll send your Progress Tracker login details.'
      });
    }
  } catch (err) {
    console.error('Send email failed:', err.message);
    return res.status(500).json({ error: 'Failed to send email. Please try again or contact support.' });
  }

  return res.status(200).json({ success: true });
};
