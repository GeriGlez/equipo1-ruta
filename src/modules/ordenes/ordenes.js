// =============================================================================
// RUTA - MÓDULO DE ÓRDENES DE SERVICIO Y PROGRAMACIÓN SEMANAL (HU-05, HU-06, HU-07)
// Integrado al cliente compartido de Supabase, autenticación por rol e IndexedDB.
// Soporta modo Administrador (gestión completa) y modo Técnico (modo vista).
// =============================================================================

import { getActiveSession } from '../auth/authService.js';
import {
  cargarCatalogosCompletos,
  consultarOrdenesServicio,
  crearOrdenServicio,
  actualizarOrdenServicio,
  cancelarOrdenServicio,
  eliminarOrdenServicio,
  obtenerColaSyncOrdenes,
  sincronizarColaOrdenes,
  descartarCambioLocalOrden,
  puedeEditarOrden,
  puedeCancelarOrden,
  puedeEliminarOrden
} from './ordenes-db.js';
import {
  calcularRangoSemana,
  generarVistaPreviaSemanal,
  confirmarProgramacionSemanal,
  guardarPreferenciaAreaContrato
} from './programacion-semanal.js';

// =============================================================================
// 1. ESTADO DEL MÓDULO
// =============================================================================

let catalogos = {
  condominios: [],
  areas: [],
  servicios: [],
  contratos: []
};

let mapaCondominios = new Map();
let mapaAreas = new Map();
let mapaServicios = new Map();

let ordenes = [];
let claveOrdenActual = null;
let modoEdicion = false;
let modoSoloLectura = false;

// Estado de la vista previa de programación semanal
let vistaPreviaActual = null;

// =============================================================================
// 2. REFERENCIAS AL DOM
// =============================================================================

const tbody = document.getElementById('cuerpo-tabla-ordenes');
const btnAbrirNuevaOrden = document.getElementById('btn-abrir-nueva-orden');
const btnGuardarOrden = document.getElementById('btn-guardar-orden');
const btnConfirmarCancelacion = document.getElementById('btn-confirmar-cancelacion');
const btnConfirmarEliminacion = document.getElementById('btn-confirmar-eliminacion');

const modalNuevaOrden = document.getElementById('modal-nueva-orden');
const modalCancelarOrden = document.getElementById('modal-cancelar-orden');
const modalEliminarOrden = document.getElementById('modal-eliminar-orden');
const modalProgramacionSemanal = document.getElementById('modal-programacion-semanal');
const botonesCerrar = document.querySelectorAll('.btn-cerrar-modal');

const formOrden = document.getElementById('form-orden');
const tituloModalOrden = document.getElementById('titulo-modal-orden');
const notaEstadoInicial = document.getElementById('nota-estado-inicial');
const inputCondominio = document.getElementById('input-condominio');
const inputArea = document.getElementById('input-area');
const inputServicio = document.getElementById('input-servicio');
const inputFecha = document.getElementById('input-fecha');
const inputMotivoCancelacion = document.getElementById('input-motivo-cancelacion');

const errorModalOrden = document.getElementById('error-modal-orden');
const errorModalCancelar = document.getElementById('error-modal-cancelar');
const errorModalEliminar = document.getElementById('error-modal-eliminar');
const textoEliminarOrden = document.getElementById('texto-eliminar-orden');

const alertaOrdenes = document.getElementById('alerta-ordenes');
const nombreUsuarioOrden = document.getElementById('nombre-usuario-orden');
const estadoConexionOrdenes = document.getElementById('estado-conexion-ordenes');
const textoConexionOrdenes = document.getElementById('texto-conexion-ordenes');
const btnSincronizarOrdenes = document.getElementById('btn-sincronizar-ordenes');
const badgePendientesSync = document.getElementById('badge-pendientes-sync');
const resumenSincronizacionBarra = document.getElementById('resumen-sincronizacion-barra');

// Filtros
const filtroBusquedaOrden = document.getElementById('filtro-busqueda-orden');
const filtroCondominioOrden = document.getElementById('filtro-condominio-orden');
const filtroEstadoOrden = document.getElementById('filtro-estado-orden');
const filtroFechaOrden = document.getElementById('filtro-fecha-orden');
const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');

// Programación semanal
const btnAbrirProgramacionSemanal = document.getElementById('btn-abrir-programacion-semanal');
const inputSemanaProgramacion = document.getElementById('input-semana-programacion');
const inputFechaReferenciaSemana = document.getElementById('input-fecha-referencia-semana');
const btnGenerarVistaPrevia = document.getElementById('btn-generar-vista-previa');
const btnAutocompletarAreas = document.getElementById('btn-autocompletar-areas');
const btnConfirmarProgramacionSemanal = document.getElementById('btn-confirmar-programacion-semanal');
const rangoSemanaBanner = document.getElementById('rango-semana-banner');
const cuerpoVistaPreviaSemanal = document.getElementById('cuerpo-vista-previa-semanal');
const resumenPropuestasCount = document.getElementById('resumen-propuestas-count');
const resumenExistentesCount = document.getElementById('resumen-existentes-count');
const resumenErroresCount = document.getElementById('resumen-errores-count');
const resumenOmitidosCount = document.getElementById('resumen-omitidos-count');
const seccionNoGenerables = document.getElementById('seccion-no-generables');
const listaContratosNoGenerables = document.getElementById('lista-contratos-no-generables');
const seccionOmitidosFrecuencia = document.getElementById('seccion-omitidos-frecuencia');
const listaContratosOmitidos = document.getElementById('lista-contratos-omitidos');
const resultadoProgramacionSemanal = document.getElementById('resultado-programacion-semanal');

// =============================================================================
// 3. UTILIDADES DE INTERFAZ
// =============================================================================

