const CACHE_NAME = 'econ-coach-shell-v2'
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll(SHELL_FILES)
      const index = await fetch('/index.html')
      if (index.ok) {
        const html = await index.text()
        const assets = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
          .map((match) => match[1])
          .filter((asset) => asset.startsWith('/assets/'))
        await Promise.all(assets.map((asset) => cache.add(asset).catch(() => undefined)))
      }
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('econ-coach-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return
  }

  const navigation = request.mode === 'navigate'
  if (!navigation && request.destination === '' && !url.pathname.startsWith('/assets/')) return

  const key = navigation ? '/index.html' : request
  const update = caches.open(CACHE_NAME).then(async (cache) => {
    const response = await fetch(request)
    if (response.ok && response.type === 'basic') await cache.put(key, response.clone())
    return response
  })
  event.waitUntil(update.then(() => undefined, () => undefined))
  event.respondWith(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.match(key))
      .then((cached) => cached ?? update)
      .catch(() => (navigation ? caches.match('/index.html') : Response.error()))
  )
})
