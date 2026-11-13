// =============================================================================
// RUTA - VISTA MÓVIL DE ÓRDENES DE SERVICIO PARA EL TÉCNICO (HU-05 / MÓDULO 5)
// Al pulsar "Iniciar Trabajo", actualiza el estado a "En Proceso", guarda el
// contexto en IndexedDB y redirige directo a Registrar_Visita_Movil.html.
// =============================================================================

import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js';
import {
  guardarContextoOrden,
  obtenerContextoOrden,
  obtenerVisitaPorOrden
} from '../pendientes_sync/db-local.js';
import {
  cargarCatalogosCompletos,
  consultarOrdenesServicio,
  guardarCatalogoLocal
} from './ordenes-db.js';
import { mostrarNotasAcceso } from '../condominios/notas-acceso.js';

const STORAGE_ESTADOS_TECNICO_KEY = 'ruta_estados_ordenes_tecnico_v1';

const nombreHeader = document.getElementById('tecnico-nombre-header');
const btnVolverInicio = document.getElementById('btn-volver-inicio');
const tituloFechaActual = document.getElementById('titulo-fecha-actual');
const ordersCounter = document.getElementById('orders-counter');
const ordersContainer = document.getElementById('orders-Container');

let usuarioActual = null;
let todasLasOrdenes = [];
let mapaCondominios = new Map();
let mapaAreas = new Map();
let mapaServicios = new Map();

