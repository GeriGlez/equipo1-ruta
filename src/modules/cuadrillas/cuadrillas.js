import { getActiveSession } from '../auth/authService.js'
import {
  listarCuadrillas,
  crearCuadrilla,
  actualizarCuadrilla,
  cambiarEstadoCuadrilla,
  eliminarCuadrilla,
  listarPersonal,
  crearEmpleado,
  actualizarEmpleado,
  cambiarEstadoEmpleado
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
const filtroEstadoCuadrilla = document.getElementById('filtro-estado-cuadrilla')
const alertListaCuadrillas = document.getElementById('alert-lista-cuadrillas')
const btnAbrirNuevaCuadrilla = document.getElementById('btn-abrir-nueva-cuadrilla')

// Modal Cuadrilla DOM
const modalCuadrilla = document.getElementById('modal-cuadrilla')
const modalCuadrillaTitle = document.getElementById('modal-cuadrilla-title')
const alertCuadrilla = document.getElementById('alert-cuadrilla')
const formCuadrilla = document.getElementById('form-cuadrilla')
const inputCuadrillaId = document.getElementById('cuadrilla-id')
const inputCuadrillaNombre = document.getElementById('cuadrilla-nombre')
const selectResponsable = document.getElementById('cuadrilla-responsable')
const errorCuadrillaNombre = document.getElementById('error-cuadrilla-nombre')
const errorCuadrillaResponsable = document.getElementById('error-cuadrilla-responsable')
const listaMiembrosCheckboxes = document.getElementById('lista-miembros-checkboxes')
const btnCerrarModalCuadrilla = document.getElementById('btn-cerrar-modal-cuadrilla')
const btnGuardarCuadrilla = document.getElementById('btn-guardar-cuadrilla')
const btnEliminarCuadrilla = document.getElementById('btn-eliminar-cuadrilla')

// Personal DOM
const tablaPersonalBody = document.getElementById('tabla-personal-body')
const buscarPersonal = document.getElementById('buscar-personal')
const filtroEstadoPersonal = document.getElementById('filtro-estado-personal')
const alertListaPersonal = document.getElementById('alert-lista-personal')
const btnAbrirNuevoEmpleado = document.getElementById('btn-abrir-nuevo-empleado')

// Modal Empleado DOM
const modalEmpleado = document.getElementById('modal-empleado')
const modalEmpleadoTitle = document.getElementById('modal-empleado-title')
const modalEmpleadoSubtitle = document.getElementById('modal-empleado-subtitle')
const alertEmpleado = document.getElementById('alert-empleado')
const formEmpleado = document.getElementById('form-empleado')
const inputEmpleadoId = document.getElementById('empleado-id')
const inputEmpleadoNombre = document.getElementById('empleado-nombre')
const inputEmpleadoCorreo = document.getElementById('empleado-correo')
const inputEmpleadoTelefono = document.getElementById('empleado-telefono')
const selectEmpleadoRol = document.getElementById('empleado-rol')
const grupoEmpleadoPassword = document.getElementById('grupo-empleado-password')
const inputEmpleadoPassword = document.getElementById('empleado-password')
const btnToggleEmpleadoPassword = document.getElementById('btn-toggle-empleado-password')
const errorEmpleadoNombre = document.getElementById('error-empleado-nombre')
const errorEmpleadoCorreo = document.getElementById('error-empleado-correo')
const errorEmpleadoTelefono = document.getElementById('error-empleado-telefono')
const errorEmpleadoPassword = document.getElementById('error-empleado-password')
const btnCerrarModalEmpleado = document.getElementById('btn-cerrar-modal-empleado')
const btnGuardarEmpleado = document.getElementById('btn-guardar-empleado')

// Estado en memoria
let cacheCuadrillas = []
let cachePersonal = []
let apoyoSeleccionadosIds = new Set()
let usuarioSesionId = null
let avisoTimer = null

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATRON_TELEFONO = /^\d{10}$/

function mostrarAvisoLista(contenedor, texto, tipo = 'danger') {
  clearTimeout(avisoTimer)
  contenedor.className = `alert-box ${tipo === 'success' ? 'alert-success' : 'alert-danger'}`
  contenedor.textContent = texto
  contenedor.style.display = 'block'
  if (tipo === 'success') {
    avisoTimer = setTimeout(() => {
      contenedor.style.display = 'none'
    }, 3500)
  }
}

// ============================================
// CARGA SINCRONIZADA Y SEGURIDAD
// ============================================

async function recargarDatos() {
  const [resCuadrillas, resPersonal] = await Promise.allSettled([
    listarCuadrillas(),
    listarPersonal()
  ])

  if (resCuadrillas.status === 'fulfilled') {
    cacheCuadrillas = resCuadrillas.value
  }
  if (resPersonal.status === 'fulfilled') {
    cachePersonal = resPersonal.value
  }

  if (resCuadrillas.status === 'fulfilled') {
    filtrarCuadrillas()
  } else {
    console.error('[Cuadrillas] Error al listar:', resCuadrillas.reason)
    gridCuadrillas.innerHTML = `<div class="empty-state" style="color:#ef4444;">Error al cargar cuadrillas: ${escaparHtml(resCuadrillas.reason?.message || 'Error de conexión')}</div>`
  }

  if (resPersonal.status === 'fulfilled') {
    filtrarPersonal()
  } else {
    console.error('[Personal] Error al listar:', resPersonal.reason)
    tablaPersonalBody.innerHTML = `<tr><td colspan="6" class="empty-state" style="color:#ef4444;">Error al cargar personal: ${escaparHtml(resPersonal.reason?.message || 'Error de conexión')}</td></tr>`
  }
}

async function inicializar() {
  try {
    const sesion = await getActiveSession()
    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      console.warn('[Cuadrillas] Acceso denegado: se requiere rol de administrador.')
      window.location.href = '/'
      return
    }

    usuarioSesionId = sesion.usuario.id
    if (headerUserName) {
      headerUserName.textContent = sesion.usuario.nombre || 'Administrador'
    }

    await recargarDatos()
  } catch (error) {
    console.error('[Cuadrillas] Error en inicialización:', error)
    window.location.href = '/'
  }
}

