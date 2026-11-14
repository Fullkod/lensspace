# Android APK: analysis and parked plan

Date: 2026-11-09

Status: unparked 2026-11-13 — follows LEN0011 (offline sales), see
`project/2026-11-13-offline-sales.md`; the remote shell alone does not work offline.
Previously parked. Roberto asked for the analysis and the plan only ("no lo vamos a hacer ahora
mismo"). Plan: `.titan/plans/prp-android-apk-capacitor.md`. Nothing is implemented.

Decided by Roberto: a GitHub Action builds the APK, and Vercel stores it and serves the
download. The plan reads "Vercel" as Vercel Blob, so no binary enters git.

Goal: a real Android app with no browser bar that detects updates, tells the user and
installs them from inside the app.

Plan in short:

- Capacitor shell in remote mode (`server.url = https://lensspace.fullkod.com`), because
  Server Actions and SSR rule out a static export. Capacitor documents `server.url` as meant
  for live reload; this is an accepted tradeoff.
- Web changes reach installed apps with each Vercel deploy. A new APK is only for shell changes.
- Manual `workflow_dispatch` is the recommended release trigger. CI signs and publishes
  immutable APKs, then writes `latest.json` last.
- The in-app updater takes no URL from JavaScript, because the WebView runs remote code.

Facts that shape the work:

- The repo is public: the keystore and Blob token live only in GitHub secrets. Standard
  Actions runners are free for public repos. Losing the keystore forces every user to reinstall.
- There is no `.github/` and no route handlers yet.
- In the WebView, `window.print()` (manual, contracts), `blob:` downloads (prescription files,
  manual Markdown) and `window.open` flows need native help.
- Vercel docs restrict Hobby to non-commercial use. The project's current plan is unconfirmed.
- Vercel Blob on Hobby: 1 GB storage and 10 GB/month transfer.

Open before starting: decisions D1-D5 in the plan, the Blob host reachable from Cuba (untested),
Google developer verification (global rollout planned for 2027, registration from Cuba unknown).

Estimate: 25-36 engineering hours. External cost USD 0 on top of the current Vercel plan.

2026-11-13 (LEN0012): Roberto decided D1 (APK first on Android, PWA as fallback), D2 (manual workflow) and
D3 (`com.fullkod.lensspace`, permanent after the first install). Phase 1 built: Capacitor 8.6.0 shell,
`scripts/android-build.mjs`, workflow «Android app» (debug APK, no secrets); `android/` is generated, not
versioned. Open: D4 (Vercel plan, keystore backup owner), D5, and D6 proposed: Supabase Storage instead of
Vercel Blob for the APK (reachable from Cuba, as Kshop does).

2026-11-13 later: D6 decided (Supabase Storage, keep only the latest version). Release flow: run the
«Android app» workflow (signed with the key in `%USERPROFILE%\.lensspace\keystores`, backed up by Roberto;
GitHub secrets ANDROID_KEYSTORE / ANDROID_KEYSTORE_PASSWORD), then `node scripts/android-publish.mjs`.
The installed app offers updates by itself (`AndroidUpdatePrompt`). First phone test showed Capacitor's
`error.html`: likely the system WebView is older than 111 (not updatable from Google Play in Cuba);
`error.html` now reports it. Published: 1.0.2.