function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function mostrarAlerta(mensaje, tipo = 'info') {
  if (!alertaOrdenes) return;
  if (!mensaje) {
    alertaOrdenes.hidden = true;
    alertaOrdenes.textContent = '';
    return;
  }
  alertaOrdenes.className = `alerta-banner ${tipo}`;
  alertaOrdenes.textContent = mensaje;
  alertaOrdenes.hidden = false;
}

function mostrarErrorEnModal(elementoError, mensaje) {
  if (!elementoError) return;
  if (!mensaje) {
    elementoError.hidden = true;
    elementoError.textContent = '';
    return;
  }
  elementoError.textContent = mensaje;
  elementoError.hidden = false;
}

function obtenerHoyISO() {
  const hoy = new Date();
  const y = hoy.getFullYear();
  const m = String(hoy.getMonth() + 1).padStart(2, '0');
  const d = String(hoy.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function actualizarIndicadoresConexionYSync() {
  const enLinea = navigator.onLine;
  if (estadoConexionOrdenes && textoConexionOrdenes) {
    estadoConexionOrdenes.className = `conn-pill ${enLinea ? 'conn-online' : 'conn-offline'}`;
    textoConexionOrdenes.textContent = enLinea ? 'En línea' : 'Modo sin conexión (Offline)';
  }

  try {
    const cola = await obtenerColaSyncOrdenes();
    const cantidad = cola.length;
    if (badgePendientesSync) {
      badgePendientesSync.textContent = String(cantidad);
    }
    if (btnSincronizarOrdenes) {
      btnSincronizarOrdenes.hidden = cantidad === 0 || modoSoloLectura;
      btnSincronizarOrdenes.disabled = !enLinea;
    }
    if (resumenSincronizacionBarra) {
      if (modoSoloLectura) {
        resumenSincronizacionBarra.textContent = 'Modo vista (solo lectura de órdenes de servicio).';
      } else if (cantidad === 0) {
        resumenSincronizacionBarra.textContent = enLinea
          ? 'Todos los cambios están sincronizados con Supabase.'
          : 'Trabajando con copia local en IndexedDB.';
      } else {
        resumenSincronizacionBarra.textContent = enLinea
          ? `${cantidad} operación(es) pendiente(s) lista(s) para sincronizar.`
          : `${cantidad} operación(es) guardada(s) en IndexedDB pendientes de conexión.`;
      }
    }
  } catch (err) {
    console.warn('[Órdenes] No se pudo consultar la cola de sincronización:', err);
  }
}

// =============================================================================
// 4. CARGA DE CATÁLOGOS Y FILTRADO DE ÁREAS POR CONDOMINIO
// =============================================================================

function reconstruirMapasCatalogos() {
  mapaCondominios = new Map(catalogos.condominios.map(c => [Number(c.id), c]));
  mapaAreas = new Map(catalogos.areas.map(a => [Number(a.id), a]));
  mapaServicios = new Map(catalogos.servicios.map(s => [Number(s.id), s]));
}

function poblarSelectoresCatalogos() {
  const condominiosActivos = catalogos.condominios.filter(c => c.activo !== false);

  inputCondominio.innerHTML = '<option value="">Seleccionar</option>';
  condominiosActivos.forEach(c => {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.nombre;
    inputCondominio.appendChild(opt);
  });

  const valorFiltroPrevio = filtroCondominioOrden?.value || '';
  if (filtroCondominioOrden) {
    filtroCondominioOrden.innerHTML = '<option value="">Todos</option>';
    catalogos.condominios.forEach(c => {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = c.nombre;
      filtroCondominioOrden.appendChild(opt);
    });
    filtroCondominioOrden.value = valorFiltroPrevio;
  }

  inputServicio.innerHTML = '<option value="">Seleccionar</option>';
  catalogos.servicios.forEach(s => {
    const opt = document.createElement('option');
    opt.value = String(s.id);
    opt.textContent = s.nombre;
    inputServicio.appendChild(opt);
  });

  actualizarOpcionesAreaPorCondominio(inputCondominio.value, '');
}

export function actualizarOpcionesAreaPorCondominio(condominioIdSeleccionado, areaIdPreseleccionada = '') {
  const condoId = Number(condominioIdSeleccionado);
  inputArea.innerHTML = '';

  if (!Number.isInteger(condoId) || condoId <= 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Selecciona primero un condominio';
    inputArea.appendChild(opt);
    inputArea.disabled = true;
    return;
  }

  const areasFiltradas = catalogos.areas.filter(a => Number(a.condominio_id) === condoId);

  if (areasFiltradas.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Este condominio no tiene áreas registradas';
    inputArea.appendChild(opt);
    inputArea.disabled = true;
    return;
  }

  inputArea.disabled = false;
  const optDefault = document.createElement('option');
  optDefault.value = '';
  optDefault.textContent = 'Seleccionar';
  inputArea.appendChild(optDefault);

  areasFiltradas.forEach(a => {
    const opt = document.createElement('option');
    opt.value = String(a.id);
    opt.textContent = a.nombre;
    inputArea.appendChild(opt);
  });

  if (
    areaIdPreseleccionada &&
    areasFiltradas.some(a => String(a.id) === String(areaIdPreseleccionada))
  ) {
    inputArea.value = String(areaIdPreseleccionada);
  } else if (areasFiltradas.length === 1) {
    inputArea.value = String(areasFiltradas[0].id);
  }
}

async function cargarCatalogos() {
  try {
    const resultado = await cargarCatalogosCompletos();
    catalogos = resultado;
    reconstruirMapasCatalogos();
    poblarSelectoresCatalogos();
  } catch (error) {
    console.error('[Órdenes] Error cargando catálogos:', error);
    mostrarAlerta(`No fue posible cargar los catálogos: ${error.message}`, 'error');
  }
}

// =============================================================================
// 5. OBTENER, FILTRAR Y RENDERIZAR ÓRDENES
// =============================================================================

async function obtenerOrdenes() {
  try {
    const resultado = await consultarOrdenesServicio();
    ordenes = resultado.ordenes || [];
    renderTabla();
    await actualizarIndicadoresConexionYSync();
  } catch (error) {
    console.error('[Órdenes] Error al obtener órdenes:', error);
    mostrarAlerta(
      `Error al consultar órdenes: ${error.message || 'Verifica tu conexión o permisos en Supabase.'}`,
      'error'
    );
    renderTabla();
  }
}

function obtenerNombreCondominio(orden) {
  return (
    orden.condominios?.nombre ||
    mapaCondominios.get(Number(orden.condominio_id))?.nombre ||
    `Condominio #${orden.condominio_id}`
  );
}

function obtenerNombreArea(orden) {
  return (
    orden.areas?.nombre ||
    mapaAreas.get(Number(orden.area_id))?.nombre ||
    `Área #${orden.area_id}`
  );
}

function obtenerNombreServicio(orden) {
  return (
    orden.servicios?.nombre ||
    mapaServicios.get(Number(orden.servicio_id))?.nombre ||
    `Servicio #${orden.servicio_id}`
  );
}

function filtrarOrdenesLista() {
  const texto = String(filtroBusquedaOrden?.value || '').trim().toLowerCase();
  const condoFiltro = String(filtroCondominioOrden?.value || '');
  const estadoFiltro = String(filtroEstadoOrden?.value || '');
  const fechaFiltro = String(filtroFechaOrden?.value || '');

  return ordenes.filter(orden => {
    if (condoFiltro && String(orden.condominio_id) !== condoFiltro) return false;
    if (estadoFiltro && String(orden.estado) !== estadoFiltro) return false;
    if (fechaFiltro && String(orden.fecha_programada) !== fechaFiltro) return false;

    if (texto) {
      const campos = [
        orden.id ? `#${orden.id}` : 'local',
        obtenerNombreCondominio(orden),
        obtenerNombreArea(orden),
        obtenerNombreServicio(orden),
        orden.fecha_programada,
        orden.estado,
        orden.motivo_cancelacion || '',
        orden.origen_generacion || ''
      ]
        .join(' ')
        .toLowerCase();

      if (!campos.includes(texto)) return false;
    }

    return true;
  });
}

function renderTabla() {
  tbody.innerHTML = '';

  const listaFiltrada = filtrarOrdenesLista();

  if (!listaFiltrada || listaFiltrada.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="padding: 30px; text-align: center; color: #64748b;">
          No hay órdenes registradas que coincidan con la consulta actual.
        </td>
      </tr>
    `;
    return;
  }

  listaFiltrada.forEach(orden => {
    let claseEstado = 'programada';
    let iconoEstado = '📅';

    if (orden.estado === 'programada' || orden.estado === 'asignada') {
      claseEstado = 'programada';
      iconoEstado = '📅';
    } else if (orden.estado === 'completada') {
      claseEstado = 'completada';
      iconoEstado = '☑';
    } else if (orden.estado === 'en_proceso') {
      claseEstado = 'en-proceso';
      iconoEstado = '⚙️';
    } else if (orden.estado === 'cancelada') {
      claseEstado = 'cancelada';
      iconoEstado = '❌';
    }

    const nombreCondominio = escaparHTML(obtenerNombreCondominio(orden));
    const nombreArea = escaparHTML(obtenerNombreArea(orden));
    const nombreServicio = escaparHTML(obtenerNombreServicio(orden));
    const etiquetaId = orden.id ? `#${orden.id}` : 'Local (sin ID remoto)';

    const esProgramacionSemanal =
      orden.origen_generacion === 'programacion_semanal' || Boolean(orden.contrato_id);
    const badgeOrigen = esProgramacionSemanal
      ? `<span class="origen-tag origen-semanal">Semanal${orden.contrato_id ? ` · Contrato #${orden.contrato_id}` : ''}</span>`
      : `<span class="origen-tag origen-manual">Manual</span>`;

    let htmlSync = '<span class="sync-badge sync-ok">✓ Sincronizada</span>';
    if (orden.error_sync) {
      htmlSync = `
        <span class="sync-badge sync-error" title="${escaparHTML(orden.error_sync)}">
          ⚠️ Error de sync
        </span>
        <div style="font-size: 11px; color: #991b1b; margin-top: 3px;">
          ${escaparHTML(orden.error_sync)}
        </div>
        ${
          modoSoloLectura
            ? ''
            : `<button type="button" class="btn-secondary-sm btn-descartar-local" data-clave="${escaparHTML(orden.clave_local)}" style="margin-top:4px;">
                Revertir cambio local
              </button>`
        }
      `;
    } else if (orden.pendiente_sync) {
      const etiquetasOp = {
        crear: 'Pendiente de crear',
        editar: 'Pendiente de edición',
        cancelar: 'Pendiente de cancelar',
        eliminar: 'Pendiente de eliminar'
      };
      const textoOp = etiquetasOp[orden.operacion_pendiente] || 'Pendiente de sync';
      htmlSync = `<span class="sync-badge sync-pending">⏳ ${textoOp}</span>`;
    }

    const motivosHTML =
      orden.estado === 'cancelada' && orden.motivo_cancelacion
        ? `<small class="motivo-cancelacion-sub">Motivo: ${escaparHTML(orden.motivo_cancelacion)}</small>`
        : '';

    const habEditar = !modoSoloLectura && puedeEditarOrden(orden);
    const habCancelar = !modoSoloLectura && puedeCancelarOrden(orden);
    const habEliminar = !modoSoloLectura && puedeEliminarOrden(orden) && orden.operacion_pendiente !== 'eliminar';

    const tr = document.createElement('tr');
    tr.dataset.clave = orden.clave_local;
    if (orden.operacion_pendiente === 'eliminar') {
      tr.style.opacity = '0.65';
    }

    const accionesHTML = modoSoloLectura
      ? `<span class="origen-tag origen-manual">Solo lectura</span>`
      : `
        <div class="acciones-celda">
          <button
            type="button"
            class="${habEditar ? 'btn-success' : 'btn-disabled'} btn-editar"
            data-clave="${escaparHTML(orden.clave_local)}"
            ${habEditar ? '' : 'disabled'}
            title="${habEditar ? 'Editar orden' : `No editable en estado ${orden.estado}`}"
          >
            ✏️ Editar
          </button>
          <button
            type="button"
            class="${habCancelar ? 'btn-danger' : 'btn-disabled'} btn-cancelar"
            data-clave="${escaparHTML(orden.clave_local)}"
            ${habCancelar ? '' : 'disabled'}
            title="${habCancelar ? 'Cancelar orden con motivo' : `No cancelable en estado ${orden.estado}`}"
          >
            ⊘ Cancelar
          </button>
          <button
            type="button"
            class="${habEliminar ? 'btn-secondary-sm' : 'btn-disabled'} btn-eliminar"
            data-clave="${escaparHTML(orden.clave_local)}"
            ${habEliminar ? '' : 'disabled'}
            title="${habEliminar ? 'Eliminar orden' : `No se puede eliminar una orden ${orden.estado}`}"
          >
            🗑️ Eliminar
          </button>
        </div>
      `;

    tr.innerHTML = `
      <td>
        <strong>${escaparHTML(etiquetaId)}</strong><br>
        ${badgeOrigen}
      </td>
      <td><span class="badge">${nombreCondominio}</span></td>
      <td><span class="badge">${nombreArea}</span></td>
      <td><span class="badge">${nombreServicio}</span></td>
      <td><span class="badge">${escaparHTML(orden.fecha_programada)}</span></td>
      <td>
        <span class="status ${claseEstado}">${iconoEstado} ${escaparHTML(orden.estado)}</span>
        ${motivosHTML}
      </td>
      <td>${htmlSync}</td>
      <td>${accionesHTML}</td>
    `;

    tbody.appendChild(tr);
  });
}

// =============================================================================
// 6. CREAR Y EDITAR ORDEN INDIVIDUAL
// =============================================================================

inputCondominio.addEventListener('change', () => {
  actualizarOpcionesAreaPorCondominio(inputCondominio.value, '');
});

btnAbrirNuevaOrden.addEventListener('click', () => {
  if (modoSoloLectura) return;
  modoEdicion = false;
  claveOrdenActual = null;
  formOrden.reset();
  mostrarErrorEnModal(errorModalOrden, '');
  poblarSelectoresCatalogos();
  inputFecha.value = obtenerHoyISO();
  tituloModalOrden.innerText = 'Nueva Orden de Servicio';
  if (notaEstadoInicial) {
    notaEstadoInicial.innerHTML = 'La orden nacerá en estado: <strong>PROGRAMADA</strong>';
  }
  modalNuevaOrden.classList.add('active');
});

btnGuardarOrden.addEventListener('click', async () => {
  if (modoSoloLectura) return;
  mostrarErrorEnModal(errorModalOrden, '');

  const payload = {
    condominio_id: parseInt(inputCondominio.value, 10),
    area_id: parseInt(inputArea.value, 10),
    servicio_id: parseInt(inputServicio.value, 10),
    fecha_programada: inputFecha.value
  };

  if (!payload.condominio_id || !payload.area_id || !payload.servicio_id || !payload.fecha_programada) {
    mostrarErrorEnModal(errorModalOrden, 'Por favor, completa todos los campos obligatorios (condominio, área, servicio y fecha).');
    return;
  }

  btnGuardarOrden.disabled = true;

  try {
    if (modoEdicion && claveOrdenActual) {
      const res = await actualizarOrdenServicio(claveOrdenActual, payload, catalogos);
      modalNuevaOrden.classList.remove('active');
      await obtenerOrdenes();
      mostrarAlerta(
        res.guardadoEnServidor
          ? 'Orden actualizada en Supabase.'
          : 'Sin conexión: los cambios de la orden se guardaron localmente en IndexedDB y están pendientes de sincronización.',
        res.guardadoEnServidor ? 'success' : 'warning'
      );
    } else {
      const res = await crearOrdenServicio(payload, catalogos);
      modalNuevaOrden.classList.remove('active');
      await obtenerOrdenes();
      mostrarAlerta(
        res.guardadoEnServidor
          ? 'Nueva orden programada en Supabase con estado "programada".'
          : 'Sin conexión: la nueva orden se guardó en IndexedDB (pendiente de sincronización con Supabase).',
        res.guardadoEnServidor ? 'success' : 'warning'
      );
    }
  } catch (error) {
    console.error('[Órdenes] Error al guardar orden:', error);
    mostrarErrorEnModal(errorModalOrden, error.message || 'No se pudo guardar la orden.');
  } finally {
    btnGuardarOrden.disabled = false;
  }
});

// =============================================================================
// 7. DELEGACIÓN DE EVENTOS EN LA TABLA (EDITAR, CANCELAR, ELIMINAR, REVERTIR)
// =============================================================================

tbody.addEventListener('click', async (e) => {
  if (modoSoloLectura) return;

  const btnEditar = e.target.closest('.btn-editar:not(.btn-disabled)');
  if (btnEditar) {
    const clave = btnEditar.dataset.clave;
    const orden = ordenes.find(o => o.clave_local === clave);
    if (!orden) return;

    if (!puedeEditarOrden(orden)) {
      mostrarAlerta(`No es posible editar una orden en estado "${orden.estado}".`, 'warning');
      return;
    }

    modoEdicion = true;
    claveOrdenActual = clave;
    mostrarErrorEnModal(errorModalOrden, '');

    poblarSelectoresCatalogos();
    if (![...inputCondominio.options].some(o => o.value === String(orden.condominio_id))) {
      const condo = mapaCondominios.get(Number(orden.condominio_id));
      const opt = document.createElement('option');
      opt.value = String(orden.condominio_id);
      opt.textContent = condo ? `${condo.nombre} (Inactivo)` : `Condominio #${orden.condominio_id}`;
      inputCondominio.appendChild(opt);
    }

    inputCondominio.value = String(orden.condominio_id);
    actualizarOpcionesAreaPorCondominio(orden.condominio_id, orden.area_id);
    inputServicio.value = String(orden.servicio_id);
    inputFecha.value = orden.fecha_programada;

    tituloModalOrden.innerText = orden.id
      ? `Editar Orden de Servicio #${orden.id}`
      : 'Editar Orden de Servicio (Local)';
    if (notaEstadoInicial) {
      notaEstadoInicial.innerHTML = `Estado actual de la orden: <strong>${escaparHTML(orden.estado.toUpperCase())}</strong>`;
    }
    modalNuevaOrden.classList.add('active');
    return;
  }

  const btnCancelar = e.target.closest('.btn-cancelar:not(.btn-disabled)');
  if (btnCancelar) {
    const clave = btnCancelar.dataset.clave;
    const orden = ordenes.find(o => o.clave_local === clave);
    if (!orden) return;

    claveOrdenActual = clave;
    inputMotivoCancelacion.value = '';
    mostrarErrorEnModal(errorModalCancelar, '');
    modalCancelarOrden.classList.add('active');
    return;
  }

  const btnEliminar = e.target.closest('.btn-eliminar:not(.btn-disabled)');
  if (btnEliminar) {
    const clave = btnEliminar.dataset.clave;
    const orden = ordenes.find(o => o.clave_local === clave);
    if (!orden) return;

    claveOrdenActual = clave;
    mostrarErrorEnModal(errorModalEliminar, '');
    const nombreCondo = obtenerNombreCondominio(orden);
    const nombreServ = obtenerNombreServicio(orden);
    textoEliminarOrden.textContent = orden.id
      ? `¿Deseas eliminar la Orden #${orden.id} (${nombreCondo} - ${nombreServ}, fecha ${orden.fecha_programada})?`
      : `¿Deseas descartar y eliminar esta orden creada localmente (${nombreCondo} - ${nombreServ})?`;
    modalEliminarOrden.classList.add('active');
    return;
  }

  const btnDescartar = e.target.closest('.btn-descartar-local');
  if (btnDescartar) {
    const clave = btnDescartar.dataset.clave;
    if (!clave) return;
    await descartarCambioLocalOrden(clave);
    await obtenerOrdenes();
    mostrarAlerta('Se revirtió el cambio local en conflicto.', 'info');
  }
});

// =============================================================================
// 8. CONFIRMAR CANCELACIÓN Y ELIMINACIÓN
// =============================================================================

btnConfirmarCancelacion.addEventListener('click', async () => {
  if (modoSoloLectura) return;
  mostrarErrorEnModal(errorModalCancelar, '');
  const motivo = inputMotivoCancelacion.value.trim();

  if (!motivo) {
    mostrarErrorEnModal(errorModalCancelar, 'Por favor, ingresa el motivo de cancelación. Es obligatorio.');
    inputMotivoCancelacion.focus();
    return;
  }

  btnConfirmarCancelacion.disabled = true;

  try {
    const res = await cancelarOrdenServicio(claveOrdenActual, motivo);
    modalCancelarOrden.classList.remove('active');
    await obtenerOrdenes();
    mostrarAlerta(
      res.guardadoEnServidor
        ? 'Orden cancelada y motivo registrado en Supabase.'
        : 'Sin conexión: la cancelación y su motivo se guardaron en IndexedDB pendientes de sincronización.',
      res.guardadoEnServidor ? 'success' : 'warning'
    );
  } catch (error) {
    console.error('[Órdenes] Error al cancelar:', error);
    mostrarErrorEnModal(errorModalCancelar, error.message || 'No fue posible cancelar la orden.');
  } finally {
    btnConfirmarCancelacion.disabled = false;
  }
});

btnConfirmarEliminacion.addEventListener('click', async () => {
  if (modoSoloLectura) return;
  mostrarErrorEnModal(errorModalEliminar, '');
  btnConfirmarEliminacion.disabled = true;

  try {
    const res = await eliminarOrdenServicio(claveOrdenActual);
    modalEliminarOrden.classList.remove('active');
    await obtenerOrdenes();

    if (res.eliminadaEnServidor) {
      mostrarAlerta('Orden eliminada correctamente de Supabase.', 'success');
    } else if (res.eraSoloLocal) {
      mostrarAlerta('La orden pendiente de creación fue eliminada localmente y no se enviará al servidor.', 'info');
    } else {
      mostrarAlerta(
        'Sin conexión: la eliminación quedó registrada en la cola local y se aplicará al recuperar internet.',
        'warning'
      );
    }
  } catch (error) {
    console.error('[Órdenes] Error al eliminar:', error);
    mostrarErrorEnModal(errorModalEliminar, error.message || 'No se pudo eliminar la orden.');
  } finally {
    btnConfirmarEliminacion.disabled = false;
  }
});

// =============================================================================
// 9. PROGRAMACIÓN SEMANAL AUTOMÁTICA DESDE CONTRATOS
// =============================================================================

function sincronizarControlesSemana(entrada) {
  const infoSemana = calcularRangoSemana(entrada);
  if (inputSemanaProgramacion) {
    inputSemanaProgramacion.value = infoSemana.codigoSemana;
  }
  if (inputFechaReferenciaSemana) {
    inputFechaReferenciaSemana.value = infoSemana.fechaInicio;
  }
  if (rangoSemanaBanner) {
    rangoSemanaBanner.textContent =
      `Semana seleccionada (${infoSemana.codigoSemana}): Lunes ${infoSemana.fechaInicio} al Domingo ${infoSemana.fechaFin}`;
  }
  return infoSemana;
}

function renderVistaPreviaSemanal() {
  if (!vistaPreviaActual) return;

  const { semana, propuestas, noGenerables, omitidosPorFrecuencia } = vistaPreviaActual;

  const nuevasPropuestas = propuestas.filter(p => !p.yaExiste);
  const existentes = propuestas.filter(p => p.yaExiste);

  resumenPropuestasCount.textContent = String(nuevasPropuestas.length);
  resumenExistentesCount.textContent = String(existentes.length);
  resumenErroresCount.textContent = String(noGenerables.length);
  resumenOmitidosCount.textContent = String(omitidosPorFrecuencia.length);

  cuerpoVistaPreviaSemanal.innerHTML = '';

  if (propuestas.length === 0) {
    cuerpoVistaPreviaSemanal.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 24px; color: #64748b;">
          No hay órdenes propuestas para esta semana con los contratos actuales.
        </td>
      </tr>
    `;
  } else {
    propuestas.forEach((prop, idx) => {
      const tr = document.createElement('tr');
      if (prop.yaExiste) {
        tr.style.backgroundColor = '#f8fafc';
      }

      const opcionesArea = [
        `<option value="">-- Seleccionar área (${prop.areas_disponibles.length}) --</option>`,
        ...prop.areas_disponibles.map(
          a =>
            `<option value="${a.id}" ${Number(prop.area_id) === Number(a.id) ? 'selected' : ''}>
              ${escaparHTML(a.nombre)} (${escaparHTML(a.tipo)})
            </option>`
        )
      ].join('');

      const sugerenciaHTML =
        !prop.area_id && prop.area_sugerida_nombre
          ? `<div style="font-size:11px; color:#0369a1; margin-top:3px;">Sugerida: ${escaparHTML(prop.area_sugerida_nombre)}</div>`
          : '';

      const avisosHTML =
        prop.avisos && prop.avisos.length > 0
          ? `<div style="font-size:11px; color:#92400e; margin-top:3px;">${prop.avisos.map(escaparHTML).join('<br>')}</div>`
          : '';

      let estadoPreviaHTML = '';
      if (prop.yaExiste) {
        estadoPreviaHTML = `<span class="sync-badge sync-ok">Ya existe (Orden #${prop.ordenExistenteId || 'local'})</span>`;
      } else if (!prop.incluir) {
        estadoPreviaHTML = `<span class="origen-tag origen-manual">Omitida manualmente</span>`;
      } else if (!prop.area_id) {
        estadoPreviaHTML = `<span class="sync-badge sync-pending">⚠️ Falta elegir área</span>`;
      } else if (prop.requiereConfirmacionFrecuencia) {
        estadoPreviaHTML = `<span class="sync-badge sync-pending"> Confirmar periodicidad</span>`;
      } else {
        estadoPreviaHTML = `<span class="sync-badge sync-ok">Lista para programar</span>`;
      }

      tr.innerHTML = `
        <td>
          <input
            type="checkbox"
            class="chk-incluir-previa"
            data-index="${idx}"
            ${prop.incluir ? 'checked' : ''}
            ${prop.yaExiste ? 'disabled' : ''}
          >
        </td>
        <td>
          <strong>Contrato #${prop.contrato_id}</strong><br>
          <span style="font-size:11px; color:#475569;">${escaparHTML(prop.frecuencia)} (${escaparHTML(prop.dias_preferenciales)})</span>
        </td>
        <td><strong>${escaparHTML(prop.condominio_nombre)}</strong></td>
        <td>
          <span class="badge">${escaparHTML(prop.servicio_nombre)}</span>
          ${avisosHTML}
        </td>
        <td>
          <select
            class="select-area-previa ${!prop.area_id && !prop.yaExiste ? 'falta-area' : ''}"
            data-index="${idx}"
            ${prop.yaExiste ? 'disabled' : ''}
          >
            ${opcionesArea}
          </select>
          ${sugerenciaHTML}
        </td>
        <td>
          <input
            type="date"
            class="input-fecha-previa"
            data-index="${idx}"
            min="${semana.fechaInicio}"
            max="${semana.fechaFin}"
            value="${escaparHTML(prop.fecha_programada)}"
            ${prop.yaExiste ? 'disabled' : ''}
          >
          <div style="font-size:11px; color:#64748b; margin-top:2px;">${escaparHTML(prop.dia_semana_nombre || '')}</div>
        </td>
        <td>${estadoPreviaHTML}</td>
      `;

      cuerpoVistaPreviaSemanal.appendChild(tr);
    });
  }

  if (noGenerables.length > 0) {
    seccionNoGenerables.hidden = false;
    listaContratosNoGenerables.innerHTML = noGenerables
      .map(
        item =>
          `<li><strong>Contrato #${escaparHTML(item.contrato_id ?? '?')} (${escaparHTML(item.nombre_condominio)} - ${escaparHTML(item.servicio_nombre)}):</strong> ${escaparHTML(item.motivo)}</li>`
      )
      .join('');
  } else {
    seccionNoGenerables.hidden = true;
    listaContratosNoGenerables.innerHTML = '';
  }

  if (omitidosPorFrecuencia.length > 0) {
    seccionOmitidosFrecuencia.hidden = false;
    listaContratosOmitidos.innerHTML = omitidosPorFrecuencia
      .map(
        item =>
          `<li><strong>Contrato #${escaparHTML(item.contrato_id)} (${escaparHTML(item.nombre_condominio)} - ${escaparHTML(item.servicio_nombre)}):</strong> ${escaparHTML(item.motivo)}</li>`
      )
      .join('');
  } else {
    seccionOmitidosFrecuencia.hidden = true;
    listaContratosOmitidos.innerHTML = '';
  }
}

