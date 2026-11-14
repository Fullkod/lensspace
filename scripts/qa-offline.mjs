// LEN0011 offline QA. Needs a production server: `npm run build && npx next start -p 3100`.
// Usage: node scripts/qa-offline.mjs [baseUrl] [screenshotDir]
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:3100'
const shots = process.argv[3]
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })
const page = await context.newPage()

// 1. Online visit installs the worker, which caches the desk and its build files.
await page.goto(`${base}/`, { waitUntil: 'load' })
await page.evaluate(async () => { await navigator.serviceWorker.ready })
await page.waitForFunction(async () => (await caches.keys()).some((key) => key.startsWith('lensspace-shell-') && !key.endsWith('-partial')), null, { timeout: 30_000 })
const cacheInfo = await page.evaluate(async () => {
  const keys = await caches.keys()
  const shell = keys.find((key) => key.startsWith('lensspace-shell-') && !key.endsWith('-partial'))
  const entries = shell ? (await (await caches.open(shell)).keys()).map((req) => new URL(req.url).pathname) : []
  return { keys, entries }
})
check('desk cached with its build files', cacheInfo.entries.includes('/sin-conexion') && cacheInfo.entries.some((p) => p.endsWith('.js')), `${cacheInfo.entries.length} entries`)
check('no tenant data or RSC in the cache', !cacheInfo.entries.some((p) => p.startsWith('/api') || p.includes('_rsc') || /^\/(dashboard|sales|orders)/.test(p)))

// 2. Cold start with no network: a new page opening a protected route lands on the desk.
await context.setOffline(true)
const cold = await context.newPage()
await cold.goto(`${base}/dashboard`, { waitUntil: 'load' }).catch(() => undefined)
await cold.waitForSelector('h1', { timeout: 15_000 }).catch(() => undefined)
check('offline cold start opens the desk', new URL(cold.url()).pathname === '/sin-conexion' && (await cold.locator('h1').first().textContent())?.includes('Venta sin conexión'), cold.url())
check('desk hydrates offline (status badge says offline)', await cold.getByText('Sin conexión', { exact: true }).isVisible().catch(() => false))
const failed = []
cold.on('requestfailed', (req) => failed.push(req.url()))
await cold.reload({ waitUntil: 'load' }).catch(() => undefined)
await cold.waitForTimeout(1500)
check('reload offline needs no network for build files', !failed.some((url) => url.includes('/_next/static/')), failed.filter((url) => url.includes('/_next/')).join(', '))
if (shots) await cold.screenshot({ path: `${shots}/desk-offline-390.png`, fullPage: true })

// 3. Back online the desk offers the way back.
await context.setOffline(false)
await cold.waitForTimeout(500)
check('online again shows the way back', await cold.getByRole('link', { name: 'Volver a LensSpace' }).isVisible().catch(() => false))
if (shots) await cold.screenshot({ path: `${shots}/desk-online-390.png`, fullPage: true })

// 4. Signed-in seller (only with QA_EMAIL and QA_PASSWORD; use a demo organization).
if (process.env.QA_EMAIL && process.env.QA_PASSWORD) {
  const seller = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' })
  const app = await seller.newPage()
  await app.goto(`${base}/login`)
  await app.locator('input[name="email"]').fill(process.env.QA_EMAIL)
  await app.locator('input[name="password"]').fill(process.env.QA_PASSWORD)
  await Promise.all([app.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 }), app.locator('button[type="submit"]').click()])
  await app.goto(`${base}/dashboard`)
  const readSnapshot = () => app.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('lensspace-offline')
    request.onsuccess = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('snapshots')) return resolve(null)
      const all = db.transaction('snapshots').objectStore('snapshots').getAll()
      all.onsuccess = () => resolve(all.result[0] ?? null)
    }
    request.onerror = () => resolve(null)
  }))
  let snapshot = null
  for (let i = 0; i < 30 && !snapshot; i++) { snapshot = await readSnapshot(); if (!snapshot) await app.waitForTimeout(1000) }
  check('snapshot saved for the signed-in seller', Boolean(snapshot?.userId && snapshot.items.length && snapshot.organizations.length),
    snapshot ? `${snapshot.customers.length} customers, ${snapshot.items.length} items, ${snapshot.optometrists.length} optometrists, ${(JSON.stringify(snapshot).length / 1024).toFixed(1)} KB` : 'none')
  check('snapshot keeps no amounts or prescription values', snapshot && !/"(sphere|cylinder|totals|amount|balance)"/i.test(JSON.stringify(snapshot.customers)))
  await app.waitForFunction(async () => (await caches.keys()).some((key) => key.startsWith('lensspace-shell-') && !key.endsWith('-partial')), null, { timeout: 30_000 })

  await seller.setOffline(true)
  const desk = await seller.newPage()
  await desk.goto(`${base}/orders`).catch(() => undefined)
  await desk.getByText(/Datos guardados de hoy/).waitFor({ timeout: 15_000 }).catch(() => undefined)
  check('offline desk reads the saved data', await desk.getByText(/Datos guardados de hoy/).isVisible().catch(() => false))
  if (shots) await desk.screenshot({ path: `${shots}/desk-with-data-390.png`, fullPage: true })

  // Expiry (R3): pretend the server last answered 8 days ago.
  await desk.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open('lensspace-offline')
    request.onsuccess = () => {
      const store = request.result.transaction('snapshots', 'readwrite').objectStore('snapshots')
      const all = store.getAll()
      all.onsuccess = () => {
        const old = all.result[0]
        old.confirmedAt = new Date(Date.now() - 8 * 86_400_000).toISOString()
        store.put(old).onsuccess = () => resolve(true)
      }
    }
  }))
  await desk.reload().catch(() => undefined)
  await desk.getByText(/más de 7 días/).waitFor({ timeout: 15_000 }).catch(() => undefined)
  check('offline access expires after 7 days', await desk.getByText(/más de 7 días/).isVisible().catch(() => false))
  if (shots) await desk.screenshot({ path: `${shots}/desk-expired-390.png`, fullPage: true })

  // Sign-out forgets the saved data on this device.
  await seller.setOffline(false)
  await app.bringToFront()
  await app.goto(`${base}/dashboard`)
  await app.getByRole('button', { name: 'Abrir menú principal' }).click().catch(() => undefined)
  await app.getByRole('button', { name: 'Cerrar sesión' }).last().click()
  await app.waitForURL((url) => !url.pathname.startsWith('/dashboard'), { timeout: 30_000 }).catch(() => undefined)
  await app.waitForTimeout(500)
  check('sign-out removes the saved data', (await readSnapshot()) === null, app.url())
  await seller.close()
} else {
  console.log('SKIP signed-in checks (set QA_EMAIL and QA_PASSWORD for a demo seller)')
}

await browser.close()
const failedCount = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failedCount}/${results.length} passed`)
process.exit(failedCount ? 1 : 0)