function obtenerEstadosLocalesTecnico() {
  try {
    const raw = localStorage.getItem(STORAGE_ESTADOS_TECNICO_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function guardarEstadoLocalTecnico(ordenId, estado) {
  if (!ordenId) return;
  try {
    const actual = obtenerEstadosLocalesTecnico();
    actual[String(ordenId)] = estado;
    localStorage.setItem(STORAGE_ESTADOS_TECNICO_KEY, JSON.stringify(actual));
  } catch {
    // Ignorar errores de almacenamiento restringido
  }
}

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

function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function formatearFolioOrden(id) {
  if (!id) return 'Orden Local';
  const num = Number(id);
  return `Orden ${num < 10 ? `0${num}` : num}`;
}

async function cargarCatalogosConNotas() {
  const base = await cargarCatalogosCompletos();
  let condominios = base.condominios || [];
  const areas = base.areas || [];
  const servicios = base.servicios || [];

  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('condominios')
        .select('id, nombre, direccion, colonia, notas_acceso, activo')
        .order('nombre', { ascending: true });

      if (!error && Array.isArray(data)) {
        condominios = data;
        await guardarCatalogoLocal('condominios', condominios);
      }
    } catch (err) {
      console.warn('[Órdenes Técnico] Usando condominios en caché local:', err);
    }
  }

  mapaCondominios = new Map(condominios.map(c => [Number(c.id), c]));
  mapaAreas = new Map(areas.map(a => [Number(a.id), a]));
  mapaServicios = new Map(servicios.map(s => [Number(s.id), s]));
}

async function guardarContextoDeOrdenIndividual(orden) {
  if (!usuarioActual || !orden?.id) return;

  let contextoPrevio = null;
  try {
    contextoPrevio = await obtenerContextoOrden(orden.id);
  } catch {
    contextoPrevio = null;
  }

  const condo = mapaCondominios.get(Number(orden.condominio_id)) || contextoPrevio?.condominio;
  const area = mapaAreas.get(Number(orden.area_id)) || contextoPrevio?.area;
  const serv = mapaServicios.get(Number(orden.servicio_id)) || contextoPrevio?.servicio;

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

async function sincronizarContextosParaVisitas(ordenesLista) {
  if (!usuarioActual) return;
  for (const orden of ordenesLista) {
    await guardarContextoDeOrdenIndividual(orden);
  }
}

async function cargarDatosYRenderizar() {
  try {
    await cargarCatalogosConNotas();
    const resultado = await consultarOrdenesServicio();
    const estadosLocales = obtenerEstadosLocalesTecnico();

    const activas = (resultado.ordenes || []).filter(
      o => o.activo !== false && o.estado !== 'cancelada' && o.operacion_pendiente !== 'eliminar'
    );

    // Sincronizar el estado con las visitas locales o el progreso iniciado por el técnico
    for (const orden of activas) {
      if (!orden.id) continue;

      if (
        (orden.estado === 'programada' || orden.estado === 'asignada') &&
        estadosLocales[String(orden.id)]
      ) {
        orden.estado = estadosLocales[String(orden.id)];
      }

      if (usuarioActual?.id) {
        try {
          const visitaLocal = await obtenerVisitaPorOrden(orden.id, usuarioActual.id);
          if (visitaLocal) {
            orden.estado = visitaLocal.hora_salida ? 'completada' : 'en_proceso';
          }
        } catch {
          // Continuar si no hay visita local
        }
      }
    }

    const hoy = obtenerFechaLocalISO();
    activas.sort((a, b) => {
      const aEsHoy = a.fecha_programada === hoy ? 0 : 1;
      const bEsHoy = b.fecha_programada === hoy ? 0 : 1;
      if (aEsHoy !== bEsHoy) return aEsHoy - bEsHoy;
      return (Number(a.id) || 0) - (Number(b.id) || 0);
    });

    todasLasOrdenes = activas;
    await sincronizarContextosParaVisitas(todasLasOrdenes);
    await renderizarOrdenes();
  } catch (error) {
    console.error('[Órdenes Técnico] Error al consultar órdenes:', error);
    ordersContainer.innerHTML = `
      <p class="ordenes-cargando">No fue posible cargar las órdenes de servicio.</p>
    `;
  }
}

function obtenerConfigEstado(estadoRaw) {
  const estado = String(estadoRaw || 'programada').toLowerCase();

  if (estado === 'en_proceso') {
    return {
      textoBarra: 'En Proceso',
      claseBarra: 'orden-status-bar orden-status-bar--en-proceso',
      textoBoton: 'Continuar Visita',
      claseBoton: 'orden-action-btn orden-action-btn--iniciar',
      dataState: 'running'
    };
  }

  if (estado === 'completada') {
    return {
      textoBarra: 'Completada',
      claseBarra: 'orden-status-bar orden-status-bar--completada',
      textoBoton: 'Editar Visita',
      claseBoton: 'orden-action-btn orden-action-btn--completada',
      dataState: 'done'
    };
  }

  return {
    textoBarra: 'Asignada',
    claseBarra: 'orden-status-bar orden-status-bar--asignada',
    textoBoton: 'Iniciar Trabajo',
    claseBoton: 'orden-action-btn orden-action-btn--iniciar',
    dataState: 'idle'
  };
}

async function renderizarOrdenes() {
  const hoyISO = obtenerFechaLocalISO();
  tituloFechaActual.textContent = formatearFechaEncabezado(hoyISO);

  const cantidad = todasLasOrdenes.length;
  ordersCounter.textContent =
    cantidad === 1
      ? '1 Orden programada para hoy'
      : `${cantidad} Órdenes programadas para hoy`;

  if (cantidad === 0) {
    ordersContainer.innerHTML = `
      <p class="ordenes-cargando">No hay órdenes programadas en este momento.</p>
    `;
    return;
  }

  const tarjetasHTML = [];

  for (let idx = 0; idx < todasLasOrdenes.length; idx++) {
    const orden = todasLasOrdenes[idx];
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
    const nombreArea = area.nombre || `Área #${orden.area_id}`;
    const nombreServicio = serv.nombre || `Servicio #${orden.servicio_id}`;

    const cfg = obtenerConfigEstado(orden.estado);

    tarjetasHTML.push(`
      <article
        class="orden-card ${abiertaPorDefecto ? 'is-open' : ''}"
        data-clave-local="${escaparHTML(orden.clave_local)}"
      >
        <div class="orden-card-header" data-action="toggle-card">
          <div class="orden-card-top">
            <svg class="orden-card-svg" viewBox="0 0 36 42" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="30" height="34" rx="2.5" stroke="#111111" stroke-width="2" fill="white"/>
              <rect x="5.5" y="8" width="25" height="28.5" rx="1" stroke="#111111" stroke-width="1.2"/>
              <path d="M13 5V3.5C13 2.67 13.67 2 14.5 2H21.5C22.33 2 23 2.67 23 3.5V5" stroke="#111111" stroke-width="2"/>
              <rect x="10" y="4" width="16" height="4" rx="1" fill="white" stroke="#111111" stroke-width="1.5"/>
              <line x1="9" y1="14" x2="27" y2="14" stroke="#111111" stroke-width="1.6"/>
              <line x1="9" y1="18" x2="27" y2="18" stroke="#111111" stroke-width="1.6"/>
              <line x1="9" y1="22" x2="27" y2="22" stroke="#111111" stroke-width="1.6"/>
              <line x1="9" y1="26" x2="27" y2="26" stroke="#111111" stroke-width="1.6"/>
              <line x1="9" y1="30" x2="27" y2="30" stroke="#111111" stroke-width="1.6"/>
            </svg>

            <div class="orden-card-titles">
              <h2 class="orden-card-numero">${escaparHTML(formatearFolioOrden(orden.id))}</h2>
              <p class="orden-card-condominio">${escaparHTML(nombreCondominio)}</p>
            </div>

            <svg class="orden-card-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/>
            </svg>
          </div>

          <div class="${cfg.claseBarra}">
            ${cfg.textoBarra}
          </div>
        </div>

        <div class="orden-accordion">
          <div class="orden-accordion-inner">
            <div class="orden-card-body">

              <div class="orden-field">
                <span class="orden-field-label">Área:</span>
                <div class="orden-field-box">${escaparHTML(nombreArea)}</div>
              </div>

              <div class="orden-field">
                <span class="orden-field-label">Servicio:</span>
                <div class="orden-field-box">${escaparHTML(nombreServicio)}</div>
              </div>

              <div class="orden-notas-container" data-notas-orden-idx="${idx}"></div>

              <div class="orden-btn-wrap">
                <button
                  type="button"
                  class="${cfg.claseBoton}"
                  data-action="iniciar-trabajo"
                  data-state="${cfg.dataState}"
                >
                  ${cfg.textoBoton}
                </button>
              </div>

            </div>
          </div>
        </div>
      </article>
    `);
  }

  ordersContainer.innerHTML = tarjetasHTML.join('');

  // Renderizar las notas de acceso usando el componente de HU-02 (notas-acceso.js)
  for (let idx = 0; idx < todasLasOrdenes.length; idx++) {
    const orden = todasLasOrdenes[idx];
    const contenedorNotas = ordersContainer.querySelector(`[data-notas-orden-idx="${idx}"]`);
    if (!contenedorNotas) continue;

    let contexto = null;
    if (orden.id) {
      try {
        contexto = await obtenerContextoOrden(orden.id);
      } catch {
        contexto = null;
      }
    }

    const condoMapa = mapaCondominios.get(Number(orden.condominio_id));
    const notasGuardadas = condoMapa?.notas_acceso ?? contexto?.condominio?.notas_acceso;

    const datosCondominio = {
      id: Number(orden.condominio_id),
      ...(notasGuardadas ? { notas_acceso: notasGuardadas } : {})
    };

    await mostrarNotasAcceso(contenedorNotas, datosCondominio);
  }
}

// =============================================================================
// 4. AL TOCAR "INICIAR TRABAJO": PASAR A EN PROCESO Y ABRIR REGISTRAR VISITA
// =============================================================================

async function iniciarTrabajoYRedirigir(buttonEl) {
  const card = buttonEl.closest('.orden-card');
  if (!card) return;

  const claveLocal = card.dataset.claveLocal;
  const orden = todasLasOrdenes.find(o => o.clave_local === claveLocal);
  if (!orden) return;

  if (!orden.id) {
    alert('Esta orden aún no cuenta con un identificador sincronizado para registrar visita.');
    return;
  }

  buttonEl.disabled = true;
  buttonEl.textContent = 'Abriendo...';

  try {
    if (orden.estado !== 'completada') {
      orden.estado = 'en_proceso';
      guardarEstadoLocalTecnico(orden.id, 'en_proceso');

      if (navigator.onLine) {
        try {
          await supabase
            .from('ordenes_servicio')
            .update({ estado: 'en_proceso' })
            .eq('id', Number(orden.id));
        } catch (err) {
          console.warn('[Órdenes Técnico] Aviso al actualizar estado en Supabase:', err);
        }
      }
    }

    await guardarContextoDeOrdenIndividual(orden);

    window.location.href = `/src/modules/visitas/Registrar_Visita_Movil.html?orden_id=${orden.id}`;
  } catch (err) {
    console.error('[Órdenes Técnico] Error al abrir registro de visita:', err);
    buttonEl.disabled = false;
    buttonEl.textContent = 'Iniciar Trabajo';
  }
}

ordersContainer?.addEventListener('click', async (event) => {
  const btnIniciar = event.target.closest('[data-action="iniciar-trabajo"]');
  if (btnIniciar) {
    event.stopPropagation();
    await iniciarTrabajoYRedirigir(btnIniciar);
    return;
  }

  const header = event.target.closest('[data-action="toggle-card"]');
  if (header) {
    const card = header.closest('.orden-card');
    card?.classList.toggle('is-open');
  }
});

btnVolverInicio?.addEventListener('click', () => {
  window.location.href = '/';
});

window.addEventListener('online', cargarDatosYRenderizar);

async function inicializar() {
  try {
    const sesion = await getActiveSession();
    if (!sesion?.usuario) {
      window.location.href = '/';
      return;
    }

    usuarioActual = sesion.usuario;
    if (nombreHeader) {
      nombreHeader.textContent = usuarioActual.nombre || 'Usuario';
    }
  } catch (err) {
    console.warn('[Órdenes Técnico] Error verificando sesión:', err);
  }

  await cargarDatosYRenderizar();
}

inicializar();