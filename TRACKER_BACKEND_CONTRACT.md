# Tracker Backend API Contract (Landing Page Integration)

This document is the **backend API contract** for the Handstand Tracker landing page post-purchase flow. The frontend (tracker app) and landing page both depend on these endpoints.

---

## 1. Create/find user (landing page → API)

**Paths:** `POST /api/users` (canonical for `TRACKER_API_URL`) or `POST /api/auth/create-user`

- **Auth:** `Authorization: Bearer <TRACKER_API_SECRET>` or `X-API-Key: <TRACKER_API_SECRET>`. In production, if `TRACKER_API_SECRET` is not set, the API returns 503.
- **Body (JSON):** `email` (required), `name` (required), `temporaryPassword` (required, min 8 chars), `forcePasswordChange` (optional boolean).
- **Validation:** Email format, name length ≤ 100, temporaryPassword ≥ 8 characters.
- **Behaviour:** Create user if no user for that email; otherwise update (idempotent). Store temporary password hashed. Generate one-time set-password token (1h expiry).
- **Response (2xx):** `{ setPasswordToken, set_password_token, userId? }`

**Rate limit:** 30 requests per 15 minutes per IP.

**Landing page:** Sets `TRACKER_API_URL` to API base + `/api/users` (e.g. `https://handstand-api.onrender.com/api/users`) and sends the same body; reads `setPasswordToken` or `set_password_token` to build the email link.

---

## 2. Set-password flow (user clicks link in email)

Landing page sends link: `https://<tracker-app-origin>/set-password?token=<setPasswordToken>`

### 2.1 Validate token and establish session

**GET** `/api/auth/validate-set-password-token?token=<token>`  
(or `?set_password_token=<token>`)

- Validates token and expiry; if valid, creates session (Set-Cookie) and returns `{ user }`.
- If invalid/expired: 400 with `{ error: "Invalid or expired token" }`.

### 2.2 Submit new password

**POST** `/api/auth/set-password`  
Body: `{ token, newPassword }` (or `password`)

- Verifies token, hashes new password (bcrypt), updates user, clears temporary password and set-password token, refreshes session. Returns `{ user }`.

**Rate limit:** 30 requests per 15 minutes per IP.

---

## 3. Forgot password

- **POST** `/api/auth/forgot-password` — Body: `{ email }`. Creates reset token, sends email with `/set-password?token=...` when Resend is configured. Always returns `{ ok: true }` (no user enumeration). In **development only**, when email is not configured, returns `{ ok: true, devResetToken: "<token>" }` so the app can show a reset link for testing.
- **Rate limit:** 30 requests per 15 minutes per IP.
- The same **set-password flow** (validate token → set-password modal → POST set-password) is used for both “set password after purchase” and “forgot password”; the link in the email goes to `/set-password?token=...`.

---

## 4. Password storage

- Only bcrypt hashes are stored; no plaintext passwords.
- Temporary password (from create-user) is stored hashed and replaced when the user sets a permanent password via set-password.

---

## 5. Production checklist (backend)

Before going live:

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` set (long random string; app exits if missing in production)
- [ ] `TRACKER_API_SECRET` set (same value as on landing page; create-user returns 503 if missing in production)
- [ ] `DATABASE_URL` points to production PostgreSQL
- [ ] `ALLOWED_ORIGINS` includes tracker app (and landing page origin if it calls API from browser)
- [ ] `TRACKER_APP_URL` set so forgot-password and landing page emails use the correct set-password link base
- [ ] Optional: `RESEND_API_KEY`, `RESEND_FROM` for forgot-password emails

---

## 6. Landing page config (this repo)

- Set **TRACKER_API_URL** to backend API base + `/api/users`, e.g. `https://handstand-api.onrender.com/api/users`
- Set **TRACKER_API_SECRET** to the **same** value as the backend’s `TRACKER_API_SECRET`
- Set **TRACKER_LOGIN_URL** to the **tracker app** (frontend) origin, e.g. `https://handstand-web.onrender.com` (the set-password link in the email will be this origin + `/set-password?token=...`)