// ============================================
// VALIDACIÓN DE FORMULARIOS (SIN TOOLTIP DEFAULT)
// ============================================

function marcarErrorCampo(inputEl, errorEl, texto) {
  if (texto) {
    inputEl.classList.add('input-error')
    errorEl.textContent = texto
    errorEl.classList.add('visible')
  } else {
    inputEl.classList.remove('input-error')
    errorEl.textContent = ''
    errorEl.classList.remove('visible')
  }
}

function limpiarErroresCuadrilla() {
  alertCuadrilla.style.display = 'none'
  marcarErrorCampo(inputCuadrillaNombre, errorCuadrillaNombre, '')
  marcarErrorCampo(selectResponsable, errorCuadrillaResponsable, '')
}

function limpiarErroresEmpleado() {
  alertEmpleado.style.display = 'none'
  marcarErrorCampo(inputEmpleadoNombre, errorEmpleadoNombre, '')
  marcarErrorCampo(inputEmpleadoCorreo, errorEmpleadoCorreo, '')
  marcarErrorCampo(inputEmpleadoTelefono, errorEmpleadoTelefono, '')
  marcarErrorCampo(inputEmpleadoPassword, errorEmpleadoPassword, '')
}

inputCuadrillaNombre.addEventListener('input', () => marcarErrorCampo(inputCuadrillaNombre, errorCuadrillaNombre, ''))
selectResponsable.addEventListener('change', () => {
  marcarErrorCampo(selectResponsable, errorCuadrillaResponsable, '')
  if (selectResponsable.value) {
    apoyoSeleccionadosIds.delete(String(selectResponsable.value))
  }
  renderCheckboxesApoyo()
})

inputEmpleadoNombre.addEventListener('input', () => marcarErrorCampo(inputEmpleadoNombre, errorEmpleadoNombre, ''))
inputEmpleadoCorreo.addEventListener('input', () => marcarErrorCampo(inputEmpleadoCorreo, errorEmpleadoCorreo, ''))
inputEmpleadoTelefono.addEventListener('input', () => {
  inputEmpleadoTelefono.value = inputEmpleadoTelefono.value.replace(/\D/g, '').slice(0, 10)
  marcarErrorCampo(inputEmpleadoTelefono, errorEmpleadoTelefono, '')
})
inputEmpleadoPassword.addEventListener('input', () => marcarErrorCampo(inputEmpleadoPassword, errorEmpleadoPassword, ''))
btnToggleEmpleadoPassword.addEventListener('click', () => {
  const mostrar = inputEmpleadoPassword.type === 'password'
  inputEmpleadoPassword.type = mostrar ? 'text' : 'password'
  btnToggleEmpleadoPassword.textContent = mostrar ? 'Ocultar' : 'Mostrar'
})

