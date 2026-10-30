
import { getActiveSession, logout } from './modules/auth/authService.js'
import { renderLogin } from './modules/auth/loginView.js'
import {   renderAdminApp } from './adminapp.js'
import {  renderTecnicoApp} from './tecnicoapp.js'

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

  return
}

  
  throw new Error(
    'El usuario autenticado no tiene un rol válido en RUTA.'
  )
}

// iniciar
showApp()


