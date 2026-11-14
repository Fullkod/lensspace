// LEN0012 (D6): publishes the APK built by the «Android app» workflow to Supabase Storage and keeps
// only that version. Run locally after the workflow:
//
//   node scripts/android-publish.mjs [--run <id>] [--dir <folder with build.json>] [--notes "texto"]
//                                    [--min-supported <versionCode>]
//
// Without --dir it downloads the artifact of the latest successful run (or --run) with the GitHub
// CLI. The service key is read at run time through the Management API (SUPABASE_ACCESS_TOKEN in
// .env.local) and is never stored or printed.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BUCKET = 'android-app'
const args = process.argv.slice(2)
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^"|"$/g, '')]
}))
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL
const projectRef = readFileSync('supabase/.temp/project-ref', 'utf8').trim()
if (!supabaseUrl || !env.SUPABASE_ACCESS_TOKEN) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_ACCESS_TOKEN are needed in .env.local')

// 1. The build: a local folder or the workflow artifact.
let dir = option('--dir')
if (!dir) {
  const run = option('--run') ?? execFileSync('gh', ['run', 'list', '--workflow', 'android-app.yml', '--status', 'success', '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId'], { encoding: 'utf8' }).trim()
  if (!run) throw new Error('No successful «Android app» run')
  dir = mkdtempSync(join(tmpdir(), 'lensspace-apk-'))
  execFileSync('gh', ['run', 'download', run, '--name', 'lensspace-android', '--dir', dir], { stdio: 'inherit' })
  console.log(`Run ${run} downloaded`)
}
const build = JSON.parse(readFileSync(join(dir, 'build.json'), 'utf8'))
const apk = readFileSync(join(dir, build.apk))
const sha256 = createHash('sha256').update(apk).digest('hex')
if (sha256 !== build.sha256 || apk.length !== build.sizeBytes) throw new Error('The APK does not match build.json')

// 2. Service key, only in memory.
const keys = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` } }).then((res) => {
  if (!res.ok) throw new Error(`Management API ${res.status}`)
  return res.json()
})
const serviceKey = (keys.find((key) => key.type === 'secret') ?? keys.find((key) => key.name === 'service_role'))?.api_key
if (!serviceKey) throw new Error('No service key returned by the Management API')
const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }

async function call(path, init = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

// 3. Android refuses downgrades: the new versionCode must be higher than the published one.
const current = await call('/rest/v1/android_releases?select=version_code,storage_path&order=version_code.desc')
if (current.length && current[0].version_code >= build.versionCode) throw new Error(`versionCode ${build.versionCode} is not higher than the published ${current[0].version_code}`)

// 4. Upload, register, then remove the older versions (D6: only one is kept).
const storagePath = build.apk
await call(`/storage/v1/object/${BUCKET}/${storagePath}`, { method: 'POST', body: apk, headers: { 'Content-Type': 'application/vnd.android.package-archive', 'x-upsert': 'true' } })
await call('/rest/v1/android_releases', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
  body: JSON.stringify({
    version_code: build.versionCode, version_name: build.versionName, storage_path: storagePath, size_bytes: build.sizeBytes, sha256,
    notes: option('--notes') ?? null, min_supported_version_code: Number(option('--min-supported') ?? 1),
  }),
})
if (current.length) {
  await call(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: current.map((row) => row.storage_path) }) })
  await call(`/rest/v1/android_releases?version_code=lt.${build.versionCode}`, { method: 'DELETE' })
}
console.log(`Published LensSpace ${build.versionName} (${build.versionCode}), ${(build.sizeBytes / 1024 / 1024).toFixed(1)} MB`)
console.log(`${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storagePath}`)