// ============================================
// NAVEGACIÓN POR PESTAÑAS
// ============================================

tabBtnCuadrillas.addEventListener('click', () => {
  tabBtnCuadrillas.classList.add('active')
  tabBtnPersonal.classList.remove('active')
  secCuadrillas.style.display = 'block'
  secPersonal.style.display = 'none'
  alertListaCuadrillas.style.display = 'none'
  filtrarCuadrillas()
})

tabBtnPersonal.addEventListener('click', () => {
  tabBtnPersonal.classList.add('active')
  tabBtnCuadrillas.classList.remove('active')
  secPersonal.style.display = 'block'
  secCuadrillas.style.display = 'none'
  alertListaPersonal.style.display = 'none'
  filtrarPersonal()
})

// ============================================
// RENDERIZADO DE CUADRILLAS (FIGMA)
// ============================================

function filtrarCuadrillas() {
  const q = buscarCuadrilla.value.trim().toLowerCase()
  const estado = filtroEstadoCuadrilla.value

  const resultado = cacheCuadrillas.filter(c => {
    if (estado === 'activas' && !c.activo) return false
    if (estado === 'inactivas' && c.activo) return false

    if (!q) return true
    return (
      c.nombre?.toLowerCase().includes(q) ||
      c.responsable?.nombre?.toLowerCase().includes(q) ||
      c.miembros?.some(m => m.usuario?.nombre?.toLowerCase().includes(q))
    )
  })

  renderCuadrillasCards(resultado)
}

