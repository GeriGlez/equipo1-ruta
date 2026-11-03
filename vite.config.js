import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: 'generateSW',

      // Registraremos el SW manualmente
      injectRegister: false,

      // Toda la PWA RUTA
      scope: '/',

      // Evitar generar otro manifiesto
      // mientras revisamos el existente
      manifest: false,

      // Conservar nuestro SW actual en desarrollo
      devOptions: {
        enabled: false
      },

      workbox: {
        globPatterns: [
          '**/*.{html,js,css,png,svg,webp,ico,json}'
        ],

        navigateFallback: null,

        ignoreURLParametersMatching: [
          /^utm_/,
          /^fbclid$/,
          /^orden_id$/
        ],

        cleanupOutdatedCaches: true
      }
    })
  ],

  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),

        registrarVisita: resolve(
          process.cwd(),
          'src/modules/visitas/Registrar_Visita_Movil.html'
        ),

        pendientesVisitas: resolve(
          process.cwd(),
          'src/modules/visitas/Pendientes_Sincronizacion_Movil.html'
        ),

        bitacoraVisitas: resolve(
          process.cwd(),
          'src/modules/visitas/Visitas_y_Bitacora_Movil.html'
        ),

        bitacoraVisitasEscritorio: resolve(
          process.cwd(),
          'src/modules/visitas/Visitas_y_Bitacora_Escritorio.html'
        ),

                condominios: resolve(
          process.cwd(),
          'src/modules/condominios/condominios.html'
        ),

        registrarCondominio: resolve(
          process.cwd(),
          'src/modules/condominios/registrar-condominio.html'
        ),

        cuadrillas: resolve(
          process.cwd(),
          'src/modules/cuadrillas/cuadrillas.html'
        ),
      }
    }
  }
});