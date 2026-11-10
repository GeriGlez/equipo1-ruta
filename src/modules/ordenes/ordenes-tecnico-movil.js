// =============================================================================
// RUTA - VISTA MÓVIL DE ÓRDENES DE SERVICIO PARA EL TÉCNICO (HU-05 / MÓDULO 5)
// Conectado a Supabase e IndexedDB (soporte Online / Offline).
// =============================================================================

import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js';
import {
  guardarContextoOrden,
  obtenerContextoOrden
} from '../pendientes_sync/db-local.js';
import {
  cargarCatalogosCompletos,
  consultarOrdenesServicio
} from './ordenes-db.js';

// Referencias del DOM
const nombreHeader = document.getElementById('tecnico-nombre-header');
const btnVolverInicio = document.getElementById('btn-volver-inicio');
const btnContraerTodas = document.getElementById('btn-contraer-todas');
const connDot = document.getElementById('conn-dot-movil');
const connText = document.getElementById('conn-text-movil');
const tituloFechaActual = document.getElementById('titulo-fecha-actual');
const ordersCounter = document.getElementById('orders-counter');
const ordersContainer = document.getElementById('orders-Container');
const botonesFiltro = document.querySelectorAll('.filtro-btn');
const inputFiltroFecha = document.getElementById('input-filtro-fecha-movil');

// Estado local de la vista
let usuarioActual = null;
let todasLasOrdenes = [];
let mapaCondominios = new Map();
let mapaAreas = new Map();
let mapaServicios = new Map();
let modoFiltro = 'todas'; // 'todas' | 'hoy' | 'fecha'
let fechaSeleccionada = obtenerFechaLocalISO();

// =============================================================================
// 1. UTILIDADES DE FECHA Y FORMATO
// =============================================================================

function obtenerFechaLocalISO() {
  const ahora = new Date();
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const d = String(ahora.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatearFechaEncabezado(fechaISO) {
  const partes = String(fechaISO || '').split('-').map(Number);
  const fecha = partes.length === 3
    ? new Date(partes[0], partes[1] - 1, partes[2])
    : new Date();

  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const nombreDia = dias[fecha.getDay()];
  const diaMes = String(fecha.getDate()).padStart(2, '0');
  const nombreMes = meses[fecha.getMonth()];
  const anio = fecha.getFullYear();

  return `${nombreDia} ${diaMes}, ${nombreMes} ${anio}`;
}

function formatearFechaCorta(fechaISO) {
  if (!fechaISO) return 'Sin fecha';
  const partes = String(fechaISO).split('-').map(Number);
  if (partes.length !== 3) return fechaISO;
  const fecha = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(fecha);
}

function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function formatearFolioOrden(id) {
  if (!id) return 'Orden Local';
  const num = Number(id);
  return `Orden #${num < 10 ? `0${num}` : num}`;
}

// =============================================================================
// 2. ESTADO DE CONEXIÓN
// =============================================================================

function actualizarIndicadorConexion() {
  const enLinea = navigator.onLine;
  if (connDot) {
    connDot.className = `w-2 h-2 rounded-full ${enLinea ? 'bg-emerald-500' : 'bg-amber-500'}`;
  }
  if (connText) {
    connText.textContent = enLinea ? 'Con conexión' : 'Sin conexión';
  }
}

window.addEventListener('online', async () => {
  actualizarIndicadorConexion();
  await cargarDatosYRenderizar();
});

window.addEventListener('offline', actualizarIndicadorConexion);

// =============================================================================
// 3. CARGA DE CATÁLOGOS Y ÓRDENES REALES DESDE SUPABASE / INDEXEDDB
// =============================================================================

async function cargarCatalogosConNotas() {
  const base = await cargarCatalogosCompletos();
  let condominios = base.condominios || [];
  const areas = base.areas || [];
  const servicios = base.servicios || [];

  // En línea, traemos también notas_acceso y direccion de condominios
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('condominios')
        .select('id, nombre, direccion, colonia, notas_acceso, activo')
        .order('nombre', { ascending: true });

      if (!error && Array.isArray(data)) {
        condominios = data;
      }
    } catch (err) {
      console.warn('[Órdenes Técnico] Usando condominios locales:', err);
    }
  }

  mapaCondominios = new Map(condominios.map(c => [Number(c.id), c]));
  mapaAreas = new Map(areas.map(a => [Number(a.id), a]));
  mapaServicios = new Map(servicios.map(s => [Number(s.id), s]));
}

