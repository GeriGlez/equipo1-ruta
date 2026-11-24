// Módulo 1 · Pantalla de listado de condominios
import { getActiveSession } from '../auth/authService.js'
import {
  TIPOS_AREA,
  POR_PAGINA,
  listarCondominios,
  cambiarEstadoCondominio
} from './condominiosService.js'

// ---------- Elementos de la pantalla ----------
const buscador = document.querySelector('#buscar')
const filtroTipo = document.querySelector('#filtro-tipo')
const filtroEstado = document.querySelector('#filtro-estado')
const cuerpoTabla = document.querySelector('#tabla-body')
const textoMostrando = document.querySelector('#texto-mostrando')
const contenedorPaginas = document.querySelector('#paginas')
const mensaje = document.querySelector('#mensaje')
const nombreUsuario = document.querySelector('#nombre-usuario')
const dialogo = document.querySelector('#dialogo-estado')

// Lo que el usuario tiene elegido en este momento
const estado = {
  busqueda: '',
  tipoArea: '',
  estado: 'activos',
  pagina: 1
}

// ---------- Utilidades ----------

// Evita que un texto guardado en la base se interprete como HTML (XSS)
function escapar(texto) {
  const div = document.createElement('div')
  div.textContent = texto ?? ''
  return div.innerHTML
}

function mostrarMensaje(texto) {
  mensaje.textContent = texto
  mensaje.hidden = !texto
}

// ---------- Dibujar la tabla ----------

function filaCondominio(c) {
  const colonia = c.colonia ? `<strong>${escapar(c.colonia)}</strong><br>` : ''
  const contacto = [c.contacto, c.telefono].filter(Boolean).map(escapar).join('<br>') || '—'
  const etiquetaEstado = c.activo
    ? '<span class="badge badge-success">Activo</span>'
    : '<span class="badge condo-badge-inactivo">Inactivo</span>'
  const textoBoton = c.activo ? 'Desactivar' : 'Activar'

  return `
    <tr>
      <td class="condo-nombre">${escapar(c.nombre)}</td>
      <td data-label="Colonia / Dir.">${colonia}<span class="condo-muted">${escapar(c.direccion)}</span></td>
      <td data-label="Áreas" class="condo-centro">${c.total_areas}</td>
      <td data-label="Contacto / Tel">${contacto}</td>
      <td data-label="Estado">${etiquetaEstado}</td>
      <td class="condo-acciones">
        <a href="./registrar-condominio.html?id=${c.id}" class="condo-link">Editar</a>
        <button type="button" class="condo-link" data-id="${c.id}" data-activo="${c.activo}">
          ${textoBoton}
        </button>
      </td>
    </tr>
  `
}

function dibujarPaginacion({ total, pagina, totalPaginas }) {
  const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1
  const hasta = Math.min(pagina * POR_PAGINA, total)
  textoMostrando.textContent = `Mostrando ${desde} - ${hasta} de ${total} condominios`

  let botones = `<button type="button" data-pagina="${pagina - 1}" ${pagina === 1 ? 'disabled' : ''}>&lt; Anterior</button>`
  for (let i = 1; i <= totalPaginas; i++) {
    botones += `<button type="button" data-pagina="${i}" class="${i === pagina ? 'activa' : ''}">${i}</button>`
  }
  botones += `<button type="button" data-pagina="${pagina + 1}" ${pagina === totalPaginas ? 'disabled' : ''}>Siguiente &gt;</button>`

  contenedorPaginas.innerHTML = botones
}

async function cargar() {
  mostrarMensaje('')
  try {
    const resultado = await listarCondominios(estado)

    cuerpoTabla.innerHTML = resultado.condominios.length
      ? resultado.condominios.map(filaCondominio).join('')
      : '<tr><td colspan="6" class="condo-vacio">No se encontraron condominios con esos filtros.</td></tr>'

    dibujarPaginacion(resultado)
  } catch (error) {
    console.error('[Condominios]', error)
    cuerpoTabla.innerHTML = ''
    mostrarMensaje(`No se pudieron cargar los condominios: ${error.message}`)
  }
}

// ---------- Ventana de confirmación ----------

// Abre la ventana propia en lugar del confirm() del navegador.
// Devuelve una promesa: true si el usuario confirma, false si cancela,
// presiona Esc o hace clic fuera de la ventana.
function confirmarCambioEstado(nombre, activar) {
  dialogo.querySelector('#dialogo-titulo').textContent = activar
    ? 'Activar condominio'
    : 'Desactivar condominio'
  dialogo.querySelector('#dialogo-texto').textContent = activar
    ? `"${nombre}" volverá a aparecer en Activos y se le podrán programar servicios.`
    : `"${nombre}" ya no se podrá usar para programar servicios. Sus áreas, órdenes e historial se conservan y puedes volver a activarlo cuando quieras.`

  const botonConfirmar = dialogo.querySelector('#dialogo-confirmar')
  botonConfirmar.textContent = activar ? 'Sí, activar' : 'Sí, desactivar'
  botonConfirmar.classList.toggle('condo-dialogo-peligro', !activar)

  dialogo.returnValue = ''
  dialogo.showModal()

  return new Promise((resolve) => {
    dialogo.addEventListener('close', () => resolve(dialogo.returnValue === 'confirmar'), { once: true })
  })
}

// Clic en el fondo oscuro (fuera de la ventana) = cancelar
dialogo.addEventListener('click', (evento) => {
  if (evento.target === dialogo) dialogo.close('')
})

// ---------- Eventos ----------

// Espera a que el usuario deje de escribir 300 ms antes de buscar
let temporizador
buscador.addEventListener('input', () => {
  clearTimeout(temporizador)
  temporizador = setTimeout(() => {
    estado.busqueda = buscador.value
    estado.pagina = 1
    cargar()
  }, 300)
})

filtroTipo.addEventListener('change', () => {
  estado.tipoArea = filtroTipo.value
  estado.pagina = 1
  cargar()
})

filtroEstado.addEventListener('change', () => {
  estado.estado = filtroEstado.value
  estado.pagina = 1
  cargar()
})

contenedorPaginas.addEventListener('click', (evento) => {
  const boton = evento.target.closest('button[data-pagina]')
  if (!boton || boton.disabled) return
  estado.pagina = Number(boton.dataset.pagina)
  cargar()
})

// Un solo listener para todos los botones Activar/Desactivar de la tabla
cuerpoTabla.addEventListener('click', async (evento) => {
  const boton = evento.target.closest('button[data-id]')
  if (!boton) return

  const activar = boton.dataset.activo !== 'true'
  const nombre = boton.closest('tr').querySelector('.condo-nombre').textContent
  if (!await confirmarCambioEstado(nombre, activar)) return

  boton.disabled = true
  try {
    await cambiarEstadoCondominio(Number(boton.dataset.id), activar)
    await cargar()
  } catch (error) {
    mostrarMensaje(error.message)
    boton.disabled = false
  }
})

// ---------- Inicio ----------

async function iniciar() {
  // Solo el administrador entra a esta pantalla
  const sesion = await getActiveSession()
  if (sesion?.usuario?.rol !== 'administrador') {
    window.location.href = '/'
    return
  }
  nombreUsuario.textContent = sesion.usuario.nombre || 'Usuario'

  filtroTipo.innerHTML += TIPOS_AREA
    .map(t => `<option value="${t.valor}">${t.etiqueta}</option>`)
    .join('')

  cargar()
}

iniciar()