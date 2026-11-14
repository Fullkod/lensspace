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

await browser.close()
const failedCount = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failedCount}/${results.length} passed`)
process.exit(failedCount ? 1 : 0)
