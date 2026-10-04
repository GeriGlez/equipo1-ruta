import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    VitePWA({
      strategies: 'generateSW',

      // Registraremos el SW manualmente
      injectRegister: false,

      // Mantener el alcance del módulo 5
      scope: '/src/modules/visitas/',

      // Evitar generar otro manifiesto
      // mientras revisamos el existente
      manifest: false,

      // Conservar nuestro SW actual en desarrollo
      devOptions: {
        enabled: false
      },

      workbox: {
        // Archivos necesarios para trabajar offline
        globPatterns: [
          '**/*.{html,js,css,png,svg,webp,ico,json}'
        ],

        // No redirigir ambas páginas a index.html
        navigateFallback: null,

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
        )
      }
    }
  }
});