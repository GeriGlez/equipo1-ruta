// Módulo 1 · Registrar / editar condominio con sus áreas
import { getActiveSession } from '../auth/authService.js'
import {
  TIPOS_AREA,
  obtenerCondominio,
  crearCondominio,
  actualizarCondominio,
  agregarAreas,
  eliminarAreas,
  actualizarArea
} from './condominiosService.js'

// ---------- Elementos ----------
const formulario = document.querySelector('#form-condominio')
const titulo = document.querySelector('#titulo')
const nombreUsuario = document.querySelector('#nombre-usuario')
const mensaje = document.querySelector('#mensaje')
const botonGuardar = document.querySelector('#btn-guardar')

const areaNombre = document.querySelector('#area-nombre')
const areaTipo = document.querySelector('#area-tipo')
const areaLecturas = document.querySelector('#area-lecturas')
const botonAgregarArea = document.querySelector('#btn-agregar-area')
const listaAreas = document.querySelector('#lista-areas')
const campoTelefono = document.querySelector('#telefono')
const botonCancelarArea = document.querySelector('#btn-cancelar-area')
const avisoTipo = document.querySelector('#area-aviso-tipo')

// Si la URL trae ?id=14, estamos editando ese condominio
const idEditar = Number(new URLSearchParams(window.location.search).get('id')) || null

// Áreas que se ven en la tabla. Las que ya están guardadas traen "id".
// Las guardadas que el usuario marca para borrar llevan "eliminar: true"
// y solo se borran al dar Guardar. Las que se corrigen llevan "editada: true".
let areas = []

// Posición en "areas" del área que se está editando (null = capturando una nueva)
let areaEditando = null

// ---------- Utilidades ----------

function escapar(texto) {
  const div = document.createElement('div')
  div.textContent = texto ?? ''
  return div.innerHTML
}

// Aviso flotante arriba de la pantalla; se oculta solo a los 6 segundos
let temporizadorMensaje
function mostrarMensaje(texto) {
  clearTimeout(temporizadorMensaje)
  mensaje.textContent = texto
  mensaje.hidden = !texto
  if (texto) temporizadorMensaje = setTimeout(() => { mensaje.hidden = true }, 6000)
}

// ---------- Errores junto a cada campo ----------

// Pinta el campo en rojo y escribe el error justo debajo de él
function marcarError(campo, texto) {
  const grupo = campo.closest('.form-group')
  campo.classList.add('reg-campo-error')
  campo.setAttribute('aria-invalid', 'true')

  let aviso = grupo.querySelector('.reg-error-texto')
  if (!aviso) {
    aviso = document.createElement('small')
    aviso.className = 'reg-error-texto'
    grupo.append(aviso)
  }
  aviso.textContent = texto
}

function quitarError(campo) {
  campo.classList.remove('reg-campo-error')
  campo.removeAttribute('aria-invalid')
  campo.closest('.form-group')?.querySelector('.reg-error-texto')?.remove()
}

function limpiarErrores() {
  formulario.querySelectorAll('.reg-campo-error').forEach(quitarError)
}

// Revisa los campos obligatorios antes de enviar. Devuelve true si todo está bien.
function validarFormulario() {
  limpiarErrores()
  const errores = []

  if (!formulario.nombre.value.trim()) {
    errores.push([formulario.nombre, 'Escribe el nombre del condominio.'])
  }
  if (!formulario.direccion.value.trim()) {
    errores.push([formulario.direccion, 'Escribe la dirección completa.'])
  }
  const telefono = campoTelefono.value
  if (telefono && telefono.length !== 10) {
    errores.push([campoTelefono, 'El teléfono debe tener exactamente 10 dígitos.'])
  }
  // Un área a medio editar, o escrita pero que no se agregó a la lista
  if (areaEditando !== null) {
    errores.push([areaNombre, 'Termina de editar el área ("Guardar cambios del área") o cancela la edición.'])
  } else if (areaNombre.value.trim()) {
    errores.push([areaNombre, 'Dale "+ Agregar a la lista" o borra el nombre.'])
  }

  if (errores.length === 0) return true

  errores.forEach(([campo, texto]) => marcarError(campo, texto))

  // Lleva la pantalla y el cursor al primer error
  const [primero] = errores[0]
  primero.scrollIntoView({ behavior: 'smooth', block: 'center' })
  primero.focus({ preventScroll: true })

  mostrarMensaje(errores.length === 1
    ? 'Revisa el campo marcado en rojo.'
    : `Revisa los ${errores.length} campos marcados en rojo.`)
  return false
}

function etiquetaTipo(valor) {
  return TIPOS_AREA.find(t => t.valor === valor)?.etiqueta ?? valor
}

// ---------- Lista de áreas ----------

