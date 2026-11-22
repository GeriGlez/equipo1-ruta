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
} from '../pendientes_sync/db-local.js';

import {
  obtenerCatalogoLocal,
  obtenerConsumosVisita,
  agregarConsumosVisita,
  obtenerConsumoPendientePorInsumo
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
const historial = document.querySelector('#historial-insumos');
const historialLista = document.querySelector('#historial-lista');
const estadoConexion = document.querySelector('#connection-status');
const nombreUsuario = document.querySelector('.m5-user strong');

let usuario = null;
let catalogo = [];
let visitas = [];
let lineas = [];
let guardando = false;


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

// Existencia que se puede consumir: la existencia conocida del insumo
// menos lo ya capturado en este dispositivo que Supabase aún no descuenta.
// Con red se consulta el valor actual de Supabase; sin red se usa la copia
// local del catálogo.
async function existenciaDisponible(insumo, { consultarServidor = false } = {}) {

  let base = Number(insumo.existencia ?? insumo.stock ?? 0);

  if (consultarServidor && navigator.onLine) {

    try {

      const { consultarExistenciaServidor } =
        await import('./insumos-service.js');

      const actual = await consultarExistenciaServidor(insumo.id);

      if (actual !== null) {
        base = actual;
      }

    } catch (error) {

      console.warn(
        '[RUTA] No se pudo consultar la existencia; se usa la copia local.',
        error
      );

    }

  }

  const pendientes = await obtenerConsumoPendientePorInsumo();

  return Math.max(
    0,
    Math.round((base - (pendientes.get(insumo.id) || 0)) * 1000) / 1000
  );

}

function actualizarUnidad(linea) {

  const insumo = linea.insumo;

  linea.unidad.textContent = insumo ? insumo.unidad : '—';

  if (!insumo) {

    linea.ayuda.hidden = true;
    return;

  }

  existenciaDisponible(insumo)
    .then(disponible => {

      // La línea pudo cambiar de insumo mientras se calculaba.
      if (linea.insumo !== insumo) {
        return;
      }

      linea.ayuda.textContent =
        `Existencia disponible: ${formatearNumero(disponible)} ${insumo.unidad}`;
      linea.ayuda.hidden = false;

    })
    .catch(() => {
      linea.ayuda.hidden = true;
    });

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
// Fecha local (AAAA-MM-DD) de un valor de fecha. Un texto solo con la
// fecha se toma tal cual; una fecha con hora se pasa a la zona horaria
// del dispositivo, así no cambia de día por diferencias de zona.
function fechaLocal(valor) {

  if (!valor) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    return String(valor);
  }

  const fecha = new Date(valor);

  if (Number.isNaN(fecha.getTime())) {
    return null;
  }

  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');

  return `${fecha.getFullYear()}-${mes}-${dia}`;

}

function fechaDeVisita(visita) {

  const fecha = new Date(
    visita.fecha_visita_en || visita.creado_localmente_en
  );

  return Number.isNaN(fecha.getTime()) ? null : fecha;

}

function esVisitaDeHoy(visita) {

  const diaVisita = fechaLocal(
    visita.fecha_visita_en || visita.creado_localmente_en
  );

  return diaVisita !== null && diaVisita === fechaLocal(new Date());

}

// Nombre de la visita: condominio y área de su orden (datos que ya
// se guardaron en el dispositivo) y la hora de entrada.
async function etiquetaVisita(visita) {

  let lugar = null;

  try {

    const contexto = await obtenerContextoOrden(visita.orden_id);

    const condominio = contexto?.condominio?.nombre;
    const area = contexto?.area?.nombre;

    lugar = [condominio, area].filter(Boolean).join(' - ') || null;

  } catch (error) {

    console.warn('[RUTA] Sin contexto para la orden', visita.orden_id);

  }

  let nombre = 'Visita';

  if (lugar) {
    nombre = `Visita: ${lugar}`;
  } else if (visita.visita_servidor_id) {
    nombre = `Visita #${visita.visita_servidor_id}`;
  }

  return visita.hora_entrada
    ? `${nombre} · ${visita.hora_entrada}`
    : nombre;

}

// Una visita real se identifica por su id en Supabase cuando ya lo
// tiene; si no, por su id local. Así dos copias locales de la misma
// visita (por ejemplo "uuid" y "servidor:<id>") cuentan una sola vez,
// mientras que visitas distintas de una misma orden se conservan.
function claveVisita(visita) {

  return visita.visita_servidor_id
    ? `srv:${visita.visita_servidor_id}`
    : `loc:${visita.id}`;

}

async function quitarVisitasDuplicadas(lista) {

  const grupos = new Map();

  for (const visita of lista) {

    const clave = claveVisita(visita);

    if (!grupos.has(clave)) {
      grupos.set(clave, []);
    }

    grupos.get(clave).push(visita);

  }

  const unicas = [];

  for (const grupo of grupos.values()) {

    if (grupo.length === 1) {
      unicas.push(grupo[0]);
      continue;
    }

    // De las copias, se conserva la que ya tiene insumos guardados,
    // luego la que tiene cambios pendientes y luego la de id local.
    let mejor = null;
    let mejorPuntaje = -1;

    for (const visita of grupo) {

      const consumos = await obtenerConsumosVisita(visita.id);

      const puntaje =
        (consumos.length ? 4 : 0) +
        (visita.pendiente_envio === true || visita.estado_envio === 'pendiente' ? 2 : 0) +
        (String(visita.id).startsWith('servidor:') ? 0 : 1);

      if (puntaje > mejorPuntaje) {
        mejor = visita;
        mejorPuntaje = puntaje;
      }

    }

    unicas.push(mejor);

  }

  return unicas;

}

async function cargarVisitas() {

  // Conserva solo la opción "Selecciona la visita".
  selectorVisita.length = 1;
  selectorVisita.disabled = false;

  // Con red, se trae la copia más reciente de las visitas del técnico
  // (como hace la bitácora); sin red se usan las que ya están guardadas.
  if (navigator.onLine) {

    try {

      const { actualizarVisitasDesdeServidor } =
        await import('./insumos-service.js');

      await actualizarVisitasDesdeServidor(usuario.id);

    } catch (error) {

      console.warn(
        '[RUTA] No se pudieron actualizar las visitas; se usan las locales.',
        error
      );

    }

  }

  let todas;

  try {

    todas = await obtenerVisitasLocales();

  } catch (error) {

    // Un error de lectura NO es lo mismo que "no hay visitas".
    console.error('[RUTA] No se pudieron leer las visitas locales:', error);
    mostrarError('No fue posible leer las visitas guardadas en este dispositivo.');
    selectorVisita.disabled = true;
    return;

  }

  // Solo las visitas del técnico y de la fecha de hoy en este dispositivo.
  const delTecnico = todas.filter(
    v =>
      String(v.tecnico_id) === String(usuario.id) &&
      esVisitaDeHoy(v)
  );

  visitas = (await quitarVisitasDuplicadas(delTecnico))
    .sort((a, b) =>
      (fechaDeVisita(b)?.getTime() || 0) - (fechaDeVisita(a)?.getTime() || 0)
    );

  // Sin visitas no hay nada que elegir: el selector queda deshabilitado.
  if (!visitas.length) {

    selectorVisita.options[0].textContent = 'Sin visitas hoy';
    selectorVisita.disabled = true;
    return;

  }

  for (const visita of visitas) {

    selectorVisita.append(
      new Option(await etiquetaVisita(visita), visita.id)
    );

  }

}

// Muestra, solo para consulta, lo que la visita ya tiene registrado.
// No se carga en el formulario: cada captura empieza vacía.
async function mostrarHistorial(visita) {

  const guardados = await obtenerConsumosVisita(visita.id);

  historialLista.replaceChildren(
    ...guardados.map(consumo => {

      const item = document.createElement('li');
      const nombre = document.createElement('span');
      const cantidad = document.createElement('strong');

      nombre.textContent = consumo.insumo_nombre;
      cantidad.textContent =
        `${formatearNumero(consumo.cantidad)} ${consumo.unidad || ''}`.trim();

      item.append(nombre, cantidad);
      return item;

    })
  );

  historial.hidden = !guardados.length;

}

async function alSeleccionarVisita() {

  mostrarError('');
  limpiarLineas();

  const visita = visitas.find(v => v.id === selectorVisita.value);

  if (!visita) {

    historial.hidden = true;
    panel.hidden = true;
    botonGuardar.disabled = true;
    return;

  }

  await mostrarHistorial(visita);

  // Captura nueva: una línea en blanco, sin datos de capturas anteriores.
  crearLinea();

  panel.hidden = false;
  botonGuardar.disabled = false;

}

// Deja el formulario vacío y listo para un nuevo registro.
// No toca IndexedDB: los consumos guardados siguen en el dispositivo.
function limpiarFormulario() {

  limpiarLineas();
  historialLista.replaceChildren();
  historial.hidden = true;
  panel.hidden = true;
  selectorVisita.value = '';
  botonGuardar.disabled = true;
  mostrarError('');

}

selectorVisita.addEventListener('change', alSeleccionarVisita);


// ---------- Guardar ----------
formulario.addEventListener('submit', async evento => {

  evento.preventDefault();

  if (guardando) {
    return;
  }

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
      insumo_id: linea.insumo.id,
      insumo_nombre: linea.insumo.nombre,
      unidad: linea.insumo.unidad,
      cantidad
    });

  }

  if (!validas.length) {

    mostrarError('Agrega al menos un insumo con su cantidad.');
    return;

  }

  guardando = true;
  botonGuardar.disabled = true;

  // Validación de existencias: con red contra Supabase, sin red con la
  // copia local. Se descuentan los consumos pendientes de sincronizar.
  try {

    for (const linea of validas) {

      const insumo = catalogo.find(i => i.id === linea.insumo_id);
      const disponible = await existenciaDisponible(insumo, { consultarServidor: true });

      if (linea.cantidad > disponible) {

        mostrarError(
          `No hay suficiente existencia de ${linea.insumo_nombre}. ` +
          `Disponible: ${formatearNumero(disponible)} ${linea.unidad}.`
        );

        guardando = false;
        botonGuardar.disabled = false;
        return;

      }

    }

  } catch (error) {

    console.error('[RUTA] Error al validar existencias:', error);
    mostrarError('No fue posible validar las existencias. Intenta de nuevo.');
    guardando = false;
    botonGuardar.disabled = false;
    return;

  }

  try {

    await agregarConsumosVisita(visita, validas);

    // Los datos temporales se limpian antes de avisar.
    limpiarFormulario();

    alert(
      'Los insumos se guardaron en este dispositivo. ' +
      'Pendiente de sincronización.'
    );

  } catch (error) {

    console.error('[RUTA] Error al guardar insumos:', error);

    mostrarError(
      'No se pudieron guardar los insumos. ' +
      'Tus datos siguen en pantalla; intenta de nuevo.'
    );

    botonGuardar.disabled = false;

  } finally {

    guardando = false;

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
