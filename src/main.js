import './styles/main.css'
import { getActiveSession, logout } from './modules/auth/authService.js'
import { renderLogin } from './modules/auth/loginView.js'

const app = document.querySelector('#app')

// vista simple de conexion exitosa
function renderSuccessView(sessionInfo) {
  const nombre = sessionInfo.profile?.nombre || sessionInfo.user.email
  const rol = sessionInfo.profile?.rol || ''

  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Montserrat', sans-serif; background-color: #ffffff; color: #0d1b2a;">
      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 10px;">
        Conexión exitosa
      </h1>
      <p style="font-size: 18px; color: #4a5568; margin-bottom: 24px;">
        Perfil: <strong>${nombre}</strong> ${rol ? `(${rol})` : ''}
      </p>
      <button id="btn-logout" style="padding: 10px 22px; font-size: 14px; font-weight: 600; color: #ffffff; background-color: #1877f2; border: none; border-radius: 10px; cursor: pointer;">
        Cerrar sesión
      </button>
    </div>
  `

  app.querySelector('#btn-logout').addEventListener('click', async () => {
    await logout()
    showApp()
  })
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

  // muestra la pagina en blanco con conexion exitosa y el perfil
  renderSuccessView(session)
}

// iniciar
showApp()