async function calcularYMostrarVistaPrevia(entradaSemana) {
  resultadoProgramacionSemanal.hidden = true;
  resultadoProgramacionSemanal.innerHTML = '';

  await cargarCatalogos();
  const resOrdenes = await consultarOrdenesServicio();
  ordenes = resOrdenes.ordenes || [];

  const semanaInfo = sincronizarControlesSemana(entradaSemana);

  vistaPreviaActual = generarVistaPreviaSemanal({
    entradaSemana: semanaInfo.fechaInicio,
    contratos: catalogos.contratos,
    condominios: catalogos.condominios,
    areas: catalogos.areas,
    servicios: catalogos.servicios,
    ordenesExistentes: ordenes
  });

  renderVistaPreviaSemanal();
}

btnAbrirProgramacionSemanal?.addEventListener('click', async () => {
  if (modoSoloLectura) return;
  const hoyIso = obtenerHoyISO();
  sincronizarControlesSemana(hoyIso);
  modalProgramacionSemanal.classList.add('active');
  await calcularYMostrarVistaPrevia(hoyIso);
});

inputSemanaProgramacion?.addEventListener('change', async () => {
  if (inputSemanaProgramacion.value) {
    await calcularYMostrarVistaPrevia(inputSemanaProgramacion.value);
  }
});