function dibujarAreas() {
  if (areas.length === 0) {
    listaAreas.innerHTML =
      '<tr><td colspan="4" class="condo-vacio">Aún no hay áreas. Agrega al menos una arriba.</td></tr>'
    return
  }

  listaAreas.innerHTML = areas.map((area, indice) => {
    let accion
    if (!area.id) {
      accion = `<button type="button" class="condo-link" data-quitar="${indice}">Quitar</button>`
    } else if (area.eliminar) {
      accion = `<span class="reg-etiqueta-eliminar">Se eliminará</span>
                <button type="button" class="condo-link" data-deshacer="${indice}">Deshacer</button>`
    } else {
      accion = `<button type="button" class="condo-link" data-editar="${indice}">Editar</button>
                <button type="button" class="condo-link reg-link-peligro" data-eliminar="${indice}">Eliminar</button>`
    }

    const etiquetaEditada = area.editada && !area.eliminar
      ? ' <span class="reg-etiqueta-editada">Modificada</span>'
      : ''
    const claseFila = area.eliminar
      ? 'reg-area-eliminada'
      : (indice === areaEditando ? 'reg-area-en-edicion' : '')

    return `
      <tr class="${claseFila}">
        <td>${escapar(area.nombre)}${etiquetaEditada}</td>
        <td>${etiquetaTipo(area.tipo)}</td>
        <td>${area.requiere_lecturas ? 'Sí' : 'No'}</td>
        <td>${accion}</td>
      </tr>
    `
  }).join('')
}

// Pone los datos de un área guardada en los campos de arriba para corregirlos
function empezarEdicion(indice) {
  const area = areas[indice]
  areaEditando = indice

  areaNombre.value = area.nombre
  areaTipo.value = area.tipo
  areaLecturas.checked = area.requiere_lecturas

  // Con historial no se puede cambiar el tipo (el servicio también lo revisa)
  const conOrdenes = (area.total_ordenes ?? 0) > 0
  areaTipo.disabled = conOrdenes
  avisoTipo.hidden = !conOrdenes

  botonAgregarArea.textContent = 'Guardar cambios del área'
  botonCancelarArea.hidden = false
  quitarError(areaNombre)
  dibujarAreas()
  areaNombre.focus()
}

function terminarEdicion() {
  areaEditando = null
  areaTipo.disabled = false
  avisoTipo.hidden = true
  botonAgregarArea.textContent = '+ Agregar a la lista'
  botonCancelarArea.hidden = true

  areaNombre.value = ''
  areaTipo.value = TIPOS_AREA[0].valor
  areaLecturas.checked = areaTipo.value === 'alberca'
  quitarError(areaNombre)
  dibujarAreas()
}

function agregarAreaALista() {
  const nombre = areaNombre.value.trim()

  if (!nombre) {
    marcarError(areaNombre, 'Escribe el nombre del área antes de agregarla.')
    areaNombre.focus()
    return
  }

  // Las marcadas para eliminar (y la que se está editando) no cuentan como repetidas
  const repetida = areas.some((a, i) => i !== areaEditando && !a.eliminar &&
    a.nombre.toLowerCase() === nombre.toLowerCase())
  if (repetida) {
    marcarError(areaNombre, `Ya existe un área llamada "${nombre}" en este condominio.`)
    areaNombre.focus()
    return
  }

  if (areaEditando !== null) {
    // Corrige el área en la lista; se guarda en Supabase al dar Guardar
    const area = areas[areaEditando]
    area.nombre = nombre
    area.tipo = areaTipo.value
    area.requiere_lecturas = areaLecturas.checked
    if (area.id) area.editada = true
    mostrarMensaje('')
    terminarEdicion()
    return
  }

  areas.push({
    nombre,
    tipo: areaTipo.value,
    requiere_lecturas: areaLecturas.checked
  })

  quitarError(areaNombre)
  mostrarMensaje('')
  dibujarAreas()

  // Limpiar para capturar la siguiente
  areaNombre.value = ''
  areaTipo.value = TIPOS_AREA[0].valor
  areaLecturas.checked = areaTipo.value === 'alberca'
  areaNombre.focus()
}

// ---------- Cargar datos al editar ----------

async function cargarCondominio(id) {
  const c = await obtenerCondominio(id)

  titulo.textContent = 'Editar Condominio'
  document.title = 'RUTA | Editar condominio'

  formulario.nombre.value = c.nombre ?? ''
  formulario.direccion.value = c.direccion ?? ''
  formulario.colonia.value = c.colonia ?? ''
  formulario.contacto.value = c.contacto ?? ''
  formulario.telefono.value = (c.telefono ?? '').replace(/\D/g, '')
  formulario.notas_acceso.value = c.notas_acceso ?? ''
  formulario.activo.checked = c.activo

  areas = c.areas
  dibujarAreas()
}

// ---------- Guardar ----------

