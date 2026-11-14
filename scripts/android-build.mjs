// LEN0012: generates the Android shell (Capacitor, remote mode on lensspace.fullkod.com) and, with
// --assemble, builds the signed release APK in release/ with build.json (size, sha256). android/
// and release/ are generated and git-ignored, as in Kshop. CI runs it (.github/workflows/
// android-app.yml); locally --assemble needs JDK 21, the Android SDK and LENSSPACE_KEYSTORE_FILE /
// LENSSPACE_KEYSTORE_PASSWORD.
// Usage: node scripts/android-build.mjs [--version-code N] [--version-name X] [--assemble]
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const option = (name) => { const index = process.argv.indexOf(name); return index > 0 ? process.argv[index + 1] : undefined }
const versionCode = Number(option('--version-code') ?? 1)
const versionName = option('--version-name') ?? `1.0.${versionCode}`
if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error(`Invalid --version-code ${option('--version-code')}`)

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', cwd: root, ...options })
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${result.status})`)
}

// 1. Native project.
if (!existsSync(join(root, 'android'))) run('npx', ['cap', 'add', 'android'])
run('npx', ['cap', 'sync', 'android'])

// 2. Version: versionCode must always grow (Android refuses downgrades).
const gradlePath = join(root, 'android/app/build.gradle')
const gradle = readFileSync(gradlePath, 'utf8')
  .replace(/versionCode \d+/, `versionCode ${versionCode}`)
  .replace(/versionName "[^"]*"/, `versionName "${versionName}"`)
if (!gradle.includes(`versionCode ${versionCode}`)) throw new Error('versionCode not found in build.gradle')
writeFileSync(gradlePath, gradle)

// 3. Icon: the maskable brand PNG (full-bleed #07322F) as the adaptive foreground, inset by
// android-shell/res/ic_launcher.xml; the plain icon for launchers older than Android 8.
const res = join(root, 'android/app/src/main/res')
for (const dir of readdirSync(res).filter((name) => name.startsWith('mipmap-') && !name.includes('anydpi'))) {
  copyFileSync(join(root, 'public/brand/lensspace-app-icon-maskable-512.png'), join(res, dir, 'ic_launcher_foreground.png'))
  copyFileSync(join(root, 'public/brand/lensspace-app-icon-192.png'), join(res, dir, 'ic_launcher.png'))
  copyFileSync(join(root, 'public/brand/lensspace-app-icon-192.png'), join(res, dir, 'ic_launcher_round.png'))
}
mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true })
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) copyFileSync(join(root, 'android-shell/res/ic_launcher.xml'), join(res, 'mipmap-anydpi-v26', name))
writeFileSync(join(res, 'values/ic_launcher_background.xml'), '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#07322F</color>\n</resources>\n')

// Updates install from inside the app (Kshop KSH0008): Android asks the user once to allow it.
const manifestPath = join(root, 'android/app/src/main/AndroidManifest.xml')
const installPermission = '<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />'
const manifest = readFileSync(manifestPath, 'utf8')
if (!manifest.includes(installPermission)) writeFileSync(manifestPath, manifest.replace('</manifest>', `    ${installPermission}
</manifest>`))

// 4. Launch screen: the template ships Capacitor's logo (drawable*/splash.png). Replace it by the
// brand icon centred on #07322F; Android 12+ draws its own splash from the app icon on that color.
for (const dir of readdirSync(res).filter((name) => name.startsWith('drawable'))) {
  const png = join(res, dir, 'splash.png')
  if (existsSync(png)) rmSync(png)
}
writeFileSync(join(res, 'drawable/splash.xml'), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/ic_launcher_background"/>
    <item android:gravity="center" android:width="144dp" android:height="144dp" android:drawable="@mipmap/ic_launcher_foreground"/>
</layer-list>
`)
const stylesPath = join(res, 'values/styles.xml')
const styles = readFileSync(stylesPath, 'utf8')
if (!styles.includes('windowSplashScreenBackground')) {
  writeFileSync(stylesPath, styles.replace(
    '<item name="android:background">@drawable/splash</item>',
    '<item name="android:background">@drawable/splash</item>\n        <item name="windowSplashScreenBackground">@color/ic_launcher_background</item>',
  ))
}

console.log(`LensSpace Android ${versionName} (${versionCode})`)

// 5. Signed release APK. The key must always be the same one (scripts/android-keystore.mjs):
// Android refuses an update signed with another key.
if (process.argv.includes('--assemble')) {
  const keystore = process.env.LENSSPACE_KEYSTORE_FILE
  const password = process.env.LENSSPACE_KEYSTORE_PASSWORD
  if (!keystore || !existsSync(keystore) || !password) throw new Error('LENSSPACE_KEYSTORE_FILE / LENSSPACE_KEYSTORE_PASSWORD missing: the APK must be signed with the app key')
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  run(gradlew, [
    'assembleRelease', '--no-daemon',
    `-Pandroid.injected.signing.store.file=${keystore}`,
    `-Pandroid.injected.signing.store.password=${password}`,
    '-Pandroid.injected.signing.key.alias=lensspace',
    `-Pandroid.injected.signing.key.password=${password}`,
  ], { cwd: join(root, 'android') })
  const apkDir = join(root, 'android/app/build/outputs/apk/release')
  const built = readdirSync(apkDir).find((name) => name.endsWith('.apk') && !name.includes('unsigned'))
  if (!built) throw new Error(`No signed APK in ${apkDir}`)
  const releaseDir = join(root, 'release')
  rmSync(releaseDir, { recursive: true, force: true })
  mkdirSync(releaseDir, { recursive: true })
  const apkName = `lensspace-${versionCode}.apk`
  copyFileSync(join(apkDir, built), join(releaseDir, apkName))
  const apk = readFileSync(join(releaseDir, apkName))
  const info = { versionCode, versionName, apk: apkName, sizeBytes: apk.length, sha256: createHash('sha256').update(apk).digest('hex') }
  writeFileSync(join(releaseDir, 'build.json'), `${JSON.stringify(info, null, 2)}
`)
  console.log(`APK: ${join(releaseDir, apkName)} (${(apk.length / 1024 / 1024).toFixed(1)} MB)`)
}
