# Auth emails: Spanish branded templates, sent from noreply@fullkod.com (LEN0004)

Date: 2026-11-07

- Decision (Roberto): every Supabase Auth email leaves as «LensSpace <noreply@fullkod.com>»
  through Resend SMTP (fullkod.com is already verified; no new DNS). The quota is shared with
  every Fullkod project: 100 emails/day, 3,000/month on the Resend Free plan.
- All six Auth templates were rewritten in plain Spanish with the LensSpace brand:
  `supabase/templates/{invite,recovery,confirmation,magic_link,email_change,reauthentication}.html`,
  subjects in `supabase/config.toml` (`[auth.email.template.*]`). The app currently triggers
  only `invite` (team invitation) and `recovery` (reset password and the owner's first access).
- Templates use `{{ .ConfirmationURL }}`; `/auth/callback` handles code, token_hash and
  fragment flows, so no app change was needed.
- Logo is the hosted PNG `https://lensspace.fullkod.com/brand/lensspace-app-icon-192.png`
  (email clients do not render SVG). Copy says links expire in 1 hour (`otp_expiry = 3600`);
  update the templates if the hosted expiry changes.
- SMTP was set by Roberto in the dashboard; the Resend key lives only there.
- Templates were applied 2026-11-07 with the Management API (`PATCH /v1/projects/<ref>/config/auth`,
  only the 12 `mailer_subjects_*` / `mailer_templates_*_content` keys, token
  `SUPABASE_ACCESS_TOKEN` from `.env.local`). To change a template: edit the HTML, PATCH the same
  keys again, then verify. Never run `supabase config push` from this repo: the local
  `config.toml` has `site_url = 127.0.0.1` and would overwrite production auth settings.
- Gotcha (Windows): send the PATCH body as ASCII JSON (`json.dumps(..., ensure_ascii=True)`), and
  when verifying read the API response from a file in binary — `json.load(sys.stdin)` decodes
  as cp1252 and reports false mismatches on accented text.
- Gotcha: after a template change, hosted Auth kept sending the default template for a few
  minutes (an invite ~5 min after the config reload still came out in English; a recovery email
  ~10 min later used the new one). Wait ~10 minutes before testing a template change.
- Hosted `mailer_otp_length` is 8: the reauthentication code has 8 digits.
- Verified 2026-11-07 in Gmail: recovery email arrives from `noreply@fullkod.com` with the new
  design.
- Re-sending an invitation: the invite function sends no email when the auth user already
  exists, so cancel first by deleting the `invited` membership and then the never-used auth user
  (in one statement). Deleting the user alone fails: `organization_memberships.user_id` →
  `profiles` is RESTRICT ("Database error deleting user" in the dashboard). There is no
  cancel/resend button in Equipo yet.
- Redirects (fixed 2026-11-07, Roberto's OK): the hosted `uri_allow_list` lacked
  `https://lensspace.fullkod.com/auth/callback`, so links requested from the custom domain fell
  back to `site_url` (the root of `lensspace.vercel.app`), which does not exchange `?code=`.
  Now `site_url = https://lensspace.fullkod.com` and the allow-list has localhost, vercel.app and
  fullkod.com callbacks. Any new domain must be added there, or its invite/recovery links break.
  In GoTrue logs the `referer` field shows the redirect actually used.
