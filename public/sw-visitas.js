// ============================================
// RUTA - MÓDULO 5
// Service Worker para funcionamiento offline
// HU-08
// ============================================

const CACHE_NAME = 'ruta-app-v4';

const RECURSOS = [

  // App Shell general
  '/',
  '/index.html',

  '/src/main.js',
  '/src/adminapp.js',
  '/src/tecnicoapp.js',

  // Autenticación
  '/src/modules/auth/authService.js',
  '/src/modules/auth/loginView.js',

  // Supabase
  '/src/services/supabase.js',

  '/src/services/ordenes-tecnico.js',

  // IndexedDB
  '/src/modules/visitas/db-local.js',

  // Pantallas del módulo 5
  '/src/modules/visitas/Registrar_Visita_Movil.html',
  '/src/modules/visitas/Pendientes_Sincronizacion_Movil.html',
  '/src/modules/visitas/Visitas_y_Bitacora_Movil.html',
  '/src/modules/visitas/Visitas_y_Bitacora_Escritorio.html',

  // JS del módulo 5
  '/src/modules/visitas/registrar-visita.js',
  '/src/modules/visitas/pendientes-sincronizacion.js',
  '/src/modules/visitas/visitas-bitacora.js',

  // Estilos
  '/src/styles/main.css',
  '/src/styles/tecnicoapp.css',
  '/src/styles/visitas_movil.css',

  // Identidad
  '/logo-ruta.png',
  '/avatar.png',

  // Inicio técnico
  '/portapapeles.png',
  '/ubicacion.png',
  '/caja.png',
  '/advertencia.png',
  '/reloj.png',

  // Visitas
  '/hoja-de-calculo.png',
  '/estadistico.png',
  '/nota-adhesiva.png',
  '/cuenta-de-usuario.png',
  '/herramienta-blanca.png',

  // Sincronización
  '/sincronizar.png',
  '/sincronizar-blanco.png'

];



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
          (
            nombre.startsWith('ruta-visitas-') ||
            nombre.startsWith('ruta-app-')
          ) &&
          nombre !== CACHE_NAME
        )
        .map(nombre => caches.delete(nombre))
    );

    await self.clients.claim();

  })());

});

// ============================================
// PETICIONES
// ============================================

self.addEventListener(
  'fetch',
  (event) => {

    if (
      event.request.method !== 'GET'
    ) {
      return;
    }


    const url =
      new URL(
        event.request.url
      );


    // Solo recursos propios de RUTA.
    // Supabase continúa siendo responsabilidad
    // de la red.
    if (
      url.origin !==
      self.location.origin
    ) {
      return;
    }


    event.respondWith(
      (async () => {

        const cache =
          await caches.open(
            CACHE_NAME
          );


        // ------------------------------------
        // NAVEGACIÓN
        // ------------------------------------

        if (
          event.request.mode ===
          'navigate'
        ) {

          try {

            const respuesta =
              await fetch(
                event.request
              );


            if (respuesta.ok) {

              await cache.put(
                event.request,
                respuesta.clone()
              );

            }


            return respuesta;

          } catch (error) {

            const guardada =
              await cache.match(
                event.request
              );


            if (guardada) {
              return guardada;
            }


            const inicio =
              await cache.match(
                '/index.html'
              );


            return (
              inicio ||
              Response.error()
            );

          }

        }


        // ------------------------------------
        // RECURSOS ESTÁTICOS / MÓDULOS
        // ------------------------------------

        try {

          const respuesta =
            await fetch(
              event.request
            );


          if (respuesta.ok) {

            await cache.put(
              event.request,
              respuesta.clone()
            );

          }


          return respuesta;

        } catch (error) {

          const guardada =
            await cache.match(
              event.request
            );


          return (
            guardada ||
            Response.error()
          );

        }

      })()
    );

  }
);