function renderCuadrillasCards(cuadrillas) {
  if (!cuadrillas.length) {
    const hayFiltro = Boolean(buscarCuadrilla.value.trim()) || filtroEstadoCuadrilla.value !== 'activas'
    gridCuadrillas.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        ${hayFiltro
          ? 'No se encontraron cuadrillas con los filtros seleccionados.'
          : 'No hay cuadrillas activas registradas aún. Haz clic en <strong>+ Nueva cuadrilla</strong> para crear una.'}
      </div>
    `
    return
  }

  gridCuadrillas.innerHTML = cuadrillas.map(c => {
    const respNombre = c.responsable?.nombre || 'Sin responsable'
    const miembrosApoyo = (c.miembros || []).filter(m => String(m.usuario_id) !== String(c.responsable_id))
    const totalApoyo = miembrosApoyo.length

    const primeros = miembrosApoyo.slice(0, 4)
    const restantes = totalApoyo - primeros.length

    const avataresHtml = primeros.map(m => {
      const nombreUsuario = (m.usuario?.nombre || '').trim() || 'Técnico'
      const inicial = nombreUsuario[0].toUpperCase()
      return `<div class="avatar-member" title="${escaparHtml(nombreUsuario)}">${escaparHtml(inicial)}</div>`
    }).join('')

    const nombresRestantes = restantes > 0
      ? miembrosApoyo.slice(4).map(m => (m.usuario?.nombre || '').trim() || 'Técnico').join(', ')
      : ''
    const masHtml = restantes > 0
      ? `<div class="avatar-member avatar-more" title="${escaparHtml(nombresRestantes)}">+${restantes}</div>`
      : ''

    const estadoBadge = c.activo
      ? '<span class="status-badge status-badge--activo">Activa</span>'
      : '<span class="status-badge status-badge--inactivo">Inactiva</span>'

    const btnEstadoClase = c.activo ? 'btn-action-link--danger' : 'btn-action-link--success'
    const btnEstadoTexto = c.activo ? 'Desactivar' : 'Activar'

    return `
      <article class="cuadrilla-card ${c.activo ? '' : 'cuadrilla-card--inactiva'}" data-id="${escaparHtml(c.id)}">
        <div class="cuadrilla-header">
          <h2 class="cuadrilla-title">${escaparHtml(c.nombre)}</h2>
          ${estadoBadge}
        </div>

        <div class="responsable-box" title="Clic para editar cuadrilla">
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
          <span class="assigned-count">${totalApoyo} ${totalApoyo === 1 ? 'técnico de apoyo' : 'técnicos de apoyo'}</span>
        </div>

        <div class="card-footer-actions">
          <span style="font-size:0.75rem; color:#94a3b8;">${escaparHtml(c.responsable?.telefono || '')}</span>
          <div class="card-actions-group">
            <button type="button" class="btn-editar-link" data-id="${escaparHtml(c.id)}">
              Editar
            </button>
            <button type="button" class="btn-action-link ${btnEstadoClase}" data-toggle-id="${escaparHtml(c.id)}" data-activo="${c.activo}">
              ${btnEstadoTexto}
            </button>
          </div>
        </div>
      </article>
    `
  }).join('')
}

buscarCuadrilla.addEventListener('input', filtrarCuadrillas)
filtroEstadoCuadrilla.addEventListener('change', filtrarCuadrillas)

// ============================================
// MODAL ARMAR / EDITAR CUADRILLA
// ============================================

btnAbrirNuevaCuadrilla.addEventListener('click', () => {
  abrirModalCuadrilla()
})

gridCuadrillas.addEventListener('click', async (e) => {
  const btnEditar = e.target.closest('.btn-editar-link')
  const btnToggle = e.target.closest('button[data-toggle-id]')
  const respBox = e.target.closest('.responsable-box')

  if (btnEditar) {
    abrirModalCuadrilla(btnEditar.dataset.id)
    return
  }

  if (btnToggle) {
    const id = btnToggle.dataset.toggleId
    const activar = btnToggle.dataset.activo !== 'true'
    const pregunta = activar
      ? '¿Deseas reactivar esta cuadrilla para que vuelva a estar disponible?'
      : '¿Deseas desactivar esta cuadrilla? No aparecerá como activa, pero se conservará su historial de órdenes.'
    if (!confirm(pregunta)) return

    alertListaCuadrillas.style.display = 'none'
    btnToggle.disabled = true
    try {
      await cambiarEstadoCuadrilla(id, activar)
      await recargarDatos()
      mostrarAvisoLista(
        alertListaCuadrillas,
        activar ? 'Cuadrilla reactivada correctamente.' : 'Cuadrilla desactivada correctamente.',
        'success'
      )
    } catch (error) {
      mostrarAvisoLista(alertListaCuadrillas, error.message, 'danger')
      btnToggle.disabled = false
    }
    return
  }

  if (respBox) {
    const card = respBox.closest('.cuadrilla-card')
    if (card?.dataset?.id) {
      abrirModalCuadrilla(card.dataset.id)
    }
  }
})

listaMiembrosCheckboxes.addEventListener('change', (e) => {
  const cb = e.target.closest('input[name="miembros"]')
  if (!cb) return
  if (cb.checked) {
    apoyoSeleccionadosIds.add(String(cb.value))
  } else {
    apoyoSeleccionadosIds.delete(String(cb.value))
  }
})

function renderCheckboxesApoyo() {
  const responsableId = selectResponsable.value
  const tecnicosApoyoDisponibles = cachePersonal.filter(
    p => p.rol === 'tecnico' && p.activo && String(p.id) !== String(responsableId)
  )

  if (!tecnicosApoyoDisponibles.length) {
    listaMiembrosCheckboxes.innerHTML = `
      <span style="font-size:0.85rem; color:#94a3b8; padding:0.5rem; display:block;">
        ${responsableId
          ? 'No hay otros técnicos activos disponibles para apoyo.'
          : 'No hay técnicos activos registrados. Ve a la pestaña "Personal" para dar de alta técnicos.'}
      </span>
    `
    return
  }

  listaMiembrosCheckboxes.innerHTML = tecnicosApoyoDisponibles.map(t => {
    const checked = apoyoSeleccionadosIds.has(String(t.id)) ? 'checked' : ''
    return `
      <label class="tech-checkbox-item">
        <input type="checkbox" name="miembros" value="${escaparHtml(t.id)}" ${checked}>
        <div>
          <strong style="font-size:0.9rem; color:#1e293b;">${escaparHtml(t.nombre)}</strong>
          <div style="font-size:0.75rem; color:#64748b;">${escaparHtml(t.correo)} ${t.telefono ? `· ${escaparHtml(t.telefono)}` : ''}</div>
        </div>
      </label>
    `
  }).join('')
}

function abrirModalCuadrilla(idEditar = null) {
  const cuadrilla = idEditar ? cacheCuadrillas.find(c => String(c.id) === String(idEditar)) : null
  if (idEditar && !cuadrilla) return

  formCuadrilla.reset()
  limpiarErroresCuadrilla()
  inputCuadrillaId.value = idEditar || ''
  apoyoSeleccionadosIds = new Set()

  modalCuadrillaTitle.textContent = idEditar ? 'Editar Cuadrilla' : 'Armar Nueva Cuadrilla'
  btnEliminarCuadrilla.style.display = idEditar ? 'inline-block' : 'none'
  btnGuardarCuadrilla.disabled = false
  btnGuardarCuadrilla.textContent = idEditar ? 'Guardar Cambios' : 'Guardar Cuadrilla'

  const tecnicosActivos = cachePersonal.filter(p => p.rol === 'tecnico' && p.activo)

  selectResponsable.innerHTML = `
    <option value="">Selecciona un técnico responsable...</option>
    ${tecnicosActivos.map(t => `<option value="${escaparHtml(t.id)}">${escaparHtml(t.nombre)} (${escaparHtml(t.correo)})</option>`).join('')}
  `

  if (cuadrilla) {
    inputCuadrillaNombre.value = cuadrilla.nombre || ''
    apoyoSeleccionadosIds = new Set(
      (cuadrilla.miembros || [])
        .map(m => String(m.usuario_id))
        .filter(uid => uid !== String(cuadrilla.responsable_id))
    )
    if (
      cuadrilla.responsable_id &&
      tecnicosActivos.some(t => String(t.id) === String(cuadrilla.responsable_id))
    ) {
      selectResponsable.value = cuadrilla.responsable_id
    }
  }

  renderCheckboxesApoyo()
  modalCuadrilla.classList.add('active')
}

function cerrarModales() {
  modalCuadrilla.classList.remove('active')
  modalEmpleado.classList.remove('active')
}

btnCerrarModalCuadrilla.addEventListener('click', cerrarModales)
btnCerrarModalEmpleado.addEventListener('click', cerrarModales)

document.querySelectorAll('.btn-modal-close').forEach(btn => {
  btn.addEventListener('click', cerrarModales)
})

;[modalCuadrilla, modalEmpleado].forEach(modal => {
  modal.addEventListener('mousedown', (e) => {
    if (e.target === modal) cerrarModales()
  })
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModales()
})

formCuadrilla.addEventListener('submit', async (e) => {
  e.preventDefault()
  limpiarErroresCuadrilla()

  const id = inputCuadrillaId.value
  const nombre = inputCuadrillaNombre.value.trim()
  const responsable_id = selectResponsable.value

  let hayError = false
  if (!nombre) {
    marcarErrorCampo(inputCuadrillaNombre, errorCuadrillaNombre, 'Por favor, escribe el nombre de la cuadrilla.')
    hayError = true
  } else {
    const nombreDuplicado = cacheCuadrillas.some(
      c => c.nombre?.trim().toLowerCase() === nombre.toLowerCase() && String(c.id) !== String(id)
    )
    if (nombreDuplicado) {
      marcarErrorCampo(inputCuadrillaNombre, errorCuadrillaNombre, 'Ya existe otra cuadrilla registrada con ese nombre.')
      hayError = true
    }
  }
  if (!responsable_id) {
    marcarErrorCampo(selectResponsable, errorCuadrillaResponsable, 'Debes seleccionar a un técnico responsable.')
    hayError = true
  }
  if (hayError) {
    alertCuadrilla.textContent = 'Revisa los campos marcados en rojo antes de continuar.'
    alertCuadrilla.style.display = 'block'
    return
  }

  const idsDom = Array.from(formCuadrilla.querySelectorAll('input[name="miembros"]:checked')).map(cb => String(cb.value))
  const miembrosIds = Array.from(new Set([...apoyoSeleccionadosIds, ...idsDom])).filter(
    uid => uid !== String(responsable_id) && cachePersonal.some(p => String(p.id) === uid && p.activo && p.rol === 'tecnico')
  )

  btnGuardarCuadrilla.disabled = true
  btnGuardarCuadrilla.textContent = 'Guardando...'

  try {
    if (id) {
      await actualizarCuadrilla(id, { nombre, responsable_id, miembrosIds })
    } else {
      await crearCuadrilla({ nombre, responsable_id, miembrosIds })
    }

    modalCuadrilla.classList.remove('active')
    await recargarDatos()
    mostrarAvisoLista(
      alertListaCuadrillas,
      id ? 'Cambios de la cuadrilla guardados correctamente.' : 'Cuadrilla creada correctamente.',
      'success'
    )
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

  const seguro = confirm(
    '¿Estás seguro de eliminar definitivamente esta cuadrilla? Si solo deseas conservar su historial sin programarle órdenes, cancélalo y márcala como inactiva.'
  )
  if (!seguro) return

  alertCuadrilla.style.display = 'none'
  btnEliminarCuadrilla.disabled = true
  try {
    await eliminarCuadrilla(id)
    modalCuadrilla.classList.remove('active')
    await recargarDatos()
    mostrarAvisoLista(alertListaCuadrillas, 'Cuadrilla eliminada correctamente.', 'success')
  } catch (error) {
    alertCuadrilla.textContent = error.message
    alertCuadrilla.style.display = 'block'
  } finally {
    btnEliminarCuadrilla.disabled = false
  }
})

// ============================================
// RENDERIZADO DE PERSONAL (TABLA)
// ============================================

function filtrarPersonal() {
  const q = buscarPersonal.value.trim().toLowerCase()
  const estado = filtroEstadoPersonal.value

  const resultado = cachePersonal.filter(u => {
    if (estado === 'activos' && !u.activo) return false
    if (estado === 'inactivos' && u.activo) return false

    if (!q) return true
    const coincidePorResponsable =
      u.activo &&
      u.rol === 'tecnico' &&
      cacheCuadrillas.some(
        c => c.activo && String(c.responsable_id) === String(u.id) && c.nombre?.toLowerCase().includes(q)
      )
    const coincidePorApoyo =
      u.activo &&
      u.rol === 'tecnico' &&
      u.cuadrillas?.some(
        c =>
          c.cuadrilla?.activo !== false &&
          c.cuadrilla?.nombre?.toLowerCase().includes(q) &&
          !cacheCuadrillas.some(
            cr => String(cr.id) === String(c.cuadrilla.id) && String(cr.responsable_id) === String(u.id)
          )
      )
    return (
      u.nombre?.toLowerCase().includes(q) ||
      u.correo?.toLowerCase().includes(q) ||
      u.telefono?.includes(q) ||
      u.rol?.toLowerCase().includes(q) ||
      coincidePorResponsable ||
      coincidePorApoyo
    )
  })

  renderPersonalTabla(resultado)
}

function renderPersonalTabla(personal) {
  if (!personal.length) {
    const hayFiltro = Boolean(buscarPersonal.value.trim()) || filtroEstadoPersonal.value !== 'activos'
    tablaPersonalBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-state">
          ${hayFiltro
            ? 'No se encontraron empleados con los filtros seleccionados.'
            : 'No hay empleados activos registrados. Haz clic en <strong>+ Agregar Empleado</strong>.'}
        </td>
      </tr>
    `
    return
  }

  tablaPersonalBody.innerHTML = personal.map(p => {
    const rolBadge = p.rol === 'administrador'
      ? '<span class="badge-tag badge-rol-admin">Administrador</span>'
      : '<span class="badge-tag" style="background:#dcfce7; color:#166534;">Técnico</span>'

    let etiquetasCuadrillas = []
    if (p.activo && p.rol === 'tecnico') {
      const comoResponsable = cacheCuadrillas
        .filter(c => String(c.responsable_id) === String(p.id) && c.activo)
        .map(c => `<span class="badge-tag badge-tag--resp" title="Responsable de cuadrilla">★ ${escaparHtml(c.nombre)}</span>`)

      const idsResp = new Set(
        cacheCuadrillas
          .filter(c => String(c.responsable_id) === String(p.id))
          .map(c => String(c.id))
      )

      const comoApoyo = (p.cuadrillas || [])
        .filter(c => c.cuadrilla?.nombre && c.cuadrilla.activo !== false && !idsResp.has(String(c.cuadrilla.id)))
        .map(c => `<span class="badge-tag" title="Técnico de apoyo">${escaparHtml(c.cuadrilla.nombre)}</span>`)

      etiquetasCuadrillas = [...comoResponsable, ...comoApoyo]
    }

    const cuadrillasHtml = etiquetasCuadrillas.length
      ? etiquetasCuadrillas.join('')
      : '<span style="font-size:0.8rem; color:#94a3b8;">Sin cuadrilla</span>'

    const estadoBadge = p.activo
      ? '<span class="status-badge status-badge--activo">Activo</span>'
      : '<span class="status-badge status-badge--inactivo">Inactivo (Baja)</span>'

    const esUsuarioActual = String(p.id) === String(usuarioSesionId)
    const btnBajaClase = p.activo ? 'btn-action-link--danger' : 'btn-action-link--success'
    const btnBajaTexto = p.activo ? 'Dar de baja' : 'Reactivar'

    return `
      <tr>
        <td>
          <div style="font-weight:600; color:#0f172a;">
            ${escaparHtml(p.nombre)}
            ${esUsuarioActual ? '<span style="font-size:0.75rem; color:#64748b; font-weight:500;">(Tú)</span>' : ''}
          </div>
        </td>
        <td>
          <div style="font-size:0.85rem; color:#334155;">${escaparHtml(p.correo)}</div>
          <div style="font-size:0.8rem; color:#64748b;">${escaparHtml(p.telefono || '—')}</div>
        </td>
        <td>${rolBadge}</td>
        <td>${cuadrillasHtml}</td>
        <td>${estadoBadge}</td>
        <td>
          <div class="table-actions">
            <button type="button" class="btn-action-link" data-edit-emp="${escaparHtml(p.id)}">
              Editar
            </button>
            ${esUsuarioActual
              ? ''
              : `<button type="button" class="btn-action-link ${btnBajaClase}" data-toggle-emp="${escaparHtml(p.id)}" data-activo="${p.activo}">${btnBajaTexto}</button>`}
          </div>
        </td>
      </tr>
    `
  }).join('')
}

