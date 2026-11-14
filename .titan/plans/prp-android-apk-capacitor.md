# PRP — Android APK with Capacitor, Vercel distribution and in-app updates

> **Status**: APPROVED to follow LEN0011 (Roberto 2026-11-13). Starts after `prp-offline-sales.md`; decisions D1-D5 below are still open.
> **Amendments 2026-11-13** (from the LEN0011 analysis):
> - Offline is solved in the web layer (`prp-offline-sales.md`). Phase 1 go/no-go adds: **cold start in airplane mode must render `/sin-conexion` from the service worker inside the Capacitor WebView**. If it fails, fall back to a TWA (real Chrome, guaranteed service worker; updates through a banner that opens the download).
> - Inside the shell the offline queue uses `@capacitor/filesystem` through the `OfflineStore` interface (the WebView may clear web storage, a Kshop lesson).
> - Reuse Kshop's pieces: the GitHub Actions workflow, keystore scripts and `installApk` (`@capacitor/file-transfer` + `@capawesome-team/capacitor-file-opener`, tested on a real phone). See `../kshop/docs/APPS.md`.
> **Decided by Roberto (2026-11-09)**: the APK is built by a GitHub Action and stored and downloaded through Vercel. Vercel Blob is this plan's reading of "Vercel".
> **Date**: 2026-11-09
> **Project**: LensSpace
> **Tasknic**: LEN0012 (blocked by LEN0011).
> **Supersedes if approved**: part of `.titan/memory/project/2026-10-04-pwa-install-button.md` ("PWA instead of an APK"). That entry already names a Capacitor shell pointing at the deployed URL, built by a manual GitHub Actions workflow, as the free route.

---

## Objective

Android users install LensSpace from a signed APK downloaded from `lensspace.fullkod.com`. The APK is a Capacitor shell that loads the deployed web app. A manual GitHub Action builds and signs it and publishes it to Vercel Blob. The app detects a newer APK by itself, then downloads it and hands it to the Android installer from inside the app.

## Why

Roberto's request (2026-11-09): a real APK with no browser bar that notices updates by itself, tells the user and lets them download the update. The second row is an assumption.

| Problem | Solution |
|---------|----------|
| The installed PWA depends on the browser and its install host. On 2026-11-09 a phone showed Chrome's toolbar over the app (see the PWA memory entry). | A native shell always runs full screen on the canonical host, with no browser UI. |
| Users without Google Play or a recent Chrome have no clear install path. | A direct APK download from our own domain, explained in plain Spanish. |
| Sideloaded apps have no store to deliver updates. | The app checks a published manifest and installs the new APK in a few taps. |

**Business value**: an app that looks like a real app for the Cuban pilot, without Google Play fees or review, and without adding per-release manual steps beyond running one workflow.

## What

### Success criteria

- [ ] Running the workflow on `main` produces a signed release APK and publishes it, with no binary committed to git.
- [ ] `GET /api/android/latest` returns the current release metadata without a session, and `GET /api/android/download` redirects to the current APK.
- [ ] On a real Android phone, login survives force-stopping and reopening the app, and a sale with a Server Action completes.
- [ ] A phone running version N shows the update prompt for N+1 within one app open, downloads it in-app, and ends on N+1 with the session intact.
- [ ] An interrupted download (airplane mode mid-download) resumes or fails with a clear retry. A hash mismatch never reaches the installer.
- [ ] Printing a contract or manual, downloading a prescription file, uploading a prescription photo and opening a WhatsApp link all work inside the app.
- [ ] Outside the shell (desktop, iOS, Chrome) behavior is unchanged except the new Android download option. `npm run typecheck`, `lint` and `build` pass.

### Expected behavior

**First install.** On an Android browser, "Instalar app" opens a dialog offering the APK with its size in MB. The user downloads it, allows the install when Android asks, and opens LensSpace.

**Release.** A developer runs the workflow with release notes. CI builds, signs, verifies, uploads the APK, and writes `latest.json` last, so the manifest never points at a missing file.

**Update.** On open and on return to foreground (throttled to once per 6 h), the web UI compares its native `versionCode` with `/api/android/latest`. If newer, it shows version, size and notes with "Actualizar" and "Más tarde". "Actualizar" asks once for the "install unknown apps" permission if needed, shows progress, verifies the hash and opens the system installer. If the installed version is below `minSupportedVersionCode`, the prompt cannot be dismissed.

