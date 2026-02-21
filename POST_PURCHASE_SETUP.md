# Post-purchase flow setup

This doc explains how to get the full flow working: **Pay with Stripe → instant PDF download → collect name/email → create Progress Tracker user → email login details (first login = change password)**.

**Developer prompt:** When working on post-purchase or tracker integration, use **[LANDING_PAGE_DEVELOPER_PROMPT.md](./LANDING_PAGE_DEVELOPER_PROMPT.md)** for responsibilities, config, and API contract.

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
| `TRACKER_API_URL` | Yes* | Backend API create-user endpoint. Set to API base + `/api/users`, e.g. `https://handstand-api.onrender.com/api/users`. Must match the backend’s `TRACKER_API_SECRET`. |
| `TRACKER_API_SECRET` | Yes* | Shared secret for create-user requests. Use the **same value** as the tracker backend’s `TRACKER_API_SECRET`. |
| `TRACKER_LOGIN_URL` | Recommended | **Tracker app** (frontend) origin for the set-password link in the email, e.g. `https://handstand-web.onrender.com`. The link will be `TRACKER_LOGIN_URL` + `/set-password?token=...`. |
| `EMAIL_FROM` | Yes** | Sender address for “Tracker login” email (e.g. `The Bodyweight Gym <noreply@yoursite.com>`). |
| `EMAIL_PROVIDER` | Yes** | `resend` or `sendgrid`. |
| `RESEND_API_KEY` | If Resend | From Resend.com. |
| `SENDGRID_API_KEY` | If SendGrid | From SendGrid. |

\* Omit if you don’t have a tracker API yet; the “create user” step is skipped but the login email can still be sent (e.g. you create the user manually or the tracker supports sign-up via the link).  
\** **Required for the “Send me my tracker login” form.** If `EMAIL_FROM` and one of `RESEND_API_KEY` / `SENDGRID_API_KEY` are not set, the form returns a clear message asking the customer to contact support instead of falsely saying “Check your email.”