buscarPersonal.addEventListener('input', filtrarPersonal)
filtroEstadoPersonal.addEventListener('change', filtrarPersonal)

// ============================================
// MODAL AGREGAR / EDITAR EMPLEADO (FIGMA)
// ============================================

function abrirModalEmpleado(idEditar = null) {
  const emp = idEditar ? cachePersonal.find(u => String(u.id) === String(idEditar)) : null
  if (idEditar && !emp) return

  formEmpleado.reset()
  limpiarErroresEmpleado()
  inputEmpleadoId.value = idEditar || ''

  if (emp) {
    const esPropio = String(emp.id) === String(usuarioSesionId)
    modalEmpleadoTitle.textContent = 'Editar Empleado'
    modalEmpleadoSubtitle.textContent = 'Actualiza los datos de contacto o rol del empleado'
    btnGuardarEmpleado.textContent = 'Guardar Cambios'

    inputEmpleadoNombre.value = emp.nombre || ''
    inputEmpleadoCorreo.value = emp.correo || ''
    inputEmpleadoCorreo.disabled = esPropio
    inputEmpleadoCorreo.title = esPropio ? 'El correo de tu sesión activa no se puede cambiar desde aquí' : ''
    inputEmpleadoTelefono.value = (emp.telefono || '').replace(/\D/g, '').slice(0, 10)
    selectEmpleadoRol.value = emp.rol || 'tecnico'
    selectEmpleadoRol.disabled = esPropio
    selectEmpleadoRol.title = esPropio ? 'No puedes cambiar tu propio rol de administrador' : ''
    grupoEmpleadoPassword.style.display = 'none'
  } else {
    modalEmpleadoTitle.textContent = 'Agregar Nuevo Empleado'
    modalEmpleadoSubtitle.textContent = 'Registra a un nuevo técnico o administrativo en la plataforma'
    btnGuardarEmpleado.textContent = 'Guardar Registro'
    inputEmpleadoCorreo.disabled = false
    inputEmpleadoCorreo.title = ''
    selectEmpleadoRol.disabled = false
    selectEmpleadoRol.title = ''
    grupoEmpleadoPassword.style.display = 'block'
    inputEmpleadoPassword.type = 'password'
    btnToggleEmpleadoPassword.textContent = 'Mostrar'
  }

  modalEmpleado.classList.add('active')
}

