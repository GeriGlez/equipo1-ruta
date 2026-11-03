import { getActiveSession } from '../auth/authService.js'
import {
  listarCuadrillas,
  obtenerCuadrilla,
  crearCuadrilla,
  actualizarCuadrilla,
  eliminarCuadrilla,
  listarPersonal,
  crearEmpleado
} from './cuadrillasService.js'

// ============================================
// ELEMENTOS DEL DOM
// ============================================

// Header & Tabs
const headerUserName = document.getElementById('header-user-name')
const tabBtnCuadrillas = document.getElementById('tab-btn-cuadrillas')
const tabBtnPersonal = document.getElementById('tab-btn-personal')
const secCuadrillas = document.getElementById('sec-cuadrillas')
const secPersonal = document.getElementById('sec-personal')

// Cuadrillas DOM
const gridCuadrillas = document.getElementById('grid-cuadrillas')
const buscarCuadrilla = document.getElementById('buscar-cuadrilla')
const btnAbrirNuevaCuadrilla = document.getElementById('btn-abrir-nueva-cuadrilla')

// Modal Cuadrilla DOM
const modalCuadrilla = document.getElementById('modal-cuadrilla')
const modalCuadrillaTitle = document.getElementById('modal-cuadrilla-title')
const alertCuadrilla = document.getElementById('alert-cuadrilla')
const formCuadrilla = document.getElementById('form-cuadrilla')
const inputCuadrillaId = document.getElementById('cuadrilla-id')
const inputCuadrillaNombre = document.getElementById('cuadrilla-nombre')
const selectResponsable = document.getElementById('cuadrilla-responsable')
const listaMiembrosCheckboxes = document.getElementById('lista-miembros-checkboxes')
const btnCerrarModalCuadrilla = document.getElementById('btn-cerrar-modal-cuadrilla')
const btnGuardarCuadrilla = document.getElementById('btn-guardar-cuadrilla')
const btnEliminarCuadrilla = document.getElementById('btn-eliminar-cuadrilla')

// Personal DOM
const tablaPersonalBody = document.getElementById('tabla-personal-body')
const buscarPersonal = document.getElementById('buscar-personal')
const btnAbrirNuevoEmpleado = document.getElementById('btn-abrir-nuevo-empleado')

// Modal Empleado DOM
const modalEmpleado = document.getElementById('modal-empleado')
const alertEmpleado = document.getElementById('alert-empleado')
const formEmpleado = document.getElementById('form-empleado')
const inputEmpleadoNombre = document.getElementById('empleado-nombre')
const inputEmpleadoCorreo = document.getElementById('empleado-correo')
const inputEmpleadoTelefono = document.getElementById('empleado-telefono')
const selectEmpleadoRol = document.getElementById('empleado-rol')
const btnCerrarModalEmpleado = document.getElementById('btn-cerrar-modal-empleado')
const btnGuardarEmpleado = document.getElementById('btn-guardar-empleado')

// Estado en memoria
let cacheCuadrillas = []
let cachePersonal = []

// ============================================
// INICIALIZACIÓN Y SEGURIDAD
// ============================================

async function inicializar() {
  try {
    const sesion = await getActiveSession()
    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      console.warn('[Cuadrillas] Acceso denegado: se requiere rol de administrador.')
      window.location.href = '/'
      return
    }

    if (headerUserName) {
      headerUserName.textContent = sesion.usuario.nombre || 'Administrador'
    }

    // Cargar datos iniciales
    await Promise.all([cargarCuadrillas(), cargarPersonal()])
  } catch (error) {
    console.error('[Cuadrillas] Error en inicialización:', error)
  }
}

// ============================================
// NAVEGACIÓN POR PESTAÑAS
// ============================================

tabBtnCuadrillas.addEventListener('click', () => {
  tabBtnCuadrillas.classList.add('active')
  tabBtnPersonal.classList.remove('active')
  secCuadrillas.style.display = 'block'
  secPersonal.style.display = 'none'
  cargarCuadrillas()
})

