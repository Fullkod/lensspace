# 2026-10-28 — Fullkod email (@fullkod.com) runs on Resend

- `fullkod.com` is verified in **Resend** (Roberto's account, Free plan) for **sending and receiving**. The domain MX
  points to Resend; Porkbun forwarding is no longer used.
- Inboxes: **`contact@fullkod.com`** (sales, website form) and **`support@fullkod.com`** (app support), read and answered
  at `resend.com/inboxes`. **There is no automatic forwarding** to Gmail or anyone: Resend doesn't offer it and we
  decided not to build it.
- Free plan limits, **shared by every project** sending from `@fullkod.com`: 3,000 emails/month, 100/day, 1 webhook,
  3 inboxes (one left). A subdomain (e.g. `lensspace.fullkod.com`) is a separate domain for Resend and would need its
  own verification.
- DNS details: `memoria/reference/dominio-fullkod-dns.md` in the `Fullkod/hub` repo.

**How to apply here:** if this project has (or will have) a contact form or any message the team must read, **the
project must find its own way to notify** (in-app notification, WhatsApp alert, Tasknic task, email to an address
someone reads…). Don't assume anyone checks the Resend inboxes daily. When sending from `@fullkod.com`, use a dedicated
sender (e.g. `noreply@` or `web@`) and keep the shared quota in mind. Never commit the API key: it goes in env vars.