btnAbrirNuevoEmpleado.addEventListener('click', () => {
  abrirModalEmpleado()
})

tablaPersonalBody.addEventListener('click', async (e) => {
  const btnEditar = e.target.closest('button[data-edit-emp]')
  const btnToggle = e.target.closest('button[data-toggle-emp]')

  if (btnEditar) {
    abrirModalEmpleado(btnEditar.dataset.editEmp)
    return
  }

  if (btnToggle) {
    const id = btnToggle.dataset.toggleEmp
    if (String(id) === String(usuarioSesionId)) {
      mostrarAvisoLista(alertListaPersonal, 'No puedes dar de baja tu propia cuenta de administrador.', 'danger')
      return
    }
    const activar = btnToggle.dataset.activo !== 'true'
    const pregunta = activar
      ? '¿Deseas reactivar a este empleado para que vuelva a estar disponible?'
      : '¿Deseas dar de baja a este empleado? Ya no aparecerá disponible para nuevas asignaciones, pero se conserva su historial.'
    if (!confirm(pregunta)) return

    alertListaPersonal.style.display = 'none'
    btnToggle.disabled = true
    try {
      await cambiarEstadoEmpleado(id, activar)
      await recargarDatos()
      mostrarAvisoLista(
        alertListaPersonal,
        activar ? 'Empleado reactivado correctamente.' : 'Empleado dado de baja correctamente.',
        'success'
      )
    } catch (error) {
      mostrarAvisoLista(alertListaPersonal, error.message, 'danger')
      btnToggle.disabled = false
    }
  }
})

