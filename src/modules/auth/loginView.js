import { login } from './authService.js'

// vista del login con el diseño de figma
export function renderLogin(container, onLoginSuccess) {
  container.innerHTML = `
    <style>
      .login-body {
        background-color: #004D73;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        font-family: 'Montserrat', sans-serif;
      }

      .app-container {
        width: 100%;
        max-width: 420px;
        background-color: #004D73;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .header-login {
        padding: 40px 20px 30px;
        text-align: center;
        color: #ffffff;
      }

      .logo-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }

      .logo-icon {
        width: 60px;
        height: 60px;
        background: radial-gradient(circle at 70% 30%, #FF9900 20%, transparent 21%),
                    linear-gradient(135deg, #00A3E0, #003B5C);
        border-radius: 50%;
        position: relative;
        overflow: hidden;
      }

      .logo-icon::after {
        content: '';
        position: absolute;
        bottom: -5px;
        left: 10px;
        width: 40px;
        height: 40px;
        border: 4px solid #ffffff;
        border-radius: 50%;
        border-top-color: transparent;
        border-right-color: transparent;
        transform: rotate(-35deg);
      }

      .logo-title {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: 1px;
        color: #ffffff;
        margin-top: 4px;
      }

      .logo-subtitle {
        font-size: 13px;
        font-weight: 500;
        color: #e0f2fe;
        opacity: 0.9;
      }

      .login-card {
        background-color: #ffffff;
        border-top-left-radius: 32px;
        border-top-right-radius: 32px;
        flex: 1;
        padding: 40px 28px;
        box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
      }

      .card-title {
        font-size: 24px;
        font-weight: 700;
        color: #0d1b2a;
        margin-bottom: 24px;
      }

      .form-group {
        margin-bottom: 20px;
        display: flex;
        flex-direction: column;
      }

      .form-label {
        font-size: 14px;
        font-weight: 600;
        color: #4a5568;
        margin-bottom: 8px;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;
      }

      .form-input {
        width: 100%;
        padding: 14px 16px;
        font-size: 14px;
        color: #2d3748;
        background-color: #ffffff;
        border: 1.5px solid #d0e1fd;
        border-radius: 10px;
        outline: none;
        transition: border-color 0.2s ease;
      }

      .form-input::placeholder {
        color: #a0aec0;
      }

      .form-input:focus {
        border-color: #1a73e8;
      }

      .toggle-password {
        position: absolute;
        right: 14px;
        background: none;
        border: none;
        cursor: pointer;
        color: #a0aec0;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .toggle-password svg {
        width: 20px;
        height: 20px;
        stroke: currentColor;
      }

      .btn-submit {
        width: 100%;
        padding: 14px;
        margin-top: 10px;
        background-color: #1877f2;
        color: #ffffff;
        font-size: 15px;
        font-weight: 600;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        transition: background-color 0.2s ease;
      }

      .btn-submit:hover {
        background-color: #166fe5;
      }

      .btn-submit:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .error-alert {
        display: none;
        background-color: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        padding: 12px;
        border-radius: 10px;
        font-size: 13px;
        margin-bottom: 16px;
      }

      @media (min-width: 768px) {
        .login-body {
          background-color: #e2e8f0;
          align-items: center;
        }

        .app-container {
          border-radius: 24px;
          min-height: auto;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
          overflow: hidden;
          margin: 40px 0;
        }

        .login-card {
          border-radius: 32px 32px 0 0;
        }
      }
    </style>

    <div class="login-body">
      <main class="app-container">
        <header class="header-login">
          <div class="logo-container">
            <div class="logo-icon"></div>
            <h1 class="logo-title">RUTA</h1>
            <p class="logo-subtitle">Gestión de servicios en campo</p>
          </div>
        </header>

        <section class="login-card">
          <h2 class="card-title">Ingresar a tu cuenta</h2>

          <div id="error-alert" class="error-alert"></div>

          <form id="form-login">
            <div class="form-group">
              <label class="form-label" for="email">Email</label>
              <div class="input-wrapper">
                <input 
                  type="email" 
                  id="email" 
                  class="form-input" 
                  placeholder="Ej. usuario@dominio.com"
                  required 
                />
              </div>
            </div>

            <div class="form-group">
              <label class="form-label" for="password">Password</label>
              <div class="input-wrapper">
                <input 
                  type="password" 
                  id="password" 
                  class="form-input" 
                  placeholder="Enter your password" 
                  required 
                />
                <button type="button" class="toggle-password" aria-label="Mostrar contraseña">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            <button type="submit" class="btn-submit">Login now</button>
          </form>
        </section>
      </main>
    </div>
  `

  const form = container.querySelector('#form-login')
  const emailInput = container.querySelector('#email')
  const passwordInput = container.querySelector('#password')
  const toggleBtn = container.querySelector('.toggle-password')
  const submitBtn = container.querySelector('.btn-submit')
  const errorBox = container.querySelector('#error-alert')

  // boton para mostrar u ocultar la clave
  toggleBtn.addEventListener('click', () => {
    if (passwordInput.type === 'password') {
      passwordInput.type = 'text'
    } else {
      passwordInput.type = 'password'
    }
  })

  // enviar formulario
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorBox.style.display = 'none'
    submitBtn.disabled = true
    submitBtn.textContent = 'Iniciando sesión...'

    try {
      const email = emailInput.value.trim()
      const password = passwordInput.value

      const res = await login(email, password)
      
      if (onLoginSuccess) {
        onLoginSuccess(res)
      }
    } catch (err) {
      errorBox.style.display = 'block'
      if (err.message.includes('Invalid login credentials')) {
        errorBox.textContent = 'Correo o contraseña incorrectos. Revisa tus datos.'
      } else {
        errorBox.textContent = err.message
      }
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Login now'
    }
  })
}