inputFechaReferenciaSemana?.addEventListener('change', async () => {
  if (inputFechaReferenciaSemana.value) {
    await calcularYMostrarVistaPrevia(inputFechaReferenciaSemana.value);
  }
});

btnGenerarVistaPrevia?.addEventListener('click', async () => {
  const entrada =
    inputSemanaProgramacion?.value ||
    inputFechaReferenciaSemana?.value ||
    obtenerHoyISO();
  await calcularYMostrarVistaPrevia(entrada);
});

btnAutocompletarAreas?.addEventListener('click', () => {
  if (!vistaPreviaActual?.propuestas) return;
  let asignadas = 0;
  vistaPreviaActual.propuestas.forEach(prop => {
    if (!prop.yaExiste && !prop.area_id) {
      if (prop.area_sugerida_id) {
        prop.area_id = Number(prop.area_sugerida_id);
        guardarPreferenciaAreaContrato(prop.contrato_id, prop.area_id);
        asignadas++;
      } else if (prop.areas_disponibles.length === 1) {
        prop.area_id = Number(prop.areas_disponibles[0].id);
        guardarPreferenciaAreaContrato(prop.contrato_id, prop.area_id);
        asignadas++;
      }
    }
  });
  renderVistaPreviaSemanal();
  if (asignadas === 0) {
    alert('No había áreas sugeridas inequívocas pendientes por autocompletar. Selecciona manualmente las áreas restantes.');
  }
});

