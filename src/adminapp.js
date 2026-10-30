
import './styles/adminapp.css'

const modulosAdministrador = [
  {
    titulo: 'Condominios y Áreas',
    descripcion: 'Administra los condominios, áreas y notas de acceso',
    estilo: 'condominios',
    ruta: './src/modules/condominios/condominios.html'
  },
  {
    titulo: 'Servicios Contratados',
    descripcion: 'Define servicios, frecuencia y día preferente',
    estilo: 'servicios'
  },
  {
    titulo: 'Personal y Cuadrillas',
    descripcion: 'Gestión de usuarios, técnicos y cuadrillas',
    estilo: 'personal',
    ruta: './src/modules/cuadrillas/cuadrillas.html'
  },
  {
    titulo: 'Órdenes de Servicio',
    descripcion: 'Programa, asigna y cancela órdenes',
    estilo: 'ordenes'
  },
  {
    titulo: 'Bitácora de Visitas',
    descripcion: 'Registro de visitas en campo',
    estilo: 'visitas',
    ruta: './src/modules/visitas/Visitas_y_Bitacora_Escritorio.html'
  },
  {
    titulo: 'Insumos y Consumo',
    descripcion: 'Administra insumos y consulta su consumo',
    estilo: 'insumos'
  },
  {
    titulo: 'Incidencias',
    descripcion: 'Revisa y resuelve incidencias reportadas',
    estilo: 'incidencias'
  },
  {
    titulo: 'Reportes',
    descripcion: 'Consulta los reportes del sistema',
    estilo: 'reportes'
  }
]

export function renderAdminApp(app, usuario, onLogout) {
  const tarjetas = modulosAdministrador.map((modulo) => {
    const contenido = `
      <span class="admin-module-icon" aria-hidden="true">
        <img src="/caja.png" alt="">
      </span>
      <span class="admin-module-arrow" aria-hidden="true">›</span>
      <strong class="admin-module-title">${modulo.titulo}</strong>
      <span class="admin-module-description">${modulo.descripcion}</span>
    `

    const clases = `admin-module admin-module--${modulo.estilo}`

    return modulo.ruta
      ? `<a class="${clases} admin-module--link" href="${modulo.ruta}">${contenido}</a>`
      : `<div class="${clases}" aria-label="${modulo.titulo}: módulo aún no integrado">${contenido}</div>`
  }).join('')

  app.innerHTML = `
    <div class="admin-app">
      <header class="admin-header">
        <div class="admin-brand">
          <div class="admin-brand-main">
            <img src="/logo-ruta.png" class="admin-logo" alt="">
            <span class="admin-brand-name">RUTA</span>
          </div>
          <span class="admin-brand-subtitle">Gestión de servicios en campo</span>
        </div>

        <button
          id="btn-logout"
          class="admin-user"
          type="button"
          title="Cerrar sesión"
          aria-label="Cerrar sesión de administrador"
        >
          <img src="/avatar.png" class="admin-avatar" alt="">
          <strong id="admin-user-name">Usuario</strong>
          <span>Administrador</span>
        </button>
      </header>

      <main class="admin-main">
        <h1 class="admin-welcome">Hola <span id="admin-welcome-name">Administrador</span></h1>
        <p class="admin-instruction">Selecciona un módulo</p>

        <nav class="admin-modules" aria-label="Módulos del administrador">
          ${tarjetas}
        </nav>
      </main>
    </div>
  `

  // ============================================
  // DATOS DEL ADMINISTRADOR
  // ============================================

  const nombre =
    usuario?.nombre?.trim() || 'Administrador'

  app.querySelector('#admin-user-name').textContent =
    nombre

  app.querySelector('#admin-welcome-name').textContent =
    nombre

  app.querySelector('#btn-logout')?.addEventListener('click', async () => {
    if (!window.confirm('¿Deseas cerrar sesión?')) return

    try {
      await onLogout?.()
    } catch (error) {
      console.error('[RUTA] No se pudo cerrar sesión:', error)
      window.alert('No fue posible cerrar sesión. Inténtalo nuevamente.')
    }
  })
}
