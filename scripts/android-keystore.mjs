// LEN0012: creates the signing key of the LensSpace Android app, outside the repo (adapted from
// Kshop scripts/app-keystore.mjs). Losing it means the installed app can never be updated:
// Android only installs an update signed with the same key. KEEP A BACKUP of both files.
//
//   node scripts/android-keystore.mjs [--dir <folder>] [--github]
//
// Writes <folder>/lensspace.jks (PKCS12, alias "lensspace") and lensspace.password.txt; the folder
// defaults to %USERPROFILE%\.lensspace\keystores. Never overwrites a key. --github also stores both
// as GitHub Actions secrets (ANDROID_KEYSTORE in base64, ANDROID_KEYSTORE_PASSWORD) with the GitHub CLI.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const dir = option('--dir') ?? join(homedir(), '.lensspace', 'keystores')
const keystore = join(dir, 'lensspace.jks')
const passwordFile = join(dir, 'lensspace.password.txt')

if (existsSync(keystore)) {
  console.log(`${keystore} already exists: it is kept (a new key could not update the installed app).`)
} else {
  mkdirSync(dir, { recursive: true })
  const password = randomBytes(24).toString('base64url')
  execFileSync('keytool', [
    '-genkeypair', '-keystore', keystore, '-storetype', 'PKCS12', '-alias', 'lensspace',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    '-storepass', password, '-keypass', password, '-dname', 'CN=LensSpace, O=Fullkod, C=CU',
  ], { stdio: ['ignore', 'ignore', 'inherit'] })
  writeFileSync(passwordFile, `${password}\n`)
  console.log(`Created ${keystore} and ${passwordFile}. Back both up (they cannot be recreated).`)
}

if (args.includes('--github')) {
  const set = (name, value) => execFileSync('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] })
  set('ANDROID_KEYSTORE', readFileSync(keystore).toString('base64'))
  set('ANDROID_KEYSTORE_PASSWORD', readFileSync(passwordFile, 'utf8').trim())
  console.log('GitHub secrets ANDROID_KEYSTORE and ANDROID_KEYSTORE_PASSWORD set.')
} else {
  console.log('To sign in GitHub Actions: node scripts/android-keystore.mjs --github')
}
