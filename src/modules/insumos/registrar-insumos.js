// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Registro de insumos por visita (técnico)
// Funciona sin conexión: guarda en IndexedDB y se
// envía desde "Pendientes de sincronización".
// ==============================================

import { getActiveSession } from '../auth/authService.js';

import {
  obtenerVisitasLocales,
  obtenerContextoOrden
} from '../visitas/db-local.js';

import {
  obtenerCatalogoLocal,
  obtenerConsumosVisita,
  guardarConsumosVisita
} from './insumos-local.js';


// ---------- Elementos ----------
const formulario = document.querySelector('#form-insumos');
const selectorVisita = document.querySelector('#select-visita');
const panel = document.querySelector('#panel-insumos');
const contenedorLineas = document.querySelector('#lineas');
const botonAgregar = document.querySelector('#agregar-linea');
const botonGuardar = document.querySelector('#guardar-insumos');
const datalist = document.querySelector('#lista-insumos');
const mensajeError = document.querySelector('#insumos-error');
const sinVisitas = document.querySelector('#sin-visitas');
const estadoConexion = document.querySelector('#connection-status');
const nombreUsuario = document.querySelector('.m5-user strong');

let usuario = null;
let catalogo = [];
let visitas = [];
let lineas = [];


// ---------- Utilidades ----------
function normalizar(texto) {

  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

}

function formatearNumero(valor) {

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 2
  }).format(Number(valor) || 0);

}

function mostrarError(texto) {

  mensajeError.textContent = texto || '';
  mensajeError.hidden = !texto;

}

function actualizarEstadoConexion() {

  const enLinea = navigator.onLine;

  estadoConexion.classList.toggle('m5-connection--online', enLinea);
  estadoConexion.classList.toggle('m5-connection--offline', !enLinea);

  estadoConexion.innerHTML = `
    <span class="m5-connection-dot"></span>
    ${enLinea ? 'Con conexión' : 'Sin conexión'}
  `;

}

window.addEventListener('online', actualizarEstadoConexion);
window.addEventListener('offline', actualizarEstadoConexion);
actualizarEstadoConexion();


// ---------- Catálogo ----------
async function cargarCatalogo() {

  // Con red, se actualiza la copia local.
  // El servicio se carga solo si hace falta.
  if (navigator.onLine) {

    try {

      const { sincronizarCatalogoLocal } =
        await import('./insumos-service.js');

      await sincronizarCatalogoLocal();

    } catch (error) {

      console.warn(
        '[RUTA] No se pudo actualizar el catálogo; se usa la copia local.',
        error
      );

    }

  }

  catalogo = await obtenerCatalogoLocal();

  datalist.replaceChildren(
    ...catalogo.map(insumo => {

      const opcion = document.createElement('option');
      opcion.value = insumo.nombre;
      opcion.label = insumo.unidad;

      return opcion;

    })
  );

}

function buscarInsumo(texto) {

  const buscado = normalizar(texto);

  return catalogo.find(i => normalizar(i.nombre) === buscado) || null;

}


// ---------- Líneas del formulario ----------
function refrescarBotonesQuitar() {

  // La primera línea nunca se quita; las demás sí.
  lineas.forEach((linea, indice) => {
    linea.botonQuitar.hidden = lineas.length === 1 || indice === 0;
  });

}

function actualizarUnidad(linea) {

  const insumo = linea.insumo;

  linea.unidad.textContent = insumo ? insumo.unidad : '—';

  if (insumo) {

    linea.ayuda.textContent =
      `Existencia registrada: ${formatearNumero(insumo.stock)} ${insumo.unidad}`;
    linea.ayuda.hidden = false;

  } else {

    linea.ayuda.hidden = true;

  }

}