formEmpleado.addEventListener('submit', async (e) => {
  e.preventDefault()
  limpiarErroresEmpleado()

  const id = inputEmpleadoId.value
  const esPropio = Boolean(id && String(id) === String(usuarioSesionId))
  const empOriginal = id ? cachePersonal.find(u => String(u.id) === String(id)) : null

  const nombre = inputEmpleadoNombre.value.trim()
  const correo = esPropio && empOriginal ? empOriginal.correo : inputEmpleadoCorreo.value.trim()
  const telefono = inputEmpleadoTelefono.value.replace(/[\s-]/g, '').trim()
  const rol = esPropio && empOriginal ? empOriginal.rol : selectEmpleadoRol.value
  const password = inputEmpleadoPassword.value

  let hayError = false
  if (!nombre) {
    marcarErrorCampo(inputEmpleadoNombre, errorEmpleadoNombre, 'Por favor, escribe el nombre completo del empleado.')
    hayError = true
  }
  if (!correo) {
    marcarErrorCampo(inputEmpleadoCorreo, errorEmpleadoCorreo, 'Por favor, ingresa el correo electrónico.')
    hayError = true
  } else if (!PATRON_CORREO.test(correo)) {
    marcarErrorCampo(inputEmpleadoCorreo, errorEmpleadoCorreo, 'Ingresa un correo electrónico válido (ejemplo@dominio.com).')
    hayError = true
  } else {
    const correoDuplicado = cachePersonal.some(
      u => u.correo?.trim().toLowerCase() === correo.toLowerCase() && String(u.id) !== String(id)
    )
    if (correoDuplicado) {
      marcarErrorCampo(inputEmpleadoCorreo, errorEmpleadoCorreo, 'Ya existe un empleado registrado con ese correo electrónico.')
      hayError = true
    }
  }
  if (!telefono) {
    marcarErrorCampo(inputEmpleadoTelefono, errorEmpleadoTelefono, 'Por favor, ingresa el teléfono del empleado.')
    hayError = true
  } else if (!PATRON_TELEFONO.test(telefono)) {
    marcarErrorCampo(inputEmpleadoTelefono, errorEmpleadoTelefono, 'El teléfono debe tener exactamente 10 dígitos numéricos.')
    hayError = true
  }
  if (!id) {
    if (!password) {
      marcarErrorCampo(inputEmpleadoPassword, errorEmpleadoPassword, 'Por favor, ingresa una contraseña para el nuevo empleado.')
      hayError = true
    } else if (password.length < 6) {
      marcarErrorCampo(inputEmpleadoPassword, errorEmpleadoPassword, 'La contraseña debe tener al menos 6 caracteres.')
      hayError = true
    }
  }

  if (hayError) {
    alertEmpleado.textContent = 'Revisa los campos marcados en rojo antes de guardar.'
    alertEmpleado.style.display = 'block'
    return
  }

  btnGuardarEmpleado.disabled = true
  btnGuardarEmpleado.textContent = 'Guardando...'

  try {
    if (id) {
      await actualizarEmpleado(id, { nombre, correo, telefono, rol })
    } else {
      await crearEmpleado({ nombre, correo, telefono, rol, password })
    }
    modalEmpleado.classList.remove('active')
    await recargarDatos()
    mostrarAvisoLista(
      alertListaPersonal,
      id ? 'Datos del empleado actualizados correctamente.' : 'Empleado registrado correctamente.',
      'success'
    )
  } catch (error) {
    alertEmpleado.textContent = error.message
    alertEmpleado.style.display = 'block'
  } finally {
    btnGuardarEmpleado.disabled = false
    btnGuardarEmpleado.textContent = id ? 'Guardar Cambios' : 'Guardar Registro'
  }
})

// ============================================
// UTILIDADES
// ============================================

function escaparHtml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Iniciar
inicializar()