async function sincronizarContextosParaVisitas(ordenesLista) {
  if (!usuarioActual) return;

  for (const orden of ordenesLista) {
    if (!orden.id) continue;
    const condo = mapaCondominios.get(Number(orden.condominio_id));
    const area = mapaAreas.get(Number(orden.area_id));
    const serv = mapaServicios.get(Number(orden.servicio_id));

    if (condo && area && serv) {
      try {
        await guardarContextoOrden({
          orden_id: Number(orden.id),
          tecnico_id: usuarioActual.id,
          tecnico_nombre: usuarioActual.nombre,
          cuadrilla_id: orden.cuadrilla_id ?? null,
          fecha_programada: orden.fecha_programada,
          estado: orden.estado,
          condominio: {
            id: condo.id,
            nombre: condo.nombre,
            notas_acceso: condo.notas_acceso || null
          },
          area: {
            id: area.id,
            nombre: area.nombre,
            tipo: area.tipo,
            requiere_lecturas: Boolean(area.requiere_lecturas)
          },
          servicio: {
            id: serv.id,
            nombre: serv.nombre
          }
        });
      } catch (e) {
        console.warn('[Órdenes Técnico] No se pudo guardar contexto local:', e);
      }
    }
  }
}

async function cargarDatosYRenderizar() {
  try {
    await cargarCatalogosConNotas();
    const resultado = await consultarOrdenesServicio();
    const activas = (resultado.ordenes || []).filter(
      o => o.activo !== false && o.estado !== 'cancelada' && o.operacion_pendiente !== 'eliminar'
    );

    // Ordenar: primero las de hoy, luego por fecha programada y por ID ascendente
    const hoy = obtenerFechaLocalISO();
    activas.sort((a, b) => {
      const aEsHoy = a.fecha_programada === hoy ? 0 : 1;
      const bEsHoy = b.fecha_programada === hoy ? 0 : 1;
      if (aEsHoy !== bEsHoy) return aEsHoy - bEsHoy;
      if (a.fecha_programada !== b.fecha_programada) {
        return String(a.fecha_programada).localeCompare(String(b.fecha_programada));
      }
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    todasLasOrdenes = activas;
    await sincronizarContextosParaVisitas(todasLasOrdenes);
    renderizarOrdenes();
  } catch (error) {
    console.error('[Órdenes Técnico] Error al consultar órdenes:', error);
    ordersContainer.innerHTML = `
      <div class="bg-red-50 border border-red-200 text-red-800 rounded-xl p-4 text-xs font-semibold text-center">
        No fue posible cargar las órdenes de servicio: ${escaparHTML(error.message)}
      </div>
    `;
  }
}

// =============================================================================
// 4. RENDERIZADO DEL ACORDEÓN DE ÓRDENES (DISEÑO MÓVIL DEL TÉCNICO)
// =============================================================================

function obtenerConfiguracionEstado(estadoRaw) {
  const estado = String(estadoRaw || 'programada').toLowerCase();

  if (estado === 'en_proceso') {
    return {
      etiqueta: 'EN PROGRESO',
      badgeClass: 'status-badge bg-amber-400 text-black text-[11px] font-extrabold px-3 py-1 rounded-md shadow-sm tracking-wide',
      dataState: 'running'
    };
  }

  if (estado === 'completada') {
    return {
      etiqueta: 'COMPLETADA',
      badgeClass: 'status-badge bg-[#3df235] text-black text-[11px] font-extrabold px-3 py-1 rounded-md shadow-sm tracking-wide',
      dataState: 'done'
    };
  }

  if (estado === 'asignada') {
    return {
      etiqueta: 'ASIGNADA',
      badgeClass: 'status-badge bg-[#0099ff] text-black text-[11px] font-extrabold px-3 py-1 rounded-md shadow-sm tracking-wide',
      dataState: 'idle'
    };
  }

  return {
    etiqueta: 'PROGRAMADA',
    badgeClass: 'status-badge bg-[#0099ff] text-black text-[11px] font-extrabold px-3 py-1 rounded-md shadow-sm tracking-wide',
    dataState: 'idle'
  };
}

function construirBotonAccionHTML(orden, dataState) {
  const ordenId = orden.id;

  if (dataState === 'running') {
    return `
      <div class="space-y-2 pt-1">
        <button
          type="button"
          data-action="toggle-status"
          data-order-id="${ordenId}"
          data-state="running"
          class="w-full bg-amber-400 hover:bg-amber-500 text-black font-extrabold py-3 rounded-xl flex items-center justify-center gap-2.5 text-base shadow-md transition-all active:scale-[0.98]"
        >
          <svg class="w-5 h-5 fill-current" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
          </svg>
          <span>Finalizar Trabajo</span>
        </button>

        ${
          ordenId
            ? `<a
                href="/src/modules/visitas/Registrar_Visita_Movil.html?orden_id=${ordenId}"
                class="w-full bg-[#045174] hover:bg-[#033f5a] text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs shadow-sm transition-all"
              >
                <span>📋 Registrar / Editar Visita en Bitácora</span>
              </a>`
            : ''
        }
      </div>
    `;
  }

  if (dataState === 'done') {
    return `
      <div class="space-y-2 pt-1">
        <button
          type="button"
          data-action="toggle-status"
          data-order-id="${ordenId}"
          data-state="done"
          class="w-full bg-gray-300 text-gray-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 text-sm cursor-pointer transition-all"
        >
          <span>✓ Trabajo Registrado (Toque para reiniciar)</span>
        </button>

        ${
          ordenId
            ? `<a
                href="/src/modules/visitas/Registrar_Visita_Movil.html?orden_id=${ordenId}"
                class="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 rounded-xl flex items-center justify-center gap-2 text-xs transition-all"
              >
                <span>📋 Ver / Editar Visita en Bitácora</span>
              </a>`
            : ''
        }
      </div>
    `;
  }

  return `
    <div class="space-y-2 pt-1">
      <button
        type="button"
        data-action="toggle-status"
        data-order-id="${ordenId}"
        data-state="idle"
        class="w-full bg-[#3df235] hover:bg-[#32d92b] text-black font-extrabold py-3 rounded-xl flex items-center justify-center gap-2.5 text-base shadow-[0_3px_10px_rgba(61,242,53,0.4)] transition-all active:scale-[0.98]"
      >
        <svg class="w-5 h-5 fill-current" viewBox="0 0 20 20">
          <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"/>
        </svg>
        <span>Iniciar Trabajo</span>
      </button>

      ${
        ordenId
          ? `<a
              href="/src/modules/visitas/Registrar_Visita_Movil.html?orden_id=${ordenId}"
              class="w-full bg-white hover:bg-gray-100 text-[#045174] border border-[#045174]/30 font-bold py-2 rounded-xl flex items-center justify-center gap-2 text-xs transition-all"
            >
              <span>📋 Ir a Registrar Visita</span>
            </a>`
          : ''
      }
    </div>
  `;
}

async function renderizarOrdenes() {
  const hoyISO = obtenerFechaLocalISO();

  let filtradas = todasLasOrdenes;
  if (modoFiltro === 'hoy') {
    filtradas = todasLasOrdenes.filter(o => o.fecha_programada === hoyISO);
    tituloFechaActual.textContent = formatearFechaEncabezado(hoyISO);
    ordersCounter.textContent =
      filtradas.length === 1
        ? '1 Orden programada para hoy'
        : `${filtradas.length} Órdenes programadas para hoy`;
  } else if (modoFiltro === 'fecha' && fechaSeleccionada) {
    filtradas = todasLasOrdenes.filter(o => o.fecha_programada === fechaSeleccionada);
    tituloFechaActual.textContent = formatearFechaEncabezado(fechaSeleccionada);
    ordersCounter.textContent =
      filtradas.length === 1
        ? '1 Orden programada en esta fecha'
        : `${filtradas.length} Órdenes programadas en esta fecha`;
  } else {
    tituloFechaActual.textContent = formatearFechaEncabezado(hoyISO);
    ordersCounter.textContent =
      filtradas.length === 1
        ? '1 Orden activa en el sistema'
        : `${filtradas.length} Órdenes activas en el sistema`;
  }

  if (filtradas.length === 0) {
    ordersContainer.innerHTML = `
      <div class="bg-[#efefef] rounded-xl p-6 text-center border border-gray-200 my-4">
        <p class="text-sm font-extrabold text-gray-800">No hay órdenes para mostrar</p>
        <p class="text-xs text-gray-600 mt-1">
          No se encontraron órdenes programadas con el filtro seleccionado.
        </p>
      </div>
    `;
    return;
  }

  const tarjetasHTML = [];

  for (let idx = 0; idx < filtradas.length; idx++) {
    const orden = filtradas[idx];
    const abiertaPorDefecto = idx === 0;

    let contexto = null;
    if (orden.id) {
      try {
        contexto = await obtenerContextoOrden(orden.id);
      } catch {
        contexto = null;
      }
    }

    const condo = mapaCondominios.get(Number(orden.condominio_id)) || contexto?.condominio || {};
    const area = mapaAreas.get(Number(orden.area_id)) || contexto?.area || {};
    const serv = mapaServicios.get(Number(orden.servicio_id)) || contexto?.servicio || {};

    const nombreCondominio = condo.nombre || `Condominio #${orden.condominio_id}`;
    const nombreServicio = serv.nombre || `Servicio #${orden.servicio_id}`;
    const nombreArea = area.nombre || `Área #${orden.area_id}`;
    const notasAcceso =
      (condo.notas_acceso && String(condo.notas_acceso).trim()) ||
      'Sin notas de acceso específicas registradas para este condominio.';

    const cfgEstado = obtenerConfiguracionEstado(orden.estado);
    const fechaFormateada = formatearFechaCorta(orden.fecha_programada);

    tarjetasHTML.push(`
      <article
        class="order-card bg-[#efefef] rounded-xl shadow-[0_3px_6px_rgba(0,0,0,0.12)] border border-gray-200/80 overflow-hidden transition-all"
        data-order-id="${escaparHTML(orden.id || orden.clave_local)}"
        data-clave-local="${escaparHTML(orden.clave_local)}"
      >
        <!-- Cabecera de la Tarjeta (Siempre visible) -->
        <div
          class="card-header p-3.5 flex items-center gap-3 cursor-pointer hover:bg-[#e8e8e8] transition-colors select-none"
          data-action="toggle-card"
        >
          <!-- Icono Portapapeles -->
          <div class="shrink-0">
            <svg class="w-11 h-11 text-black" viewBox="0 0 36 42" fill="none">
              <rect x="3" y="5" width="30" height="34" rx="2.5" stroke="currentColor" stroke-width="2" fill="white"/>
              <rect x="5.5" y="8" width="25" height="28.5" rx="1" stroke="currentColor" stroke-width="1.2"/>
              <path d="M13 5V3.5C13 2.67 13.67 2 14.5 2H21.5C22.33 2 23 2.67 23 3.5V5" stroke="currentColor" stroke-width="2"/>
              <rect x="10" y="4" width="16" height="4" rx="1" fill="white" stroke="currentColor" stroke-width="1.5"/>
              <line x1="9" y1="14" x2="27" y2="14" stroke="currentColor" stroke-width="1.6"/>
              <line x1="9" y1="18" x2="27" y2="18" stroke="currentColor" stroke-width="1.6"/>
              <line x1="9" y1="22" x2="27" y2="22" stroke="currentColor" stroke-width="1.6"/>
              <line x1="9" y1="26" x2="27" y2="26" stroke="currentColor" stroke-width="1.6"/>
              <line x1="9" y1="30" x2="27" y2="30" stroke="currentColor" stroke-width="1.6"/>
            </svg>
          </div>

          <!-- Información Principal -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-lg font-extrabold text-black leading-tight">${escaparHTML(formatearFolioOrden(orden.id))}</h3>
              <span class="text-[10px] font-bold text-slate-600 bg-white/80 px-1.5 py-0.5 rounded border border-slate-300">${escaparHTML(fechaFormateada)}</span>
            </div>
            <p class="text-xs font-bold text-gray-900 truncate">${escaparHTML(nombreCondominio)}</p>
            <p class="text-xs font-semibold text-gray-700 truncate">${escaparHTML(nombreServicio)}</p>
          </div>

          <!-- Estado + Indicador Desplegable -->
          <div class="flex flex-col items-end gap-1.5 shrink-0">
            <span class="${cfgEstado.badgeClass}">${cfgEstado.etiqueta}</span>
            <svg class="w-4 h-4 text-gray-600 transform transition-transform duration-300 chevron ${abiertaPorDefecto ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </div>

        <!-- Sección Desplegable de Detalle -->
        <div class="accordion-content ${abiertaPorDefecto ? 'is-open' : ''}">
          <div class="accordion-inner">
            <div class="px-4 pb-4 pt-1 border-t border-gray-300/70 space-y-3">
              
              <!-- Campo Área -->
              <div class="flex items-start gap-2 pt-2">
                <svg class="w-5 h-5 text-red-600 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd"></path>
                </svg>
                <div>
                  <span class="text-xs font-extrabold text-gray-900">Área:</span>
                  <p class="text-sm font-bold text-black mt-0.5">${escaparHTML(nombreArea)}</p>
                </div>
              </div>

              <!-- Caja de Notas de Acceso -->
              <div class="bg-[#e4e4e4] rounded-xl p-3 shadow-inner border border-gray-300">
                <div class="flex items-center gap-1.5 mb-1">
                  <span class="text-sm">⚠️</span>
                  <h4 class="text-xs font-extrabold text-black">Notas de acceso</h4>
                </div>
                <p class="text-xs text-gray-800 leading-relaxed font-medium">
                  ${escaparHTML(notasAcceso)}
                </p>
              </div>

              <!-- Botones de Acción -->
              <div class="action-buttons-container">
                ${construirBotonAccionHTML(orden, cfgEstado.dataState)}
              </div>
            </div>
          </div>
        </div>
      </article>
    `);
  }

  ordersContainer.innerHTML = tarjetasHTML.join('');
}

// =============================================================================
// 5. INTERACCIÓN ACORDEÓN Y CAMBIO DE ESTADO EN SUPABASE / INDEXEDDB
// =============================================================================

function toggleCard(headerElement) {
  const content = headerElement.nextElementSibling;
  const chevron = headerElement.querySelector('.chevron');
  const isOpen = content.classList.contains('is-open');

  if (isOpen) {
    content.classList.remove('is-open');
    chevron?.classList.remove('rotate-180');
  } else {
    content.classList.add('is-open');
    chevron?.classList.add('rotate-180');

    setTimeout(() => {
      headerElement.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 220);
  }
}

function collapseAllCards() {
  document.querySelectorAll('.accordion-content.is-open').forEach(content => {
    content.classList.remove('is-open');
    const chevron = content.previousElementSibling?.querySelector('.chevron');
    if (chevron) chevron.classList.remove('rotate-180');
  });
}

async function cambiarEstadoOrden(buttonEl) {
  const card = buttonEl.closest('.order-card');
  if (!card) return;

  const claveLocal = card.dataset.claveLocal;
  const orden = todasLasOrdenes.find(o => o.clave_local === claveLocal);
  if (!orden) return;

  const currentState = buttonEl.getAttribute('data-state');
  let nuevoEstadoBD = 'en_proceso';

  if (currentState === 'idle') {
    nuevoEstadoBD = 'en_proceso';
  } else if (currentState === 'running') {
    nuevoEstadoBD = 'completada';
  } else {
    nuevoEstadoBD = 'asignada';
  }

  buttonEl.disabled = true;

  try {
    // 1. Si hay conexión y la orden tiene ID en Supabase, actualizar en la base de datos
    if (navigator.onLine && orden.id) {
      const { error } = await supabase
        .from('ordenes_servicio')
        .update({ estado: nuevoEstadoBD })
        .eq('id', Number(orden.id));

      if (error) {
        console.warn('[Órdenes Técnico] Aviso al actualizar estado en Supabase:', error.message);
      }
    }

    // 2. Actualizar en memoria y en el contexto local de IndexedDB
    orden.estado = nuevoEstadoBD;
    await sincronizarContextosParaVisitas([orden]);

    // 3. Actualizar visualmente la tarjeta sin cerrar el acordeón
    const badge = card.querySelector('.status-badge');
    const contenedorBotones = card.querySelector('.action-buttons-container');
    const cfgNuevo = obtenerConfiguracionEstado(nuevoEstadoBD);

    if (badge) {
      badge.textContent = cfgNuevo.etiqueta;
      badge.className = cfgNuevo.badgeClass;
    }

    if (contenedorBotones) {
      contenedorBotones.innerHTML = construirBotonAccionHTML(orden, cfgNuevo.dataState);
    }
  } catch (err) {
    console.error('[Órdenes Técnico] Error al cambiar estado:', err);
  } finally {
    buttonEl.disabled = false;
  }
}

// =============================================================================
// 6. EVENTOS DE NAVEGACIÓN Y FILTROS
// =============================================================================

ordersContainer?.addEventListener('click', async (event) => {
  const btnStatus = event.target.closest('[data-action="toggle-status"]');
  if (btnStatus) {
    event.stopPropagation();
    await cambiarEstadoOrden(btnStatus);
    return;
  }

  const header = event.target.closest('[data-action="toggle-card"]');
  if (header) {
    toggleCard(header);
  }
});

btnContraerTodas?.addEventListener('click', collapseAllCards);

btnVolverInicio?.addEventListener('click', () => {
  window.location.href = '/';
});

botonesFiltro.forEach(btn => {
  btn.addEventListener('click', () => {
    modoFiltro = btn.dataset.filter;
    botonesFiltro.forEach(b => {
      b.className =
        b === btn
          ? 'filtro-btn px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#045174] text-white transition-colors'
          : 'filtro-btn px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors';
    });
    renderizarOrdenes();
  });
});

inputFiltroFecha?.addEventListener('change', () => {
  if (!inputFiltroFecha.value) return;
  fechaSeleccionada = inputFiltroFecha.value;
  modoFiltro = 'fecha';
  botonesFiltro.forEach(b => {
    b.className = 'filtro-btn px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700 hover:bg-slate-300 transition-colors';
  });
  renderizarOrdenes();
});

// =============================================================================
// 7. INICIALIZACIÓN
// =============================================================================

async function inicializarVistaTecnicoOrdenes() {
  actualizarIndicadorConexion();
  if (inputFiltroFecha) {
    inputFiltroFecha.value = obtenerFechaLocalISO();
  }

  try {
    const sesion = await getActiveSession();
    if (!sesion?.usuario) {
      window.location.href = '/';
      return;
    }

    usuarioActual = sesion.usuario;
    if (nombreHeader) {
      nombreHeader.textContent = usuarioActual.nombre || 'Técnico';
    }
  } catch (err) {
    console.warn('[Órdenes Técnico] No se pudo verificar la sesión activa:', err);
  }

  await cargarDatosYRenderizar();
}

inicializarVistaTecnicoOrdenes();