function crearLinea(datos = {}) {

  const elemento = document.createElement('div');
  elemento.className = 'ins-line';

  elemento.innerHTML = `
    <button type="button" class="ins-line-remove" aria-label="Quitar este insumo">×</button>

    <label class="ins-line-label">
      Insumo
      <span class="ins-search">
        <span class="ins-search-icon" aria-hidden="true">⌕</span>
        <input type="text" class="ins-input ins-line-insumo"
               list="lista-insumos" placeholder="Buscar insumo"
               autocomplete="off">
      </span>
    </label>

    <div class="ins-line-label">
      Unidad
      <div class="ins-unit">—</div>
    </div>

    <div class="ins-line-label">
      Gasto
      <div class="ins-stepper">
        <button type="button" class="ins-step ins-step-minus" aria-label="Disminuir">−</button>
        <input type="number" class="ins-step-value" min="0" step="0.01"
               inputmode="decimal" value="0" aria-label="Cantidad gastada">
        <button type="button" class="ins-step ins-step-plus" aria-label="Aumentar">+</button>
      </div>
    </div>

    <p class="ins-hint" hidden></p>
  `;

  const linea = {
    id: datos.id || null,
    insumo: datos.insumo || null,
    elemento,
    entrada: elemento.querySelector('.ins-line-insumo'),
    unidad: elemento.querySelector('.ins-unit'),
    cantidad: elemento.querySelector('.ins-step-value'),
    ayuda: elemento.querySelector('.ins-hint'),
    botonQuitar: elemento.querySelector('.ins-line-remove')
  };

  linea.entrada.value = datos.texto || '';
  linea.cantidad.value = datos.cantidad ?? 0;

  linea.entrada.addEventListener('input', () => {

    linea.insumo = buscarInsumo(linea.entrada.value);
    actualizarUnidad(linea);

  });

  elemento
    .querySelector('.ins-step-minus')
    .addEventListener('click', () => {

      const actual = Number(linea.cantidad.value) || 0;
      linea.cantidad.value = Math.max(0, Math.round((actual - 1) * 100) / 100);

    });

  elemento
    .querySelector('.ins-step-plus')
    .addEventListener('click', () => {

      const actual = Number(linea.cantidad.value) || 0;
      linea.cantidad.value = Math.round((actual + 1) * 100) / 100;

    });

  linea.botonQuitar.addEventListener('click', () => {

    lineas = lineas.filter(l => l !== linea);
    elemento.remove();
    refrescarBotonesQuitar();

  });

  lineas.push(linea);
  contenedorLineas.append(elemento);

  actualizarUnidad(linea);
  refrescarBotonesQuitar();

  return linea;

}

function limpiarLineas() {

  lineas = [];
  contenedorLineas.replaceChildren();

}

botonAgregar.addEventListener('click', () => {

  const nueva = crearLinea();
  nueva.entrada.focus();

});


// ---------- Visitas del técnico ----------
async function etiquetaVisita(visita) {

  let nombre = visita.orden_referencia || `Orden #${visita.orden_id}`;

  try {

    const contexto = await obtenerContextoOrden(visita.orden_id);

    if (contexto) {

      nombre =
        `${contexto.condominio.nombre} - ${contexto.area.nombre}`;

    }

  } catch (error) {

    console.warn('[RUTA] Sin contexto para la orden', visita.orden_id);

  }

  return `${nombre} (Orden #${visita.orden_id})`;

}

async function cargarVisitas() {

  const todas = await obtenerVisitasLocales();

  visitas = todas
    .filter(v => String(v.tecnico_id) === String(usuario.id))
    .sort((a, b) =>
      String(b.creado_localmente_en)
        .localeCompare(String(a.creado_localmente_en))
    );

  if (!visitas.length) {

    sinVisitas.hidden = false;
    selectorVisita.disabled = true;
    return;

  }

  for (const visita of visitas) {

    selectorVisita.append(
      new Option(await etiquetaVisita(visita), visita.id)
    );

  }

}