async function guardar(evento) {
  evento.preventDefault()
  mostrarMensaje('')

  if (!validarFormulario()) return

  const datos = {
    nombre: formulario.nombre.value,
    direccion: formulario.direccion.value,
    colonia: formulario.colonia.value,
    contacto: formulario.contacto.value,
    telefono: formulario.telefono.value,
    notas_acceso: formulario.notas_acceso.value,
    activo: formulario.activo.checked
  }

  const areasNuevas = areas.filter(a => !a.id)
  const idsEliminar = areas.filter(a => a.id && a.eliminar).map(a => a.id)
  const areasEditadas = areas.filter(a => a.id && a.editada && !a.eliminar)

  if (idsEliminar.length > 0) {
    const texto = idsEliminar.length === 1 ? '1 área' : `${idsEliminar.length} áreas`
    if (!confirm(`Se eliminará ${texto} de forma permanente. ¿Continuar?`)) return
  }

  botonGuardar.disabled = true
  botonGuardar.textContent = 'Guardando...'

  try {
    if (idEditar) {
      // Primero se eliminan: si un área no se puede borrar, no se guarda nada más
      await eliminarAreas(idsEliminar)
      for (const area of areasEditadas) await actualizarArea(area.id, area)
      await actualizarCondominio(idEditar, datos)
      if (areasNuevas.length > 0) await agregarAreas(idEditar, areasNuevas)
    } else {
      await crearCondominio(datos, areasNuevas)
    }

    window.location.href = './condominios.html'
  } catch (error) {
    console.error('[Condominios]', error)
    mostrarMensaje(error.message)
    botonGuardar.disabled = false
    botonGuardar.textContent = 'Guardar condominio y áreas'
  }
}

// ---------- Eventos ----------

botonAgregarArea.addEventListener('click', agregarAreaALista)
botonCancelarArea.addEventListener('click', terminarEdicion)

// Enter dentro del nombre del área la agrega, en vez de enviar todo el formulario
areaNombre.addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter') {
    evento.preventDefault()
    agregarAreaALista()
  }
})

// Las albercas casi siempre llevan lecturas: se marca solo, pero se puede cambiar
areaTipo.addEventListener('change', () => {
  areaLecturas.checked = areaTipo.value === 'alberca'
})

listaAreas.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button')
  if (!boton) return

  if (boton.dataset.quitar !== undefined) {
    // Área nueva: solo existe en la lista, se quita de inmediato
    const indice = Number(boton.dataset.quitar)
    areas.splice(indice, 1)
    // Si se quita una fila de arriba, el área en edición se recorre un lugar
    if (areaEditando !== null && indice < areaEditando) areaEditando--
  } else if (boton.dataset.editar !== undefined) {
    empezarEdicion(Number(boton.dataset.editar))
    return
  } else if (boton.dataset.eliminar !== undefined) {
    // Área guardada: se marca y se borra al dar Guardar
    const indice = Number(boton.dataset.eliminar)
    if (indice === areaEditando) terminarEdicion()
    areas[indice].eliminar = true
  } else if (boton.dataset.deshacer !== undefined) {
    const area = areas[Number(boton.dataset.deshacer)]
    const repetida = areas.some(a => a !== area && !a.eliminar &&
      a.nombre.toLowerCase() === area.nombre.toLowerCase())
    if (repetida) {
      mostrarMensaje(`Ya agregaste otra área llamada "${area.nombre}". Quítala antes de deshacer.`)
      return
    }
    area.eliminar = false
  } else {
    return
  }

  mostrarMensaje('')
  dibujarAreas()
})

// Teléfono: al escribir o pegar se quitan letras y símbolos, máximo 10 dígitos
campoTelefono.addEventListener('input', () => {
  campoTelefono.value = campoTelefono.value.replace(/\D/g, '').slice(0, 10)
})

// Al corregir un campo marcado, su error desaparece
formulario.addEventListener('input', (evento) => {
  if (evento.target.classList.contains('reg-campo-error')) quitarError(evento.target)
})

formulario.addEventListener('submit', guardar)

// ---------- Inicio ----------

async function iniciar() {
  const sesion = await getActiveSession()
  if (sesion?.usuario?.rol !== 'administrador') {
    window.location.href = '/'
    return
  }
  nombreUsuario.textContent = sesion.usuario.nombre || 'Usuario'

  areaTipo.innerHTML = TIPOS_AREA
    .map(t => `<option value="${t.valor}">${t.etiqueta}</option>`)
    .join('')
  areaLecturas.checked = areaTipo.value === 'alberca'

  if (idEditar) {
    try {
      await cargarCondominio(idEditar)
    } catch (error) {
      mostrarMensaje(`No se pudo cargar el condominio: ${error.message}`)
      botonGuardar.disabled = true
    }
  } else {
    dibujarAreas()
  }
}

iniciar()