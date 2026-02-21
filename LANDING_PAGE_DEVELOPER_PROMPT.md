# Prompt for Landing Page Repo Developer

Use this when working on the **landing page** repo (the site that handles post-purchase and calls the Handstand Tracker API to create users).

---

## Your responsibilities

1. **Post-purchase: create tracker user and send "set password" email**
   - After a user purchases, call the **tracker API** to create (or update) their account and get a one-time set-password token.
   - Send the user an email whose "Set your password & log in" link uses that token.

2. **Environment / config**
   - You need the **tracker API** base URL and a **shared secret** so the API trusts your server.

---

## What you must configure

- **`TRACKER_API_URL`**  
  Full URL of the create-user endpoint. Example:  
  `https://handstand-api.onrender.com/api/users`  
  (no trailing slash)

- **`TRACKER_API_SECRET`**  
  Same secret as configured on the **tracker API** as `TRACKER_API_SECRET`. The API rejects create-user requests that don't send this (via header).

- **`TRACKER_LOGIN_URL`**  
  Origin of the **tracker web app** (where the set-password link goes). Example:  
  `https://handstand-web.onrender.com`  
  The email link will be: `TRACKER_LOGIN_URL` + `/set-password?token=<token>`.

---

## How to call the create-user API

- **Method:** `POST`
- **URL:** `TRACKER_API_URL` (e.g. `https://handstand-api.onrender.com/api/users`)
- **Headers:**
  - `Content-Type: application/json`
  - **Auth (one of):**
    - `Authorization: Bearer <TRACKER_API_SECRET>`
    - `X-API-Key: <TRACKER_API_SECRET>`
- **Body (JSON):**
  - `email` (string, required)
  - `name` (string, required)
  - `temporaryPassword` (string, required, min 8 characters)
  - `forcePasswordChange` (boolean, optional; typically `true`)

- **Success (200 or 201):** Response JSON includes:
  - `setPasswordToken` or `set_password_token` (one-time token for the link)
  - `userId` (optional)
- **Use the token in the email link:**  
  `https://<tracker-app-origin>/set-password?token=<setPasswordToken>`  
  The tracker app origin is the **web app** URL (e.g. `https://handstand-web.onrender.com`), not the API URL.

---

## Sending the "set password" email

- Send an email to the user (with your own email provider or Resend, etc.) that contains a single clear link:
  - **Link:** `https://<tracker-web-app-origin>/set-password?token=<setPasswordToken>`
- Example text: "Set your password & log in" or "Click here to set your password and access the app."
- The **tracker web app** will handle that URL (validate token, show set-password form, then log them in). You only need to put the correct link in the email.

---

## Checklist

- [ ] `TRACKER_API_URL` set to the create-user endpoint (e.g. `.../api/users`).
- [ ] `TRACKER_API_SECRET` set and same as on the tracker API.
- [ ] `TRACKER_LOGIN_URL` set to the tracker web app origin (e.g. `https://handstand-web.onrender.com`).
- [ ] After purchase, you POST to the API with `email`, `name`, `temporaryPassword`, `forcePasswordChange`.
- [ ] You read `setPasswordToken` (or `set_password_token`) from the response.
- [ ] The email you send contains a link: `https://<tracker-web-app-origin>/set-password?token=<token>`.

---

## Notes

- The **tracker API** is separate from the **tracker web app**. The API is what you call to create the user; the link in the email must point at the **web app** (where users set password and use the app).
- If the user already exists, the API returns 200 and a new token; use that new token in the email so the link is always valid.
