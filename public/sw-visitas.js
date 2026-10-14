// ============================================
// RUTA - MÓDULO 5
// Service Worker para funcionamiento offline
// HU-08
// ============================================

const CACHE_NAME = 'ruta-visitas-v4';

const RECURSOS = [

  // Pantallas del módulo 5
  '/src/modules/visitas/Registrar_Visita_Movil.html',
  '/src/modules/visitas/Pendientes_Sincronizacion_Movil.html',

  // Base de datos local
  '/src/modules/visitas/db-local.js',
  '/src/modules/visitas/registrar-visita.js',
  '/src/modules/visitas/pendientes-sincronizacion.js',

  // Estilos
  '/src/styles/main.css',
  '/src/styles/visitas_movil.css',

  // Identidad visual
  '/logo-ruta.png',
  '/avatar.png',

  // Iconos del formulario
  '/hoja-de-calculo.png',
  '/ubicacion.png',
  '/reloj.png',
  '/estadistico.png',
  '/nota-adhesiva.png',
  '/cuenta-de-usuario.png',
  '/herramienta-blanca.png',

  // Iconos de sincronización
  '/sincronizar.png',
  '/sincronizar-blanco.png'

];

const RUTAS = new Set(RECURSOS);

// Instalar y almacenar recursos esenciales
self.addEventListener('install', (event) => {

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(RECURSOS))
      .then(() => self.skipWaiting())
  );

});

// Activar y limpiar versiones anteriores propias
self.addEventListener('activate', (event) => {

  event.waitUntil((async () => {

    const nombres = await caches.keys();

    await Promise.all(
      nombres
        .filter(nombre =>
          nombre.startsWith('ruta-visitas-') &&
          nombre !== CACHE_NAME
        )
        .map(nombre => caches.delete(nombre))
    );

    await self.clients.claim();

  })());

});

// Atender únicamente recursos del módulo
self.addEventListener('fetch', (event) => {

  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  if (
    url.origin !== self.location.origin ||
    !RUTAS.has(url.pathname)
  ) {
    return;
  }

  event.respondWith((async () => {

    const cache = await caches.open(CACHE_NAME);

    try {

      const respuesta = await fetch(event.request);

      if (respuesta.ok) {
        await cache.put(
          event.request,
          respuesta.clone()
        );
      }

      return respuesta;

    } catch (error) {

      const guardada = await cache.match(event.request);

      return guardada || Response.error();

    }

  })());

});