cuerpoVistaPreviaSemanal?.addEventListener('change', (e) => {
  if (!vistaPreviaActual?.propuestas) return;

  const chk = e.target.closest('.chk-incluir-previa');
  if (chk) {
    const idx = Number(chk.dataset.index);
    if (vistaPreviaActual.propuestas[idx]) {
      vistaPreviaActual.propuestas[idx].incluir = chk.checked;
      renderVistaPreviaSemanal();
    }
    return;
  }

  const selArea = e.target.closest('.select-area-previa');
  if (selArea) {
    const idx = Number(selArea.dataset.index);
    const prop = vistaPreviaActual.propuestas[idx];
    if (prop) {
      const nuevoAreaId = selArea.value ? Number(selArea.value) : null;
      prop.area_id = nuevoAreaId;
      if (nuevoAreaId) {
        guardarPreferenciaAreaContrato(prop.contrato_id, nuevoAreaId);
        vistaPreviaActual.propuestas.forEach(otra => {
          if (otra.contrato_id === prop.contrato_id && !otra.yaExiste && !otra.area_id) {
            otra.area_id = nuevoAreaId;
          }
        });
      }
      renderVistaPreviaSemanal();
    }
    return;
  }

  const inpFecha = e.target.closest('.input-fecha-previa');
  if (inpFecha) {
    const idx = Number(inpFecha.dataset.index);
    const prop = vistaPreviaActual.propuestas[idx];
    if (prop && inpFecha.value) {
      prop.fecha_programada = inpFecha.value;
      renderVistaPreviaSemanal();
    }
  }
});