async function alSeleccionarVisita() {

  mostrarError('');
  limpiarLineas();

  const visita = visitas.find(v => v.id === selectorVisita.value);

  if (!visita) {

    panel.hidden = true;
    botonGuardar.disabled = true;
    return;

  }

  const guardados = await obtenerConsumosVisita(visita.id);

  if (guardados.length) {

    guardados.forEach(consumo => {

      const insumo =
        catalogo.find(i => i.id === consumo.insumo_id) || null;

      crearLinea({
        id: consumo.id,
        insumo,
        texto: consumo.insumo_nombre,
        cantidad: consumo.cantidad
      });

    });

  } else {

    crearLinea();

  }

  panel.hidden = false;
  botonGuardar.disabled = false;

}

selectorVisita.addEventListener('change', alSeleccionarVisita);


// ---------- Guardar ----------
formulario.addEventListener('submit', async evento => {

  evento.preventDefault();
  mostrarError('');

  const visita = visitas.find(v => v.id === selectorVisita.value);

  if (!visita) {
    mostrarError('Selecciona la visita a la que pertenecen los insumos.');
    return;
  }

  const validas = [];
  const vistos = new Set();

  for (const linea of lineas) {

    const cantidad = Number(linea.cantidad.value);
    const vacia = !linea.entrada.value.trim() && !cantidad;

    // Las líneas totalmente vacías se ignoran.
    if (vacia) {
      continue;
    }

    if (!linea.insumo) {

      mostrarError(
        'Elige un insumo de la lista. ' +
        'Si no aparece, pide que lo agreguen al catálogo.'
      );

      linea.entrada.focus();
      return;

    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {

      mostrarError(`Indica cuánto se gastó de ${linea.insumo.nombre}.`);
      linea.cantidad.focus();
      return;

    }

    if (vistos.has(linea.insumo.id)) {

      mostrarError(
        `${linea.insumo.nombre} está repetido. ` +
        'Suma la cantidad en una sola línea.'
      );

      return;

    }

    vistos.add(linea.insumo.id);

    validas.push({
      id: linea.id,
      insumo_id: linea.insumo.id,
      insumo_nombre: linea.insumo.nombre,
      unidad: linea.insumo.unidad,
      cantidad
    });

  }

  if (!validas.length) {

    const habia = (await obtenerConsumosVisita(visita.id)).length > 0;

    if (!habia) {
      mostrarError('Agrega al menos un insumo con su cantidad.');
      return;
    }

    const confirmar = window.confirm(
      'No dejaste ningún insumo. ' +
      '¿Quitar los insumos registrados en esta visita?'
    );

    if (!confirmar) {
      return;
    }

  }

  botonGuardar.disabled = true;

  try {

    await guardarConsumosVisita(visita, validas);

    alert(
      'Los insumos se guardaron en este dispositivo. ' +
      'Pendiente de sincronización.'
    );

    // Recargar para conservar los ids de las líneas guardadas
    await alSeleccionarVisita();

  } catch (error) {

    console.error('[RUTA] Error al guardar insumos:', error);

    mostrarError(
      'No se pudieron guardar los insumos. ' +
      'Tus datos siguen en pantalla; intenta de nuevo.'
    );

    botonGuardar.disabled = false;

  }

});


// ---------- Volver ----------
document
  .querySelector('.m5-back-button')
  .addEventListener('click', () => {

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/';

  });


// ---------- Inicio ----------
async function iniciar() {

  const sesion = await getActiveSession();

  if (!sesion?.usuario) {
    window.location.href = '/';
    return;
  }

  usuario = sesion.usuario;
  nombreUsuario.textContent = usuario.nombre || 'Usuario';

  await cargarCatalogo();
  await cargarVisitas();

  // Acceso directo desde otra pantalla: ?visita=<id local>
  const preseleccion =
    new URLSearchParams(window.location.search).get('visita');

  if (preseleccion && visitas.some(v => v.id === preseleccion)) {

    selectorVisita.value = preseleccion;
    await alSeleccionarVisita();

  }

}

iniciar().catch(error => {

  console.error('[RUTA] Error al iniciar insumos:', error);
  mostrarError('No fue posible cargar la pantalla de insumos.');

});
