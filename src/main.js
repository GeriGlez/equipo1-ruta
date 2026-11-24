
import { getActiveSession, logout } from './modules/auth/authService.js'
import { renderLogin } from './modules/auth/loginView.js'
import {   renderAdminApp } from './adminapp.js'
import {  renderTecnicoApp} from './tecnicoapp.js'

import {
  precargarBitacoraTecnico
} from './services/precarga-bitacora.js';

const app = document.querySelector('#app')

// ============================================
// SERVICE WORKER GLOBAL DE RUTA
// ============================================

if ('serviceWorker' in navigator) {

  window.addEventListener(
    'load',
    async () => {

      const archivoSW =
        import.meta.env.PROD
          ? '/sw.js'
          : '/sw-visitas.js'


      try {

        const registro =
          await navigator
            .serviceWorker
            .register(
              archivoSW,
              {
                scope: '/'
              }
            )


        console.log(
          '[RUTA] Service Worker global registrado:',
          archivoSW,
          registro.scope
        )

      } catch (error) {

        console.error(
          '[RUTA] Error al registrar Service Worker global:',
          error
        )

      }

    }
  )

}


// decide que vista mostrar segun la sesion
async function showApp() {
  const session = await getActiveSession()

  if (!session) {
    // si no hay sesion muestra el login
    renderLogin(app, () => {
      showApp()
    })
    return
  }

  const { usuario } = session



if (usuario?.rol === 'administrador') {

  renderAdminApp(
    app,
    usuario,
    async () => {
      await logout()
      showApp()
    }
  )

  return
}


if (
  usuario?.rol === 'tecnico'
) {

  renderTecnicoApp(
    app,
    usuario,
    async () => {

      await logout()

      showApp()

    }
  )

  if (navigator.onLine && !session.isOffline) {
    precargarBitacoraTecnico(session).catch(error => {
      console.warn(
        '[RUTA] No se pudo completar la precarga offline:',
        error
      );
    });
  }

  return
}

  
  throw new Error(
    'El usuario autenticado no tiene un rol válido en RUTA.'
  )
}

// iniciar
showApp()

window.addEventListener('online', async () => {
  try {
    const sesion = await getActiveSession();

    if (
      sesion?.usuario?.rol === 'tecnico' &&
      !sesion.isOffline
    ) {
      await precargarBitacoraTecnico(sesion);
    }
  } catch (error) {
    console.warn(
      '[RUTA] No fue posible actualizar los datos al reconectar:',
      error
    );
  }
});