btnConfirmarProgramacionSemanal?.addEventListener('click', async () => {
  if (!vistaPreviaActual) return;

  btnConfirmarProgramacionSemanal.disabled = true;

  try {
    const resumen = await confirmarProgramacionSemanal({
      semana: vistaPreviaActual.semana,
      propuestasRevisadas: vistaPreviaActual.propuestas,
      noGenerablesPrevios: vistaPreviaActual.noGenerables,
      catalogos,
      ordenesExistentes: [...ordenes]
    });

    await obtenerOrdenes();

    vistaPreviaActual = generarVistaPreviaSemanal({
      entradaSemana: vistaPreviaActual.semana.fechaInicio,
      contratos: catalogos.contratos,
      condominios: catalogos.condominios,
      areas: catalogos.areas,
      servicios: catalogos.servicios,
      ordenesExistentes: ordenes
    });
    renderVistaPreviaSemanal();

    const listaErrores =
      resumen.detalleNoGeneradas.length > 0
        ? `<ul style="margin-top:6px; margin-left:18px;">${resumen.detalleNoGeneradas
            .map(
              err =>
                `<li><strong>${escaparHTML(err.nombre_condominio || 'Contrato')} (${escaparHTML(err.servicio_nombre || '')}):</strong> ${escaparHTML(err.motivo)}</li>`
            )
            .join('')}</ul>`
        : '';

    resultadoProgramacionSemanal.hidden = false;
    resultadoProgramacionSemanal.innerHTML = `
      <strong>Resultado de la programación semanal (${escaparHTML(vistaPreviaActual.semana.codigoSemana)}):</strong><br>
      • Órdenes nuevas generadas: <strong>${resumen.generadas}</strong> ${resumen.guardadoEnServidor ? '(guardadas en Supabase)' : '(guardadas localmente en IndexedDB para sincronizar)'}<br>
      • Órdenes que ya existían (no duplicadas): <strong>${resumen.yaExistentes}</strong><br>
      • Contratos/propuestas que no pudieron generarse: <strong>${resumen.noGeneradas}</strong>
      ${listaErrores}
    `;
  } catch (error) {
    console.error('[Órdenes] Error al confirmar programación semanal:', error);
    mostrarAlerta(`Error en la programación semanal: ${error.message}`, 'error');
  } finally {
    btnConfirmarProgramacionSemanal.disabled = false;
  }
});

