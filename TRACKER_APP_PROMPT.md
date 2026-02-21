# Prompt for the Handstand Tracker App (handstand-web)

Use this prompt with the AI that is helping you build or update the **Handstand Tracker** app (e.g. https://handstand-web.onrender.com) so it works with the **Handstand Landing Page** purchase flow.

---

## Copy everything below this line and give it to the tracker app's AI

---

I need the Handstand Tracker app to integrate with our landing page’s post-purchase flow. Implement the following.

### 1. Create/find user API (called by the landing page)

- **Endpoint:** POST to a URL we will configure as `TRACKER_API_URL` (e.g. `https://handstand-web.onrender.com/api/users` or `/api/create-tracker-user`).
- **Authentication:** Require the request to include one of:
  - Header: `Authorization: Bearer <secret>`
  - Header: `X-API-Key: <secret>`
  The same secret is configured on the landing page as `TRACKER_API_SECRET`; reject requests that don’t send it or use the wrong value.

- **Request body (JSON):**
  - `email` (string, required)
  - `name` (string, required)
  - `temporaryPassword` (string, required)
  - `forcePasswordChange` (boolean, will be `true`)

- **Behavior:**
  - If no user exists for that email: **create** a user with that email, name, and temporary password (store the temp password hashed or in a way you can verify for the one-time link; you can clear it after they set a permanent password).
  - If a user already exists for that email: update name/temp password as needed (or treat as idempotent and no-op).
  - Generate a **one-time set-password token** (cryptographically random, e.g. 32 bytes hex). Store it associated with that user (e.g. in the user record or a short-lived table) with an expiry (e.g. 1 hour).

- **Response (2xx):** JSON body must include the token so the landing page can put it in the email link. The landing page looks for either `setPasswordToken` or `set_password_token`:

```json
{
  "setPasswordToken": "your-one-time-token-here",
  "userId": "optional"
}
```

If you don’t return `setPasswordToken` (or `set_password_token`), the email will still be sent but the link will go to your normal login URL instead of the one-click set-password link.

### 2. Set-password flow (when the user clicks the link in the email)

- **Route:** `GET /set-password?token=<one-time-token>` (or equivalent path on your app).

- **Behavior:**
  1. **Validate the token:** Look up the user by this token and check it hasn’t expired. If invalid or expired, show a clear error and a link to the normal login or “Forgot password?”.
  2. **If valid:** Log the user in (create their session so they are authenticated).
  3. **Show a modal** (or a full-page form) that asks the user to **enter a new password** (and confirm, e.g. “New password” + “Confirm password”). No need to ask for email — they’re already identified by the token.
  4. **On submit:** Hash the new password (e.g. bcrypt or argon2) and save it to the user record in the database. Clear the temporary password and the set-password token so the token can’t be reused. This saved password is then their **normal login password** for future logins.
  5. After saving, redirect to the main app (or close the modal and show the app). They are now logged in with their new password.

So: **clicking the email link should log them in (or register them if not already) and then show a modal to set their new password; after they submit, store only an encrypted/hashed version of that password in the DB and use it for future login.**

### 3. Password storage and recovery

- **Storage:** Only store a **hashed** version of the user’s password (e.g. bcrypt or argon2). Never store plaintext passwords.
- **Forgot password:** Implement a normal “Forgot password?” flow: user enters email, you send a reset link (or code), they set a new password, you hash and save it.
- **Forgot email (optional):** If you want account recovery by email, you can add a “Forgot email?” or similar flow; the landing page does not depend on it.

### 4. Summary

- **Landing page** will call your POST endpoint with `email`, `name`, `temporaryPassword`, `forcePasswordChange`, and expect a JSON response with `setPasswordToken` (or `set_password_token`).
- **Landing page** will send an email whose “Set your password & log in” link goes to:  
  `https://<your-tracker-origin>/set-password?token=<setPasswordToken>`
- **Your app** must: validate the token, log the user in, show a modal to set a new password, then save the hashed password and clear the token so future logins use that password and normal recovery (forgot password) works as usual.

Implement the create-user API, the `/set-password?token=...` route with modal and hashed password storage, and the forgot-password recovery flow so everything marries up with this behavior.
