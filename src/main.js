import './styles/main.css'
import { getActiveSession, logout } from './modules/auth/authService.js'
import { renderLogin } from './modules/auth/loginView.js'

const app = document.querySelector('#app')

// vista simple de conexion exitosa con indicador de red
function renderSuccessView(sessionInfo) {
  const nombre = sessionInfo.profile?.nombre || sessionInfo.user.email
  const rol = sessionInfo.profile?.rol || ''
  let offline = sessionInfo.isOffline || !navigator.onLine

  app.innerHTML = `
    <div style="min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: 'Montserrat', sans-serif; background-color: #ffffff; color: #0d1b2a; padding: 20px;">
      
      <!-- estado de conexion en vivo -->
      <div id="conn-pill" style="margin-bottom: 20px; font-size: 13px; font-weight: 600; padding: 6px 14px; border-radius: 20px; display: inline-flex; align-items: center; gap: 8px; background: ${offline ? '#fef3c7' : '#dcfce7'}; color: ${offline ? '#92400e' : '#166534'};">
        <span id="conn-dot" style="width: 8px; height: 8px; border-radius: 50%; background: ${offline ? '#f59e0b' : '#10b981'};"></span>
        <span id="conn-text">${offline ? 'Modo local (Sin internet)' : 'En línea (Conectado a Supabase)'}</span>
      </div>

      <h1 style="font-size: 32px; font-weight: 700; margin-bottom: 10px; text-align: center;">
        Conexión exitosa
      </h1>
      <p style="font-size: 18px; color: #4a5568; margin-bottom: 24px; text-align: center;">
        Perfil: <strong>${nombre}</strong> ${rol ? `(${rol})` : ''}
      </p>
      
      <button id="btn-logout" style="padding: 10px 22px; font-size: 14px; font-weight: 600; color: #ffffff; background-color: #1877f2; border: none; border-radius: 10px; cursor: pointer;">
        Cerrar sesión
      </button>
    </div>
  `

  const connPill = app.querySelector('#conn-pill')
  const connDot = app.querySelector('#conn-dot')
  const connText = app.querySelector('#conn-text')

  // si regresa el internet, actualizamos a online sin molestar al usuario
  window.addEventListener('online', () => {
    connPill.style.background = '#dcfce7'
    connPill.style.color = '#166534'
    connDot.style.background = '#10b981'
    connText.textContent = 'En línea (Conectado a Supabase)'
  })

  // si se va la red, avisamos que esta en modo local
  window.addEventListener('offline', () => {
    connPill.style.background = '#fef3c7'
    connPill.style.color = '#92400e'
    connDot.style.background = '#f59e0b'
    connText.textContent = 'Modo local (Sin internet)'
  })

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

  // muestra la pagina con conexion exitosa y el perfil
  renderSuccessView(session)
}

// registrar service worker para que la pwa cargue en modo avion
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('service worker no registrado:', err)
    })
  })
}

// iniciar
showApp()
