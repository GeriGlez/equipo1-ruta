// Módulo 1 · Registrar / editar condominio con sus áreas
import { getActiveSession } from '../auth/authService.js'
import {
  TIPOS_AREA,
  obtenerCondominio,
  crearCondominio,
  actualizarCondominio,
  agregarAreas
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

// Si la URL trae ?id=14, estamos editando ese condominio
const idEditar = Number(new URLSearchParams(window.location.search).get('id')) || null

// Áreas que se ven en la tabla. Las que ya están guardadas traen "id".
let areas = []

// ---------- Utilidades ----------

function escapar(texto) {
  const div = document.createElement('div')
  div.textContent = texto ?? ''
  return div.innerHTML
}

function mostrarMensaje(texto) {
  mensaje.textContent = texto
  mensaje.hidden = !texto
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

  listaAreas.innerHTML = areas.map((area, indice) => `
    <tr>
      <td>${escapar(area.nombre)}</td>
      <td>${etiquetaTipo(area.tipo)}</td>
      <td>${area.requiere_lecturas ? 'Sí' : 'No'}</td>
      <td>
        ${area.id
          ? '<span class="condo-muted">Registrada</span>'
          : `<button type="button" class="condo-link" data-quitar="${indice}">Quitar</button>`}
      </td>
    </tr>
  `).join('')
}

function agregarAreaALista() {
  const nombre = areaNombre.value.trim()

  if (!nombre) {
    mostrarMensaje('Escribe el nombre del área antes de agregarla.')
    areaNombre.focus()
    return
  }

  const repetida = areas.some(a => a.nombre.toLowerCase() === nombre.toLowerCase())
  if (repetida) {
    mostrarMensaje(`Ya existe un área llamada "${nombre}" en este condominio.`)
    return
  }

  areas.push({
    nombre,
    tipo: areaTipo.value,
    requiere_lecturas: areaLecturas.checked
  })

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
  formulario.telefono.value = c.telefono ?? ''
  formulario.notas_acceso.value = c.notas_acceso ?? ''
  formulario.activo.checked = c.activo

  areas = c.areas
  dibujarAreas()
}

// ---------- Guardar ----------

async function guardar(evento) {
  evento.preventDefault()
  mostrarMensaje('')

  // Si el usuario escribió un área pero olvidó darle "Agregar", se la recordamos
  if (areaNombre.value.trim()) {
    mostrarMensaje('Tienes un área escrita sin agregar. Dale "+ Agregar a la lista" o borra el nombre.')
    return
  }

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

  botonGuardar.disabled = true
  botonGuardar.textContent = 'Guardando...'

  try {
    if (idEditar) {
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
  const boton = evento.target.closest('button[data-quitar]')
  if (!boton) return
  areas.splice(Number(boton.dataset.quitar), 1)
  dibujarAreas()
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