**Most changes need no APK.** Web code ships with each Vercel deploy and reaches installed apps on the next load. An APK release is needed only when the native shell changes.

### Out of scope

iOS, Google Play, OTA web bundles (`@capgo/capacitor-updater` solves a problem we don't have, because the web is already remote), offline data, native push, App Links for auth emails, and download analytics.

---

## Context

### What the investigation found

| Finding | Evidence | Consequence |
|---------|----------|-------------|
| The app cannot be exported statically. | Server Actions and SSR, `src/proxy.ts` (PWA memory entry). | Remote mode: `server.url` is the only workable Capacitor setup. |
| Capacitor officially says `server.url` is "not intended for use in production". | `@capacitor/cli@8.6.0` `declarations.d.ts`. | Accepted, conscious tradeoff. It works and is not a store-review issue when sideloading, but we carry the risk across Capacitor upgrades. |
| Capacitor Android has no `DownloadListener`, no print support and no `onCreateWindow`. | Grep of `@capacitor/android@8.6.0` `com/getcapacitor`. | `window.print()` and `blob:` downloads need native help (Phase 3). |
| Capacitor resolves service worker requests by default. | `Bridge.java:283`, `CapConfig.java:56`. | `public/sw.js` can probably stay. Phase 1 confirms the bridge exists after a worker-served navigation. |
| `minWebViewVersion` + `errorPath` exist. | CLI declarations. | Next 16 needs Chrome 111+ (`docs/.../upgrading/version-16.md`). Old phones get a clear local page instead of a broken app. |
| The repo is **public**; no workflows or Actions secrets exist yet. | `gh repo view`, `gh secret list`, no `.github/`. | Keystore and token live only in GitHub secrets. Standard runners are free for public repos. |
| No Android toolchain locally (JDK 14, no `ANDROID_HOME`), no Vercel CLI, no `.vercel/`. | Shell checks. | CI is the only build path. Blob store creation is a manual step for Roberto. |
| The repo has no route handlers yet. | No `route.ts` under `src/app`. | These are the first; read `node_modules/next/dist/docs/.../route.md` before writing them. |

### Decisions needed from Roberto

| # | Decision | Recommendation |
|---|----------|----------------|
| D1 | What happens to the PWA on Android once the APK exists? | APK first on Android, PWA kept as a secondary option until the pilot validates the shell. The PWA remains the only path on iOS. |
| D2 | Release trigger: manual or every push? | Manual `workflow_dispatch`. Web changes don't need an APK, and every forced download costs Cuban users mobile data. |
| D3 | `applicationId` (**cannot change after the first install**). | `com.fullkod.lensspace`. |
| D4 | Vercel plan, and who keeps the keystore backup? | Confirm the plan. Vercel's docs restrict Hobby to non-commercial personal use, so a paid SaaS needs Pro or Enterprise regardless of this APK. Keep the keystore in a password manager outside the repo. |
| D5 | Google developer verification (see Gotchas). | Accept for the pilot. Decide on registering before the 2027 global rollout. |

### Key architecture decisions

| Decision | Why | Alternatives rejected |
|----------|-----|-----------------------|
| Vercel Blob (public store) for APK and manifest. | Keeps binaries out of git and decouples releases from web deploys. | `public/` (binaries in a public repo, and CI commits trigger web deploys). Building on Vercel (no JDK or SDK). GitHub Releases (not the requested host). |
| Stable same-origin endpoints in front of Blob. | The app and links never depend on a store URL. | Clients reading Blob directly. |
| One small local Capacitor plugin (`LensSpaceShell`). | Covers version, update, print and file save with a minimal native surface. | Official `App`/`Browser`/`Filesystem` plugins do not cover install or print. Community APK installers add maintenance and trust risk. |
| `DownloadManager` for the APK. | Survives flaky links and app kills, and needs no storage permission when saving to app-specific external files. | Fetching in JS. |
| The plugin takes **no URL** from JS. Native code reads a fixed manifest URL. | The WebView loads remote code; an XSS must not be able to install an arbitrary APK. | `startUpdate(url)`. |
| Detect the shell through `appendUserAgent: LensSpaceAndroid`. | Works on the server and before hydration, with no client import. | Only `window.Capacitor`. |
| TWA (Bubblewrap) rejected. | The request specifies Capacitor, and a TWA has no JS-to-native bridge for in-app install. It would solve print and downloads, so it is the fallback if Phase 1 fails. | |

### References

- `src/shared/hooks/use-install-mode.ts`, `src/shared/components/InstallAppButton.tsx` — install modes to extend.
- `src/app/layout.tsx` — mount point next to `ServiceWorkerRegistration`.
- `src/lib/supabase/proxy.ts`, `src/proxy.ts` — matcher must exclude `/api/android`.
- `src/features/client-docs/components/PrintView.tsx:32`, `src/features/admin/components/ContractPrintView.tsx:19` — `window.print()`.
- `src/features/prescriptions/components/PrescriptionWorkspace.tsx:201`, `src/features/client-docs/services/exportDocs.ts:9` — `blob:` downloads.
- `src/features/client-docs/components/ManualReader.tsx:24`, `ClientDocsGenerator.tsx:37`, `src/features/admin/components/LicenseContractPanel.tsx:74,136` — `window.open` and `_blank`.
- `public/offline.html` — base for the local error page (no external assets).
- `src/features/client-docs/schemas/clientDocsInput.ts` — manual copy, in plain Cuban Spanish.
- Docs: [Capacitor config](https://capacitorjs.com/docs/config), [Updating to 8.0](https://capacitorjs.com/docs/updating/8-0), [Blob SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk), [Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing), [Sideloading timeline](https://www.androidauthority.com/android-sideloading-changes-timeline-3679204/).

### Proposed architecture

```
capacitor.config.ts                      # server.url, errorPath, minWebViewVersion: 111, appendUserAgent
android/                                 # native project, versioned, no secrets
└── app/src/main/java/com/fullkod/lensspace/  # MainActivity + LensSpaceShell plugin
android-shell/www/                       # local webDir: placeholder and error page
.github/workflows/android-release.yml    # workflow_dispatch: build, sign, publish
scripts/publish-android-release.mjs      # uploads APK, then latest.json
src/app/api/android/latest/route.ts      # public JSON, short cache
src/app/api/android/download/route.ts    # redirect to current APK
src/shared/lib/native-shell.ts           # detection and typed plugin access
src/shared/hooks/use-android-update.ts
src/shared/components/AndroidUpdatePrompt.tsx
```

Pinned stack: Capacitor 8.6 (`@capacitor/core`, `cli`, `android`), JDK 21, Node 22 in CI, minSdk 24, target/compile SDK 36. New dependencies: `@capacitor/core` (runtime, dynamically imported only in the shell), `@capacitor/cli`, `@capacitor/android` and `@vercel/blob` (dev only).

### Data model

No database changes, no tenant data and no RLS impact. The release manifest lives in Blob at `android/latest.json`, next to immutable `android/lensspace-<versionCode>.apk` files:

```json
{
  "versionCode": 12,
  "versionName": "1.0.12",
  "url": "https://<store>.public.blob.vercel-storage.com/android/lensspace-12.apk",
  "sizeBytes": 8123456,
  "sha256": "<hex>",
  "minSupportedVersionCode": 1,
  "notes": "Texto para el usuario",
  "publishedAt": "2026-11-09T12:00:00Z"
}
```

New configuration: GitHub secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `BLOB_READ_WRITE_TOKEN`; Vercel env `ANDROID_MANIFEST_URL`.

---

## Estimate

25-36 engineering hours (about 3-5 days), most uncertainty in Phase 3 and real-device testing: shell 4-6 h, pipeline 3-4 h, in-app update 8-10 h, WebView compatibility 6-10 h, real-device QA 4-6 h.

External cost for direct distribution: USD 0 on top of the current Vercel plan. GitHub Actions standard runners are free for a public repo. Google Play is out of scope (USD 25 once if ever needed; registration from Cuba unconfirmed).

---

## Blueprint

> Phases only. Subtasks are generated on entering each phase (`tf-bucle-agentico`).

### Phase 1: Shell and go/no-go on a real phone
**Objective**: Capacitor project loading production, with icons and error page, built as a debug APK by CI.
**Validation**: On a real phone on a Cuban network: login persists after force-stop, a Server Action works, the plugin bridge exists after a service-worker navigation, the error page shows when offline, and the WebView version is recorded. **If this fails, stop and reassess TWA.**

### Phase 2: Signed release pipeline to Vercel Blob
**Objective**: Keystore created and backed up, secrets set, manual workflow publishing a verified APK and then the manifest.
**Validation**: `apksigner verify` passes in CI; a rerun with a non-increasing `versionCode` fails without changing the manifest; the APK URL downloads on a phone **on a Cuban network** with the correct content type. If the Blob host is unreachable, switch to a same-origin rewrite before continuing.

### Phase 3: WebView compatibility
**Objective**: Shell detection, plugin print and file save, and fixes for `window.open` flows, install button hidden in the shell, safe areas under edge-to-edge.
**Validation**: The print, download, upload and WhatsApp criteria pass on a phone; the same flows are unchanged in a desktop browser.

### Phase 4: Public distribution
**Objective**: `/api/android/latest` and `/api/android/download`, proxy exclusion, and the Android download option in `InstallAppButton` and the landing per D1.
**Validation**: Both endpoints work without a session; Playwright with an Android user agent confirms the dialog on mobile width; iOS and desktop modes are unchanged.

### Phase 5: In-app update
**Objective**: Native download, verification and install; web prompt with progress, snooze and mandatory mode.
**Validation**: Real N to N+1 update on a phone; tampered hash blocked; interrupted download handled; permission-denied path explained; mandatory mode cannot be dismissed.

### Phase 6: Documentation and memory
**Objective**: End-user manual in plain Cuban Spanish, a release runbook, and memory updated (mark the PWA decision as partly superseded).
**Validation**: The manual renders; another developer can release from the runbook alone.

### Phase 7: Final validation
**Objective**: End-to-end on real devices.
**Validation**:
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` pass
- [ ] Playwright evidence in `.titan/qa/`
- [ ] Clean install and update tested on at least two Android versions, one of them an old device
- [ ] All success criteria met

---

## Learnings (Self-Annealing)

> Grows during implementation.

---

## Gotchas

- [ ] **Keystore loss is permanent.** A different key cannot update the app (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`), so every user would have to uninstall and reinstall.
- [ ] **Google developer verification.** Reported rollout: Brazil, Indonesia, Singapore and Thailand from September 2026, global on certified devices in 2027. Unverified APKs would then need an advanced sideloading flow or ADB. Registration feasibility from Cuba is unknown.
- [ ] **`server.url` must be `https://lensspace.fullkod.com`.** `lensspace.vercel.app` 307-redirects there, and off-host navigations open in the external browser. Note that `siteConfig`'s fallback is the old host.
- [ ] **Web and shell versions drift.** A web deploy reaches old shells at once. Web code must check plugin availability or `versionCode` before calling a new native method.
- [ ] **No downgrades.** Android refuses a lower `versionCode`. Rollback means rebuilding older code with a new, higher code.
- [ ] **`GITHUB_RUN_NUMBER` as `versionCode`** resets if the workflow file is renamed; a rerun reuses the number. The publish guard catches both.
- [ ] **WebView updates need Play on many phones.** Old devices may stay under Chrome 111, hence `minWebViewVersion`. Measure real pilot devices in Phase 1.
- [ ] **Blob host reachability from Cuba is unverified**, and so is Range support for resuming downloads. Phase 2 tests the first, Phase 5 the second.
- [ ] **Blob limits on Hobby**: 1 GB storage, 10 GB/month transfer, and access is cut off for up to 30 days when exceeded. At an assumed 15 MB APK (to be measured), that is about 680 downloads per month and 68 stored releases. No pruning is planned until that matters.
- [ ] **Overwritten `latest.json` can be stale for up to 60 s** on the CDN. Set an explicit `.apk` content type (`application/vnd.android.package-archive`).
- [ ] **Sessions are separate from the browser.** Auth emails (invitations, password reset) open in the browser, not the app. The user finishes there and then logs in inside the app.
- [ ] **Play Protect may warn on sideloaded APKs.** The manual must say so plainly.
- [ ] **The PWA and the APK are separate apps.** A user may have two icons; existing PWA installs do not migrate.

## Anti-patterns

- Do not commit the keystore, passwords or APKs. The repo is public.
- Do not accept a download URL or file path from JavaScript in the install flow.
- Do not add plugins beyond what is used; every native method is reachable by remote page code.
- Do not publish an APK on every push.
- Do not add `pull_request` or `pull_request_target` triggers to the release workflow. The repo is public and the job holds the signing key.
- Do not bundle Capacitor into non-shell sessions.
- Do not replace OpenWA, the PWA flow on iOS, or existing auth.

---

*PRP parked on 2026-11-09. No code has been modified.*