tabBtnPersonal.addEventListener('click', () => {
  tabBtnPersonal.classList.add('active')
  tabBtnCuadrillas.classList.remove('active')
  secPersonal.style.display = 'block'
  secCuadrillas.style.display = 'none'
  cargarPersonal()
})

// ============================================
// RENDERIZADO DE CUADRILLAS (FIGMA)
// ============================================

async function cargarCuadrillas() {
  try {
    const query = buscarCuadrilla.value.trim()
    cacheCuadrillas = await listarCuadrillas(query)
    renderCuadrillasCards(cacheCuadrillas)
  } catch (error) {
    console.error('[Cuadrillas] Error al listar:', error)
    gridCuadrillas.innerHTML = `<div class="empty-state" style="color:#ef4444;">Error al cargar cuadrillas: ${error.message}</div>`
  }
}

function renderCuadrillasCards(cuadrillas) {
  if (!cuadrillas.length) {
    gridCuadrillas.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        No hay cuadrillas registradas aún. Haz clic en <strong>+ Nueva cuadrilla</strong> para crear una.
      </div>
    `
    return
  }

  gridCuadrillas.innerHTML = cuadrillas.map(c => {
    const respNombre = c.responsable?.nombre || 'Sin responsable'
    const miembros = c.miembros || []
    const totalMiembros = miembros.length

    // Avatares circulares superpuestos (primeros 4)
    const primeros = miembros.slice(0, 4)
    const restantes = totalMiembros - primeros.length

    const avataresHtml = primeros.map(m => {
      const inicial = (m.usuario?.nombre || 'T')[0].toUpperCase()
      return `<div class="avatar-member" title="${m.usuario?.nombre || 'Técnico'}">${inicial}</div>`
    }).join('')

    const masHtml = restantes > 0 ? `<div class="avatar-member avatar-more">+${restantes}</div>` : ''

    return `
      <article class="cuadrilla-card" data-id="${c.id}">
        <div class="cuadrilla-header">
          <h2 class="cuadrilla-title">${escaparHtml(c.nombre)}</h2>
        </div>

        <div class="responsable-box">
          <div class="responsable-info">
            <div class="responsable-icon">👤</div>
            <div class="responsable-text">
              <span class="responsable-label">Responsable</span>
              <span class="responsable-nombre">${escaparHtml(respNombre)}</span>
            </div>
          </div>
          <span class="chevron-icon">›</span>
        </div>

        <div class="members-row">
          <div class="avatars-stack">
            ${avataresHtml}
            ${masHtml}
          </div>
          <span class="assigned-count">${totalMiembros} ${totalMiembros === 1 ? 'técnico asignado' : 'técnicos asignados'}</span>
        </div>

        <div class="card-footer-actions">
          <span style="font-size:0.75rem; color:#94a3b8;">${c.responsable?.telefono || ''}</span>
          <button type="button" class="btn-editar-link" data-id="${c.id}">
            Editar cuadrilla
          </button>
        </div>
      </article>
    `
  }).join('')
}

buscarCuadrilla.addEventListener('input', () => {
  cargarCuadrillas()
})

// ============================================
// MODAL ARMAR / EDITAR CUADRILLA
// ============================================

btnAbrirNuevaCuadrilla.addEventListener('click', async () => {
  abrirModalCuadrilla()
})

gridCuadrillas.addEventListener('click', async (e) => {
  const btnEditar = e.target.closest('.btn-editar-link')
  if (btnEditar) {
    const id = btnEditar.dataset.id
    abrirModalCuadrilla(id)
  }
})

async function abrirModalCuadrilla(idEditar = null) {
  formCuadrilla.reset()
  alertCuadrilla.style.display = 'none'
  inputCuadrillaId.value = idEditar || ''

  btnGuardarCuadrilla.disabled = true
  btnGuardarCuadrilla.textContent = 'Cargando...'

  modalCuadrillaTitle.textContent = idEditar ? 'Editar Cuadrilla' : 'Armar Nueva Cuadrilla'
  btnEliminarCuadrilla.style.display = idEditar ? 'inline-block' : 'none'

  modalCuadrilla.classList.add('active')

  try {
    // 1. Obtener técnicos activos para el selector de responsable y miembros
    const personal = await listarPersonal()
    const tecnicos = personal.filter(p => p.rol === 'tecnico' && p.activo)

    // Llenar select de responsable
    selectResponsable.innerHTML = `
      <option value="">Selecciona un técnico responsable...</option>
      ${tecnicos.map(t => `<option value="${t.id}">${escaparHtml(t.nombre)} (${t.correo})</option>`).join('')}
    `

    let miembrosActualesIds = []

    // 2. Si es edición, cargar datos actuales
    if (idEditar) {
      const cuadrilla = await obtenerCuadrilla(idEditar)
      inputCuadrillaNombre.value = cuadrilla.nombre || ''
      selectResponsable.value = cuadrilla.responsable_id || ''
      miembrosActualesIds = (cuadrilla.miembros || []).map(m => m.usuario_id)
    }

    // 3. Llenar checkboxes de miembros
    if (!tecnicos.length) {
      listaMiembrosCheckboxes.innerHTML = `
        <span style="font-size:0.85rem; color:#94a3b8; padding:0.5rem; display:block;">
          No hay técnicos dados de alta. Ve a la pestaña "Personal" para registrar técnicos primero.
        </span>
      `
    } else {
      listaMiembrosCheckboxes.innerHTML = tecnicos.map(t => {
        const checked = miembrosActualesIds.includes(t.id) ? 'checked' : ''
        return `
          <label class="tech-checkbox-item">
            <input type="checkbox" name="miembros" value="${t.id}" ${checked}>
            <div>
              <strong style="font-size:0.9rem; color:#1e293b;">${escaparHtml(t.nombre)}</strong>
              <div style="font-size:0.75rem; color:#64748b;">${escaparHtml(t.correo)} ${t.telefono ? `· ${t.telefono}` : ''}</div>
            </div>
          </label>
        `
      }).join('')
    }
  } catch (err) {
    alertCuadrilla.textContent = `Error: ${err.message}`
    alertCuadrilla.style.display = 'block'
  } finally {
    btnGuardarCuadrilla.disabled = false
    btnGuardarCuadrilla.textContent = idEditar ? 'Guardar Cambios' : 'Guardar Cuadrilla'
  }
}

btnCerrarModalCuadrilla.addEventListener('click', () => {
  modalCuadrilla.classList.remove('active')
})

formCuadrilla.addEventListener('submit', async (e) => {
  e.preventDefault()
  alertCuadrilla.style.display = 'none'

  const id = inputCuadrillaId.value
  const nombre = inputCuadrillaNombre.value.trim()
  const responsable_id = selectResponsable.value

  // Obtener miembros seleccionados
  const checkboxes = formCuadrilla.querySelectorAll('input[name="miembros"]:checked')
  const miembrosIds = Array.from(checkboxes).map(cb => cb.value)

  btnGuardarCuadrilla.disabled = true
  btnGuardarCuadrilla.textContent = 'Guardando...'

  try {
    if (id) {
      await actualizarCuadrilla(id, { nombre, responsable_id, miembrosIds })
    } else {
      await crearCuadrilla({ nombre, responsable_id, miembrosIds })
    }

    modalCuadrilla.classList.remove('active')
    await cargarCuadrillas()
  } catch (error) {
    alertCuadrilla.textContent = error.message
    alertCuadrilla.style.display = 'block'
  } finally {
    btnGuardarCuadrilla.disabled = false
    btnGuardarCuadrilla.textContent = id ? 'Guardar Cambios' : 'Guardar Cuadrilla'
  }
})

btnEliminarCuadrilla.addEventListener('click', async () => {
  const id = inputCuadrillaId.value
  if (!id) return

  const seguro = confirm('¿Estás seguro de eliminar esta cuadrilla? No se eliminarán los técnicos, solo su asignación a este equipo.')
  if (!seguro) return

  btnEliminarCuadrilla.disabled = true
  try {
    await eliminarCuadrilla(id)
    modalCuadrilla.classList.remove('active')
    await cargarCuadrillas()
  } catch (error) {
    alertCuadrilla.textContent = `Error al eliminar: ${error.message}`
    alertCuadrilla.style.display = 'block'
  } finally {
    btnEliminarCuadrilla.disabled = false
  }
})

// ============================================
// RENDERIZADO DE PERSONAL (TABLA)
// ============================================

async function cargarPersonal() {
  try {
    const query = buscarPersonal.value.trim()
    cachePersonal = await listarPersonal(query)
    renderPersonalTabla(cachePersonal)
  } catch (error) {
    console.error('[Personal] Error al listar:', error)
    tablaPersonalBody.innerHTML = `<tr><td colspan="4" class="empty-state" style="color:#ef4444;">Error al cargar personal: ${error.message}</td></tr>`
  }
}

function renderPersonalTabla(personal) {
  if (!personal.length) {
    tablaPersonalBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-state">
          No hay empleados registrados. Haz clic en <strong>+ Agregar Empleado</strong>.
        </td>
      </tr>
    `
    return
  }

  tablaPersonalBody.innerHTML = personal.map(p => {
    const rolBadge = p.rol === 'administrador'
      ? '<span class="badge-tag badge-rol-admin">Administrador</span>'
      : '<span class="badge-tag" style="background:#dcfce7; color:#166534;">Técnico</span>'

    // Cuadrillas a las que pertenece
    const cuadrillas = (p.cuadrillas || [])
      .map(c => c.cuadrilla?.nombre)
      .filter(Boolean)

    const cuadrillasHtml = cuadrillas.length
      ? cuadrillas.map(nom => `<span class="badge-tag">${escaparHtml(nom)}</span>`).join('')
      : '<span style="font-size:0.8rem; color:#94a3b8;">Sin cuadrilla</span>'

    return `
      <tr>
        <td>
          <div style="font-weight:600; color:#0f172a;">${escaparHtml(p.nombre)}</div>
        </td>
        <td>
          <div style="font-size:0.85rem; color:#334155;">${escaparHtml(p.correo)}</div>
          <div style="font-size:0.8rem; color:#64748b;">${escaparHtml(p.telefono || '—')}</div>
        </td>
        <td>${rolBadge}</td>
        <td>${cuadrillasHtml}</td>
      </tr>
    `
  }).join('')
}

