// LensSpace service worker (QA-28, LEN0011).
// - Keeps the static offline desk (/sin-conexion) and the hashed /_next/static files it
//   needs, so the app opens with no network at all.
// - Never caches tenant data, RSC payloads, API or Supabase responses: the desk reads its
//   data from IndexedDB, written by the app for the signed-in user.
const FALLBACK_CACHE = 'lensspace-offline-v2'
const FALLBACK_URL = '/offline.html'
const SHELL_URL = '/sin-conexion'
const SHELL_PREFIX = 'lensspace-shell-'
const SHELL_EXTRA = ['/icon.svg', '/brand/lensspace-horizontal.svg', '/brand/lensspace-app-icon-192.png']
const SHELL_REFRESH_MS = 30 * 60 * 1000

let lastShellRefresh = 0
let shellRefresh = null

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(FALLBACK_CACHE)
    await cache.addAll([FALLBACK_URL])
    // The desk is best effort here: a failure must not block the fallback page.
    await refreshShell().catch(() => undefined)
  })())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys
      .filter((key) => key !== FALLBACK_CACHE && !key.startsWith(SHELL_PREFIX))
      .map((key) => caches.delete(key)))
    // Navigation preload avoids waiting for the worker to boot on every page load.
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable()
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event, url))
    return
  }
  // Hashed build files never change under the same URL: serve them from the desk cache
  // first so it renders offline. Other files go to the network as usual.
  if (url.pathname.startsWith('/_next/static/') || SHELL_EXTRA.includes(url.pathname)) {
    event.respondWith(fromShellCache(request))
  }
})

async function handleNavigation(event, url) {
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request))
    // Online again: keep the desk in step with the current deploy (throttled).
    if (Date.now() - lastShellRefresh > SHELL_REFRESH_MS) event.waitUntil(refreshShell().catch(() => undefined))
    return response
  } catch {
    const shell = await cachedShell()
    if (shell) {
      if (url.pathname === SHELL_URL) return shell
      const target = new URL(SHELL_URL, self.location.origin)
      target.searchParams.set('desde', `${url.pathname}${url.search}`)
      return Response.redirect(target.href, 303)
    }
    return (await caches.match(FALLBACK_URL)) || Response.error()
  }
}

async function fromShellCache(request) {
  const cached = await caches.match(request, { ignoreVary: true })
  return cached || fetch(request)
}

async function currentShellCacheName() {
  const keys = await caches.keys()
  return keys.filter((key) => key.startsWith(SHELL_PREFIX) && !key.endsWith('-partial')).pop() || null
}

async function cachedShell() {
  const name = await currentShellCacheName()
  if (!name) return null
  const cache = await caches.open(name)
  return (await cache.match(SHELL_URL)) || null
}

// Downloads the desk, finds every build file it references (scripts, styles, fonts) and
// stores them in a cache named after that set. A new deploy produces a new set; the old
// cache is removed only after the new one is complete.
function refreshShell() {
  if (shellRefresh) return shellRefresh
  shellRefresh = (async () => {
    const response = await fetch(SHELL_URL, { cache: 'no-store', credentials: 'same-origin' })
    if (!response.ok) throw new Error(`desk ${response.status}`)
    const html = await response.clone().text()
    const assets = new Set(buildAssets(html))
    for (const asset of [...assets]) {
      if (!asset.endsWith('.css')) continue
      const css = await fetch(asset).then((res) => (res.ok ? res.text() : ''))
      for (const nested of cssAssets(css, asset)) assets.add(nested)
    }
    const list = [...assets].sort()
    const name = SHELL_PREFIX + (await digest(list.join('\n') + html.length))
    const keys = await caches.keys()
    if (!keys.includes(name)) {
      await caches.delete(`${name}-partial`)
      const temp = await caches.open(`${name}-partial`)
      // One by one: a single missing file must not leave the desk without any cache.
      const stored = await Promise.all([...list, ...SHELL_EXTRA].map(async (path) => {
        const asset = await fetch(path).catch(() => null)
        if (!asset?.ok) return false
        await temp.put(path, asset)
        return true
      }))
      if (!stored.some(Boolean)) throw new Error('desk assets unavailable')
      await temp.put(SHELL_URL, response)
      const cache = await caches.open(name)
      for (const req of await temp.keys()) await cache.put(req, await temp.match(req))
      await caches.delete(`${name}-partial`)
    } else {
      await (await caches.open(name)).put(SHELL_URL, response)
    }
    await Promise.all(keys.filter((key) => key.startsWith(SHELL_PREFIX) && key !== name).map((key) => caches.delete(key)))
    lastShellRefresh = Date.now()
  })().finally(() => { shellRefresh = null })
  return shellRefresh
}

// Matches "/_next/static/..." and the "static/..." form used inside the RSC payload, with or
// without the "immutable/" segment Vercel adds (static/immutable/chunks/x.js).
function buildAssets(text) {
  const found = text.match(/(?:\/_next\/)?static\/[\w\-./~%]+\.(?:js|css|woff2?|ttf|otf)\b/g) || []
  return found.map((path) => (path.startsWith('/_next/') ? path : `/_next/${path}`))
}

// Fonts inside the CSS are relative to the CSS file in production: url(../media/x.woff2).
function cssAssets(css, cssPath) {
  const base = new URL(cssPath, self.location.origin)
  const urls = [...css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((match) => match[1]).filter((value) => !value.startsWith('data:'))
  return urls.map((value) => new URL(value, base)).filter((url) => url.origin === self.location.origin).map((url) => url.pathname)
}

async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')
}