// =============================================================================
// 10. EVENTOS DE FILTROS, MODALES Y SINCRONIZACIÓN
// =============================================================================

[filtroBusquedaOrden, filtroCondominioOrden, filtroEstadoOrden, filtroFechaOrden].forEach(el => {
  if (!el) return;
  el.addEventListener(el === filtroBusquedaOrden ? 'input' : 'change', () => {
    renderTabla();
  });
});

btnLimpiarFiltros?.addEventListener('click', () => {
  if (filtroBusquedaOrden) filtroBusquedaOrden.value = '';
  if (filtroCondominioOrden) filtroCondominioOrden.value = '';
  if (filtroEstadoOrden) filtroEstadoOrden.value = '';
  if (filtroFechaOrden) filtroFechaOrden.value = '';
  renderTabla();
});

botonesCerrar.forEach(boton => {
  boton.addEventListener('click', () => {
    modalNuevaOrden?.classList.remove('active');
    modalCancelarOrden?.classList.remove('active');
    modalEliminarOrden?.classList.remove('active');
    modalProgramacionSemanal?.classList.remove('active');
  });
});

async function ejecutarSincronizacionManualOAutomatica(mostrarMensajeExito = false) {
  await actualizarIndicadoresConexionYSync();
  if (!navigator.onLine || modoSoloLectura) return;

  try {
    const res = await sincronizarColaOrdenes();
    await cargarCatalogos();
    await obtenerOrdenes();

    if (res.errores.length > 0) {
      mostrarAlerta(
        `Sincronización parcial: ${res.sincronizadas} operación(es) enviada(s), ${res.errores.length} con conflicto o error (${res.errores[0].mensaje}). Los datos locales se conservan.`,
        'error'
      );
    } else if (res.sincronizadas > 0 || mostrarMensajeExito) {
      mostrarAlerta(
        res.sincronizadas > 0
          ? `Se sincronizaron ${res.sincronizadas} operación(es) pendiente(s) con Supabase.`
          : 'No hay operaciones pendientes por sincronizar.',
        'success'
      );
    }
  } catch (error) {
    console.error('[Órdenes] Error durante sincronización:', error);
    mostrarAlerta(`No fue posible completar la sincronización: ${error.message}`, 'error');
  }
}