buscarPersonal.addEventListener('input', () => {
  cargarPersonal()
})

// ============================================
// MODAL AGREGAR EMPLEADO (FIGMA)
// ============================================

btnAbrirNuevoEmpleado.addEventListener('click', () => {
  formEmpleado.reset()
  alertEmpleado.style.display = 'none'
  modalEmpleado.classList.add('active')
})

btnCerrarModalEmpleado.addEventListener('click', () => {
  modalEmpleado.classList.remove('active')
})

formEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault()
  alertEmpleado.style.display = 'none'

  const nombre = inputEmpleadoNombre.value.trim()
  const correo = inputEmpleadoCorreo.value.trim()
  const telefono = inputEmpleadoTelefono.value.trim()
  const rol = selectEmpleadoRol.value

  btnGuardarEmpleado.disabled = true
  btnGuardarEmpleado.textContent = 'Guardando...'

  try {
    await crearEmpleado({ nombre, correo, telefono, rol })
    modalEmpleado.classList.remove('active')
    await cargarPersonal()
  } catch (error) {
    alertEmpleado.textContent = error.message
    alertEmpleado.style.display = 'block'
  } finally {
    btnGuardarEmpleado.disabled = false
    btnGuardarEmpleado.textContent = 'Guardar Registro'
  }
})

// ============================================
// UTILIDADES
// ============================================

function escaparHtml(texto) {
  const div = document.createElement('div')
  div.textContent = texto ?? ''
  return div.innerHTML
}

// Iniciar
inicializar()
