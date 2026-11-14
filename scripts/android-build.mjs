// LEN0012: generates the Android shell (Capacitor, remote mode on lensspace.fullkod.com) and,
// with --assemble, builds a debug APK. android/ is generated and git-ignored, as in Kshop.
// CI runs it (.github/workflows/android-app.yml); locally `--assemble` needs JDK 21 and the
// Android SDK. Usage: node scripts/android-build.mjs [--version-code N] [--version-name X] [--assemble]
import { spawnSync } from 'node:child_process'
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

// 5. Debug APK (phase 1: go/no-go on a real phone). Signed release builds come in phase 2.
if (process.argv.includes('--assemble')) {
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
  run(gradlew, ['assembleDebug', '--no-daemon'], { cwd: join(root, 'android') })
}
