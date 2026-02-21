# Post-purchase flow setup

This doc explains how to get the full flow working: **Pay with Stripe → instant PDF download → collect name/email → create Progress Tracker user → email login details (first login = change password)**.

**Quick start (Stripe + PDF only):** Add **STRIPE_SECRET_KEY** (your Stripe secret key) and **STRIPE_PRICE_ID** (from Stripe Dashboard → Products → your product → Price ID) as environment variables on Render. **Never commit these keys to git.** After payment, customers are sent to a thank-you page where they can download **handstand.pdf** (served from this repo). No need to set `PDF_DOWNLOAD_URL` unless you use a different PDF URL.

## Flow overview

1. User clicks **Download Now** → goes to `/api/create-checkout` → redirected to Stripe Checkout.
2. After payment, Stripe redirects to `thank-you.html?session_id=cs_xxx`.
3. Thank-you page calls **GET /api/verify-session** → gets customer email + PDF URL → shows download link and form (email prefilled).
4. User enters name (and can edit email), submits form → **POST /api/create-tracker-user** → backend creates tracker user with a temporary password and sends an email with login link + temp password.
5. User opens Progress Tracker from email, logs in with temp password, and is prompted to set a new password (you implement this in the tracker app).

---

## 1. Hosting on Render (recommended)

This repo is set up to run as a **single Web Service** on Render:

- **server.js** runs an Express app that serves static files (HTML, CSS, JS) and the `/api/*` routes.
- One service = one URL, no CORS, no separate “API host” to configure.

**Deploy steps:**

1. Push the repo to GitHub and connect it to Render.
2. In Render: **New → Web Service**; connect the repo.
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free or paid (free tier spins down after ~15 min inactivity; first request after that may be slow).
4. Add environment variables in Render (see section 2 below). Render sets **RENDER_EXTERNAL_URL** automatically (e.g. `https://your-service.onrender.com`), so **SITE_URL** is optional unless you use a custom domain.

**Custom domain:** In Render, add your domain and use HTTPS. Set **SITE_URL** to `https://yourdomain.com` so Stripe success/cancel URLs use your domain.

**Local run:**

```bash
npm install
npm start
```

Then open `http://localhost:3000`. For Stripe redirects to work locally, use Stripe CLI webhook forwarding or test without redirect (e.g. copy a test `session_id` into `thank-you.html?session_id=cs_test_...`).

---

## 2. Environment variables

Set these in your host (Render: Dashboard → your Web Service → Environment).

| Variable | Required | Description |
|----------|----------|-------------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (sk_live_... or sk_test_...) |
| `STRIPE_PRICE_ID` | Yes | Price ID for the guide (e.g. price_xxx from Stripe Dashboard → Products) |
| `SITE_URL` | On Render: optional | Full site URL (e.g. `https://yourservice.onrender.com` or custom domain). On Render, defaults to **RENDER_EXTERNAL_URL** if not set. |
| `PDF_DOWNLOAD_URL` | Optional | Defaults to **/handstand.pdf** (the PDF in this repo). Set only if you serve the PDF from another URL. |
| `TRACKER_API_URL` | Yes* | Progress Tracker API endpoint to create a user, e.g. `https://tracker.yoursite.com/api/users`. |
| `TRACKER_API_SECRET` | Yes* | Secret or API key your tracker API expects to authorize create-user requests. |
| `TRACKER_LOGIN_URL` | Recommended | Full URL to the tracker login page (e.g. `https://tracker.yoursite.com/login`), used in the email. |
| `EMAIL_FROM` | Yes** | Sender address for “Tracker login” email (e.g. `The Bodyweight Gym <noreply@yoursite.com>`). |
| `EMAIL_PROVIDER` | Yes** | `resend` or `sendgrid`. |
| `RESEND_API_KEY` | If Resend | From Resend.com. |
| `SENDGRID_API_KEY` | If SendGrid | From SendGrid. |

\* Omit if you don’t have a tracker API yet; then the “create user” step is skipped and you can still send the email with a temporary password (you’d create the user manually or via another process).  
\** Omit if you don’t send email yet; the API will return success but no email is sent.

---

## 3. Stripe: create product and price

1. In Stripe Dashboard → **Products** → create a product (e.g. “The Handstand Guide”).
2. Add a one-time **Price** (e.g. $19), copy the **Price ID** (e.g. `price_xxx`).
3. Set **STRIPE_PRICE_ID** to that value.

Do **not** use a Payment Link for “Download Now”. The flow uses **Checkout Session** created by `/api/create-checkout` so the success URL can include `session_id`.

---

## 4. PDF download URL

- **Option A – Fixed URL:** If the same PDF is served to every customer, set `PDF_DOWNLOAD_URL` to that URL (e.g. CloudFront or S3 public URL). The thank-you page will use it as the “Download the PDF” link.
- **Option B – One-time/signed URL:** Implement a Stripe webhook `checkout.session.completed`: generate a short-lived or one-time download URL, store it keyed by `session_id` (e.g. in a DB or serverless store), and add an endpoint that, given `session_id`, returns that URL. Then in `api/verify-session.js` you’d fetch that URL from your store instead of using a fixed `PDF_DOWNLOAD_URL`.

---

## 5. Progress Tracker API (create user)

Your Progress Tracker should expose an endpoint that:

- Accepts **POST** with JSON body, e.g.:
  - `email`, `name`, `temporaryPassword`, `forcePasswordChange`
- Authenticates the request (e.g. with `TRACKER_API_SECRET` in a header like `Authorization: Bearer ...` or `X-API-Key`).
- Creates a user with that email and temporary password, and marks that they must change password on first login.
- Returns 2xx on success.

Example body we send:

```json
{
  "email": "customer@example.com",
  "name": "Jane Doe",
  "temporaryPassword": "randomlyGenerated",
  "forcePasswordChange": true
}
```

Implement “force password change on first login” in the tracker app (e.g. a flag on the user, and on login with temp password redirect to “Set new password” and then invalidate the temp password).

---

## 6. Email (login details)

We send one email after the form is submitted, containing:

- Login page link (`TRACKER_LOGIN_URL`)
- Email and temporary password
- A line saying they’ll be asked to set a new password on first login

Configure either **Resend** or **SendGrid** and set the corresponding env vars (`EMAIL_PROVIDER`, `EMAIL_FROM`, and `RESEND_API_KEY` or `SENDGRID_API_KEY`).

---

## 7. Optional: Stripe webhook

For robustness (e.g. if the user closes the browser before the thank-you page loads), you can add a **Stripe webhook** for `checkout.session.completed` to:

- Generate and store a one-time/signed PDF URL for that `session_id`, and/or
- Create the tracker user and send the login email (then the thank-you form could be “optional” or only for updating name).

The thank-you page and `/api/create-tracker-user` can remain the main path; the webhook is a backup or alternative fulfillment path.

---

## 8. Summary checklist

- [ ] Deploy as a Web Service on Render (build: `npm install`, start: `npm start`).
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `PDF_DOWNLOAD_URL` (and `SITE_URL` if using a custom domain).
- [ ] Set `TRACKER_API_URL`, `TRACKER_API_SECRET`, `TRACKER_LOGIN_URL` (if tracker is ready).
- [ ] Set `EMAIL_FROM`, `EMAIL_PROVIDER`, and `RESEND_API_KEY` or `SENDGRID_API_KEY`.
- [ ] In Progress Tracker: implement “create user” API and “force password change on first login”.
- [ ] Test with Stripe test mode (sk_test_..., price from test product).