btnSincronizarOrdenes?.addEventListener('click', () => {
  ejecutarSincronizacionManualOAutomatica(true);
});

window.addEventListener('online', () => {
  mostrarAlerta('Conexión restablecida. Actualizando órdenes desde Supabase...', 'info');
  ejecutarSincronizacionManualOAutomatica(false);
});

window.addEventListener('offline', () => {
  actualizarIndicadoresConexionYSync();
  mostrarAlerta(
    'Modo sin conexión activo. Mostrando registros almacenados localmente en IndexedDB.',
    'warning'
  );
});

// =============================================================================
// 11. INICIALIZACIÓN Y VERIFICACIÓN DE SESIÓN (ADMIN Y MODO VISTA TÉCNICO)
// =============================================================================

async function inicializarModuloOrdenes() {
  await actualizarIndicadoresConexionYSync();

  try {
    const sesion = await getActiveSession();
    if (sesion?.usuario) {
      const rol = sesion.usuario.rol;

      if (rol !== 'administrador' && rol !== 'tecnico') {
        window.location.href = '/';
        return;
      }

      if (nombreUsuarioOrden) {
        nombreUsuarioOrden.textContent = sesion.usuario.nombre || 'Usuario';
      }

      // Si entra un técnico, activamos el Modo Vista (solo lectura)
      if (rol === 'tecnico') {
        modoSoloLectura = true;
        if (btnAbrirNuevaOrden) btnAbrirNuevaOrden.style.display = 'none';
        if (btnAbrirProgramacionSemanal) btnAbrirProgramacionSemanal.style.display = 'none';
        const subRol = document.querySelector('.user-info div:nth-child(2)');
        if (subRol) subRol.textContent = 'Técnico (Modo Vista)';
      }
    }
  } catch (err) {
    console.warn('[Órdenes] No se pudo verificar sesión activa:', err);
  }

  await cargarCatalogos();
  if (navigator.onLine && !modoSoloLectura) {
    await sincronizarColaOrdenes();
  }
  await obtenerOrdenes();
}

inicializarModuloOrdenes();