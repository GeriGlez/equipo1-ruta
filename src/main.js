import './styles/main.css'

const app = document.querySelector('#app')

// Vista inicial para validar que la base de Vite funciona
app.innerHTML = `
  <header class="header">
    <div class="brand">
      🧭 <span>RUTA</span>
    </div>
    <span class="badge badge-info">PWA Integrador</span>
  </header>

  <main class="container">
    <div class="card" style="margin-top: 1rem;">
      <h2>🚀 Entorno Base Configurado con Éxito</h2>
      <p style="color: var(--color-text-muted); margin: 0.5rem 0 1.25rem 0;">
        Vite + Vanilla JS + Supabase Client listos para el Equipo #1. Cada integrante puede desarrollar su módulo en su respectiva carpeta dentro de <code>src/modules/</code>.
      </p>
      
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
        <button id="btn-login" class="btn btn-primary">Ir a Login (Alexei - HU-14)</button>
        <span id="env-status" class="badge badge-warning" style="align-self: center;">Verificando .env...</span>
      </div>
    </div>

    <h3 style="margin-top: 2rem; margin-bottom: 0.5rem;">Módulos del Sistema (7 Áreas)</h3>
    <div class="grid-modules">
      <div class="module-card">
        <div class="module-owner">Alexei</div>
        <div class="module-title">1. Autenticación y Roles</div>
        <div class="module-desc">HU-14: Inicio de sesión, roles (Admin/Técnico) y redirección de vistas.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Alexei</div>
        <div class="module-title">2. Cuadrillas</div>
        <div class="module-desc">HU-04: Armado de cuadrillas con técnicos disponibles.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">André Sánchez</div>
        <div class="module-title">3. Condominios y Áreas</div>
        <div class="module-desc">HU-01, HU-02: Registro de condominios, áreas y notas de acceso.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Jose (Pechu)</div>
        <div class="module-title">4. Servicios Contratados</div>
        <div class="module-desc">HU-03: Catálogo de servicios y asignación a condominios.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Fernando Carrera</div>
        <div class="module-title">5. Órdenes de Servicio</div>
        <div class="module-desc">HU-05, HU-06, HU-07: Programación semanal y cancelación de órdenes.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Brayan Ascencio</div>
        <div class="module-title">6. Visitas y Bitácora</div>
        <div class="module-desc">HU-08, HU-09, HU-10: Modo offline, sincronización y captura de pH/cloro.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Rooney</div>
        <div class="module-title">7. Insumos y Consumo</div>
        <div class="module-desc">HU-11: Catálogo y registro de consumo de productos por visita.</div>
      </div>

      <div class="module-card">
        <div class="module-owner">Geraldine</div>
        <div class="module-title">8. Incidencias</div>
        <div class="module-desc">HU-12, HU-13: Levantamiento de incidencias en campo y resolución.</div>
      </div>
    </div>
  </main>
`

// Comprobar variables de entorno
const envBadge = document.querySelector('#env-status')
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
  envBadge.className = 'badge badge-success'
  envBadge.textContent = '✅ Supabase Conectado (.env detectado)'
} else {
  envBadge.className = 'badge badge-warning'
  envBadge.textContent = '⚠️ Falta crear archivo .env'
}

document.querySelector('#btn-login').addEventListener('click', () => {
  alert('Pronto: Vista de Login (HU-14) en desarrollo por Alexei.')
})