**To get login emails working:** Set `EMAIL_FROM` (e.g. `The Bodyweight Gym <noreply@yourdomain.com>`), set `TRACKER_LOGIN_URL` (the URL where customers log in and set their password), and either `RESEND_API_KEY` (from [Resend](https://resend.com)) or `SENDGRID_API_KEY` (from SendGrid). Optionally set `EMAIL_PROVIDER` to `resend` or `sendgrid`; if unset, Resend is used when `RESEND_API_KEY` is present. The email is sent in both HTML (branded) and plain text, with a “Set your password & log in” button linking to `TRACKER_LOGIN_URL`.

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

## 5. Progress Tracker API (create user) and set-password flow

The landing page calls your tracker when the customer submits the thank-you form, then sends an email with a link. Implement the following so the “Set your password & log in” button works end-to-end.

**Backend contract:** See **[TRACKER_BACKEND_CONTRACT.md](./TRACKER_BACKEND_CONTRACT.md)** for the full API (create-user, validate-set-password-token, set-password, forgot-password). Landing page env: `TRACKER_API_URL`, `TRACKER_API_SECRET`, `TRACKER_LOGIN_URL`.

### 5.1 Create/find user endpoint

- **URL:** The value you set as `TRACKER_API_URL` (e.g. `https://handstand-web.onrender.com/api/users` or `/api/create-tracker-user`).
- **Method:** POST.
- **Auth:** Require `Authorization: Bearer <TRACKER_API_SECRET>` or `X-API-Key: <TRACKER_API_SECRET>` (same value the landing page sets in Render).
- **Body (JSON):**
  - `email` (string, required)
  - `name` (string, required)
  - `temporaryPassword` (string, required)
  - `forcePasswordChange` (boolean, true)

**Behavior:**

- If no user exists for that email: create a user with that email, name, and temporary password (store the temp password so it can be used for one-time token validation; you may clear it after the user sets a permanent password).
- If a user already exists: update name/temp password if desired, or treat as idempotent.
- Generate a **one-time set-password token** (cryptographically random, e.g. 32 bytes hex), store it on the user or in a short-lived table (e.g. expiry 1 hour), and return it in the response.

**Response (2xx):** JSON body must include the one-time token so the landing page can put it in the email link:

```json
{
  "setPasswordToken": "abc123...",
  "userId": "optional-uuid"
}
```

The landing page expects either `setPasswordToken` or `set_password_token`. If present, the email link becomes `https://<TRACKER_ORIGIN>/set-password?token=<token>` instead of a generic login URL.

### 5.2 Set-password page and modal

- **Route:** `GET /set-password?token=...` (or equivalent).
- **Behavior:**
  1. Validate the token (look up user by token, check expiry).
  2. If invalid or expired: show an error and a link to login or “forgot password”.
  3. If valid: log the user in (create session), then show a **modal** (or full-page form) asking them to **enter a new password** (and confirm).
  4. On submit: hash the new password (e.g. bcrypt/argon2), save it to the user record, clear the temporary password and the set-password token, then redirect to the app (or close modal and show main app). That password is now their normal login password.

### 5.3 Password storage and recovery

- Store only a **hashed** version of the user’s chosen password (bcrypt, argon2, or similar). Never store plaintext.
- Implement normal **forgot-password** flow (e.g. “Forgot password?” → enter email → send reset link → set new password).
- Optionally support **account recovery** (e.g. “Forgot email?”) if you want; the landing page does not depend on it.

---

## 6. Email (login details)

After the customer submits name and email on the thank-you page, we send a single email (HTML + plain text) with:

- A **“Set your password & log in”** button linking to `TRACKER_LOGIN_URL`
- Their email and a temporary password
- A note that they’ll be asked to set a new password on first sign-in

Configure **Resend** (recommended) or **SendGrid**: set `EMAIL_FROM`, `TRACKER_LOGIN_URL`, and either `RESEND_API_KEY` or `SENDGRID_API_KEY`. Without these, the form shows a message that login emails aren’t set up and asks the customer to contact support.

---

## 7. Optional: Stripe webhook

For robustness (e.g. if the user closes the browser before the thank-you page loads), you can add a **Stripe webhook** for `checkout.session.completed` to:

- Generate and store a one-time/signed PDF URL for that `session_id`, and/or
- Create the tracker user and send the login email (then the thank-you form could be “optional” or only for updating name).

The thank-you page and `/api/create-tracker-user` can remain the main path; the webhook is a backup or alternative fulfillment path.

---

## 8. Troubleshooting: “No email received”

- **Check the message on the thank-you page.** After clicking “Send me my tracker login”, if something went wrong you’ll see an error in red (e.g. “Invalid session”, “Payment not completed”, or the exact message from Resend). Fix that first.
- **Use a real payment to test.** The form only runs after a paid Stripe session. Open the thank-you page from the Stripe success redirect (with `?session_id=cs_...` in the URL), not by typing the URL.
- **Check Render logs.** In Render → your service → **Logs**, trigger the form again and look for:
  - `Sending tracker login email to ...` → the handler ran and tried to send.
  - `Resend sent successfully` → Resend accepted the email.
  - `Resend error: ...` → Resend rejected the request; the logged object has the reason.
- **Check spam/junk** for the recipient address.
- **Resend “from” address:** Use `The Bodyweight Gym <onboarding@resend.dev>` for testing (set `EMAIL_FROM` in Render). For production, verify your own domain in Resend and use e.g. `noreply@yourdomain.com`.

---

## 9. Summary checklist

- [ ] Deploy as a Web Service on Render (build: `npm install`, start: `npm start`).
- [ ] Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `PDF_DOWNLOAD_URL` (and `SITE_URL` if using a custom domain).
- [ ] Set `TRACKER_API_URL` (backend API + `/api/users`), `TRACKER_API_SECRET` (same as backend), `TRACKER_LOGIN_URL` (tracker app origin). See [TRACKER_BACKEND_CONTRACT.md](./TRACKER_BACKEND_CONTRACT.md).
- [ ] Set `EMAIL_FROM`, `EMAIL_PROVIDER`, and `RESEND_API_KEY` or `SENDGRID_API_KEY`.
- [ ] In Progress Tracker: implement “create user” API and “force password change on first login”.
- [ ] Test with Stripe test mode (sk_test_..., price from test product).
