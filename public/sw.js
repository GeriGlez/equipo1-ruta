// service worker simple para cachear la app y que abra sin conexion
const CACHE_NAME = 'ruta-pwa-cache-v1'

// archivos basicos a cachear
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/main.js',
  '/src/styles/main.css'
]

// instalacion: guardar archivos base en cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('algun archivo no se pudo cachear en install:', err)
      })
    })
  )
  self.skipWaiting()
})

// activacion: limpiar versiones viejas de cache
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }
        })
      )
    })
  )
  self.clients.claim()
})

// interceptar peticiones
self.addEventListener('fetch', (e) => {
  // no interceptamos llamadas directas a las apis de supabase
  if (e.request.url.includes('supabase.co')) {
    return
  }

  // para archivos de la app: intentamos red y si falla usamos cache
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // guardamos copia fresca en cache si la respuesta es valida
        if (res.status === 200) {
          const resClone = res.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, resClone)
          })
        }
        return res
      })
      .catch(() => {
        // si no hay internet devuelve lo que tenga en cache
        return caches.match(e.request).then((cached) => {
          if (cached) return cached
          // si es navegacion a una pagina devuelve index.html
          if (e.request.mode === 'navigate') {
            return caches.match('/index.html')
          }
        })
      })
  )
})
