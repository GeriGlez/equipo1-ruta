// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Reporte de insumos por visita (administrador)
// ==============================================

import { getActiveSession } from '../auth/authService.js';
import { obtenerReporteInsumos } from './insumos-service.js';


const lista = document.querySelector('#reporte-lista');
const buscador = document.querySelector('#buscar-reporte');
const mensaje = document.querySelector('#reporte-mensaje');

const dialogo = document.querySelector('#dialogo-detalle');
const detalleTitulo = document.querySelector('#detalle-titulo');
const detalleMeta = document.querySelector('#detalle-meta');
const detalleCuerpo = document.querySelector('#detalle-cuerpo');

let reporte = [];


// ---------- Utilidades ----------
function normalizar(texto) {

  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

}

function formatearFecha(fechaIso) {

  const fecha = new Date(fechaIso);

  if (!fechaIso || Number.isNaN(fecha.getTime())) {
    return 'Fecha no disponible';
  }

  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(fecha);

}

function formatearNumero(valor) {

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 2
  }).format(Number(valor) || 0);

}

function mostrarMensaje(texto, esError = false) {

  mensaje.textContent = texto || '';
  mensaje.hidden = !texto;
  mensaje.classList.toggle('ins-message--error', esError);

}


// ---------- Tarjetas ----------
function crearTarjeta(grupo) {

  const tarjeta = document.createElement('article');
  tarjeta.className = 'ins-card';

  const titulo = document.createElement('h2');
  titulo.className = 'ins-card-title';
  titulo.textContent = grupo.titulo;

  const responsable = document.createElement('div');
  responsable.className = 'ins-card-owner';

  const icono = document.createElement('img');
  icono.src = '/cuenta-de-usuario.png';
  icono.alt = '';
  icono.setAttribute('aria-hidden', 'true');

  const nombre = document.createElement('span');
  nombre.textContent = `Responsable: ${grupo.responsable}`;

  responsable.append(icono, nombre);

  const pie = document.createElement('div');
  pie.className = 'ins-card-footer';

  const total = document.createElement('span');
  total.textContent = grupo.items.length === 1
    ? '1 insumo utilizado'
    : `${grupo.items.length} insumos utilizados`;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'ins-link-button';
  boton.textContent = 'Ver más información';
  boton.addEventListener('click', () => abrirDetalle(grupo));

  pie.append(total, boton);
  tarjeta.append(titulo, responsable, pie);

  return tarjeta;

}

function renderizar() {

  const texto = normalizar(buscador.value);

  const visibles = reporte.filter(grupo => {

    if (!texto) {
      return true;
    }

    return normalizar(
      `${grupo.titulo} ${grupo.responsable} ` +
      grupo.items.map(i => i.nombre).join(' ')
    ).includes(texto);

  });

  lista.replaceChildren(...visibles.map(crearTarjeta));

  if (!visibles.length) {

    mostrarMensaje(
      reporte.length
        ? 'Ninguna visita coincide con la búsqueda.'
        : 'Todavía no hay insumos registrados en visitas.'
    );

  } else {

    mostrarMensaje('');

  }

}


// ---------- Detalle ----------
function abrirDetalle(grupo) {

  detalleTitulo.textContent = grupo.titulo;

  detalleMeta.textContent =
    `Responsable: ${grupo.responsable} · ${formatearFecha(grupo.fecha)}`;

  detalleCuerpo.replaceChildren(
    ...grupo.items.map(item => {

      const fila = document.createElement('tr');

      const celdaNombre = document.createElement('td');
      celdaNombre.textContent = item.nombre;

      const celdaCantidad = document.createElement('td');
      celdaCantidad.textContent =
        `${formatearNumero(item.cantidad)} ${item.unidad}`.trim();

      fila.append(celdaNombre, celdaCantidad);

      return fila;

    })
  );

  dialogo.showModal();

}

document
  .querySelector('#cerrar-detalle')
  .addEventListener('click', () => dialogo.close());

dialogo.addEventListener('click', evento => {

  if (evento.target === dialogo) {
    dialogo.close();
  }

});


// ---------- Inicio ----------
buscador.addEventListener('input', renderizar);

async function iniciar() {

  const sesion = await getActiveSession();

  if (!sesion || sesion.usuario?.rol !== 'administrador') {
    window.location.href = '/';
    return;
  }

  document.querySelector('#admin-name').textContent =
    sesion.usuario.nombre || 'Usuario';

  if (!navigator.onLine) {

    mostrarMensaje(
      'Sin conexión: el reporte requiere internet.',
      true
    );

    return;

  }

  mostrarMensaje('Cargando reporte…');

  try {

    reporte = await obtenerReporteInsumos();
    renderizar();

  } catch (error) {

    console.error('[RUTA] Error al cargar el reporte:', error);

    mostrarMensaje(
      'No fue posible cargar el reporte de insumos.',
      true
    );

  }

}

iniciar();
