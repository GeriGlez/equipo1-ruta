// =============================================================================
// RUTA - REPORTE 2: CUMPLIMIENTO DE RUTA
// Solo lectura · Exclusivo Administrador · Filtro de fechas
// Muestra órdenes programadas vs. completadas por cuadrilla y por semana,
// porcentaje de cumplimiento y desglose de órdenes canceladas con su motivo.
// =============================================================================

import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js';

// =============================================================================
// 1. REFERENCIAS AL DOM Y ESTADO
// =============================================================================

const nombreUsuarioReporte = document.getElementById('nombre-usuario-reporte');
const alertaReporte = document.getElementById('alerta-reporte');
const btnImprimir = document.getElementById('btn-imprimir-reporte');

const inputDesde = document.getElementById('filtro-desde');
const inputHasta = document.getElementById('filtro-hasta');
const selectCuadrilla = document.getElementById('filtro-cuadrilla');
const btnAplicarFiltros = document.getElementById('btn-aplicar-filtros');
const botonesAtajo = document.querySelectorAll('.btn-atajo');
const resumenPeriodoTexto = document.getElementById('resumen-periodo-texto');

const kpiProgramadas = document.getElementById('kpi-programadas');
const kpiCompletadas = document.getElementById('kpi-completadas');
const kpiPendientesHint = document.getElementById('kpi-pendientes-hint');
const kpiPorcentaje = document.getElementById('kpi-porcentaje');
const kpiBarraProgreso = document.getElementById('kpi-barra-progreso');
const kpiCanceladas = document.getElementById('kpi-canceladas');
const kpiCanceladasPct = document.getElementById('kpi-canceladas-pct');

const gridCuadrillas = document.getElementById('grid-cuadrillas-cumplimiento');
const contenedorSemanas = document.getElementById('contenedor-semanas');
const listaCanceladas = document.getElementById('lista-canceladas');
const badgeTotalCanceladas = document.getElementById('badge-total-canceladas');

let mapaCuadrillas = new Map();
let mapaCondominios = new Map();
let mapaAreas = new Map();
let mapaServicios = new Map();
let mapaUsuarios = new Map();

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// =============================================================================
// 2. UTILIDADES DE SEGURIDAD, FECHAS Y SEMANAS ISO
// =============================================================================

function escaparHTML(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

function mostrarAlerta(mensaje) {
  if (!alertaReporte) return;
  if (!mensaje) {
    alertaReporte.hidden = true;
    alertaReporte.textContent = '';
    return;
  }
  alertaReporte.textContent = mensaje;
  alertaReporte.hidden = false;
}

function formatearISO(dateLocal) {
  const y = dateLocal.getFullYear();
  const m = String(dateLocal.getMonth() + 1).padStart(2, '0');
  const d = String(dateLocal.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parsearFechaUTC(fechaISO) {
  const partes = String(fechaISO || '').slice(0, 10).split('-').map(Number);
  if (partes.length !== 3 || partes.some(Number.isNaN)) return null;
  return new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
}

function formatearFechaLegible(fechaISO, incluirDia = true) {
  const dt = parsearFechaUTC(fechaISO);
  if (!dt) return fechaISO || 'Sin fecha';
  const diaSem = DIAS_CORTOS[dt.getUTCDay()];
  const dia = String(dt.getUTCDate()).padStart(2, '0');
  const mes = MESES_CORTOS[dt.getUTCMonth()];
  const anio = dt.getUTCFullYear();
  return incluirDia ? `${diaSem} ${dia} ${mes} ${anio}` : `${dia} ${mes} ${anio}`;
}

function obtenerInfoSemanaISO(fechaISO) {
  const dt = parsearFechaUTC(fechaISO);
  if (!dt) {
    return { clave: '0000-W00', etiqueta: 'Sin fecha válida', lunesISO: '' };
  }

  const diaIso = dt.getUTCDay() === 0 ? 7 : dt.getUTCDay();
  const lunes = new Date(dt.getTime());
  lunes.setUTCDate(dt.getUTCDate() - (diaIso - 1));

  const domingo = new Date(lunes.getTime());
  domingo.setUTCDate(lunes.getUTCDate() + 6);

  const jueves = new Date(lunes.getTime());
  jueves.setUTCDate(lunes.getUTCDate() + 3);
  const anioIso = jueves.getUTCFullYear();

  const ene4 = new Date(Date.UTC(anioIso, 0, 4));
  const diaEne4 = ene4.getUTCDay() === 0 ? 7 : ene4.getUTCDay();
  const lunesSem1 = new Date(Date.UTC(anioIso, 0, 4 - (diaEne4 - 1)));
  const numSemana = Math.round((lunes.getTime() - lunesSem1.getTime()) / (7 * 86400000)) + 1;

  const clave = `${anioIso}-W${String(numSemana).padStart(2, '0')}`;
  const lunesISO = `${lunes.getUTCFullYear()}-${String(lunes.getUTCMonth() + 1).padStart(2, '0')}-${String(lunes.getUTCDate()).padStart(2, '0')}`;
  const domingoISO = `${domingo.getUTCFullYear()}-${String(domingo.getUTCMonth() + 1).padStart(2, '0')}-${String(domingo.getUTCDate()).padStart(2, '0')}`;

  return {
    clave,
    lunesISO,
    etiqueta: `Semana ${numSemana} (${anioIso}) · ${formatearFechaLegible(lunesISO, true)} al ${formatearFechaLegible(domingoISO, true)}`
  };
}

function calcularPorcentaje(completadas, total) {
  if (!total) return 0;
  return Math.round((completadas / total) * 1000) / 10;
}

function obtenerNivelClase(porcentaje) {
  if (porcentaje >= 80) return 'alto';
  if (porcentaje >= 50) return 'medio';
  return 'bajo';
}

function aplicarRangoAtajo(periodo) {
  const hoy = new Date();
  const diaSemana = hoy.getDay() === 0 ? 7 : hoy.getDay();

  if (periodo === 'semana_actual') {
    const lunes = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (diaSemana - 1));
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    inputDesde.value = formatearISO(lunes);
    inputHasta.value = formatearISO(domingo);
  } else if (periodo === 'ultimas_4') {
    const lunesActual = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (diaSemana - 1));
    const lunesHace3 = new Date(lunesActual.getFullYear(), lunesActual.getMonth(), lunesActual.getDate() - 21);
    const domingoActual = new Date(lunesActual.getFullYear(), lunesActual.getMonth(), lunesActual.getDate() + 6);
    inputDesde.value = formatearISO(lunesHace3);
    inputHasta.value = formatearISO(domingoActual);
  } else if (periodo === 'mes_actual') {
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    inputDesde.value = formatearISO(inicioMes);
    inputHasta.value = formatearISO(finMes);
  } else if (periodo === 'todo') {
    inputDesde.value = '';
    inputHasta.value = '';
  }

  botonesAtajo.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.periodo === periodo);
  });
}

// =============================================================================
// 3. CONSULTA DE CATÁLOGOS Y ÓRDENES (SOLO LECTURA)
// =============================================================================

async function cargarCatalogos() {
  const [resCuad, resCondo, resAreas, resServ, resUsu] = await Promise.all([
    supabase.from('cuadrillas').select('id, nombre, responsable_id').order('nombre', { ascending: true }),
    supabase.from('condominios').select('id, nombre'),
    supabase.from('areas').select('id, nombre, tipo'),
    supabase.from('servicios').select('id, nombre'),
    supabase.from('usuarios').select('id, nombre')
  ]);

  if (resCuad.error) throw resCuad.error;

  mapaUsuarios = new Map((resUsu.data || []).map(u => [String(u.id), u.nombre]));
  mapaCondominios = new Map((resCondo.data || []).map(c => [Number(c.id), c.nombre]));
  mapaAreas = new Map((resAreas.data || []).map(a => [Number(a.id), a]));
  mapaServicios = new Map((resServ.data || []).map(s => [Number(s.id), s.nombre]));
  mapaCuadrillas = new Map(
    (resCuad.data || []).map(c => [
      Number(c.id),
      {
        id: Number(c.id),
        nombre: c.nombre,
        responsable: mapaUsuarios.get(String(c.responsable_id)) || 'Sin responsable'
      }
    ])
  );

  selectCuadrilla.innerHTML = '<option value="">Todas las cuadrillas</option>';
  (resCuad.data || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = String(c.id);
    opt.textContent = c.nombre;
    selectCuadrilla.appendChild(opt);
  });
  const optSin = document.createElement('option');
  optSin.value = 'sin_asignar';
  optSin.textContent = 'Sin cuadrilla asignada';
  selectCuadrilla.appendChild(optSin);
}

async function consultarYRenderizarReporte() {
  mostrarAlerta('');

  const desde = inputDesde.value;
  const hasta = inputHasta.value;
  const filtroCuad = selectCuadrilla.value;

  if (desde && hasta && desde > hasta) {
    mostrarAlerta('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
    return;
  }

  gridCuadrillas.innerHTML = '<p class="rep-empty">Consultando datos en Supabase...</p>';
  contenedorSemanas.innerHTML = '<p class="rep-empty">Agrupando cumplimiento semanal...</p>';
  listaCanceladas.innerHTML = '<p class="rep-empty">Consultando cancelaciones...</p>';

  try {
    let query = supabase
      .from('ordenes_servicio')
      .select('*')
      .order('fecha_programada', { ascending: false });

    if (desde) query = query.gte('fecha_programada', desde);
    if (hasta) query = query.lte('fecha_programada', hasta);

    const { data, error } = await query;
    if (error) throw error;

    // Excluir bajas lógicas (si existe columna activo) y aplicar filtro de cuadrilla
    let ordenes = (data || []).filter(o => o.activo !== false);

    if (filtroCuad === 'sin_asignar') {
      ordenes = ordenes.filter(o => o.cuadrilla_id === null || o.cuadrilla_id === undefined);
    } else if (filtroCuad) {
      ordenes = ordenes.filter(o => Number(o.cuadrilla_id) === Number(filtroCuad));
    }

    actualizarTextoPeriodo(desde, hasta, ordenes.length);
    renderizarKPIs(ordenes);
    renderizarPorCuadrilla(ordenes);
    renderizarPorSemanaYCuadrilla(ordenes);
    renderizarCanceladas(ordenes);
  } catch (err) {
    console.error('[Reportes] Error al generar reporte:', err);
    mostrarAlerta(`No fue posible generar el reporte: ${err.message}`);
    gridCuadrillas.innerHTML = '<p class="rep-empty">Sin datos disponibles.</p>';
    contenedorSemanas.innerHTML = '<p class="rep-empty">Sin datos disponibles.</p>';
    listaCanceladas.innerHTML = '<p class="rep-empty">Sin datos disponibles.</p>';
  }
}

// =============================================================================
// 4. RENDERIZADO DE KPIs, CUADRILLAS, SEMANAS Y CANCELADAS
// =============================================================================

function actualizarTextoPeriodo(desde, hasta, total) {
  if (desde && hasta) {
    resumenPeriodoTexto.textContent =
      `Mostrando ${total} orden(es) del ${formatearFechaLegible(desde, true)} al ${formatearFechaLegible(hasta, true)}.`;
  } else if (desde) {
    resumenPeriodoTexto.textContent =
      `Mostrando ${total} orden(es) a partir del ${formatearFechaLegible(desde, true)}.`;
  } else if (hasta) {
    resumenPeriodoTexto.textContent =
      `Mostrando ${total} orden(es) hasta el ${formatearFechaLegible(hasta, true)}.`;
  } else {
    resumenPeriodoTexto.textContent =
      `Mostrando todo el historial disponible (${total} orden(es)).`;
  }
}

function obtenerInfoCuadrilla(cuadrillaId) {
  if (cuadrillaId === null || cuadrillaId === undefined) {
    return { key: 'sin_asignar', nombre: 'Sin cuadrilla asignada', responsable: 'Pendiente de asignación' };
  }
  const info = mapaCuadrillas.get(Number(cuadrillaId));
  return {
    key: String(cuadrillaId),
    nombre: info?.nombre || `Cuadrilla #${cuadrillaId}`,
    responsable: info?.responsable || 'Sin responsable'
  };
}

function renderizarKPIs(ordenes) {
  const total = ordenes.length;
  const completadas = ordenes.filter(o => o.estado === 'completada').length;
  const canceladas = ordenes.filter(o => o.estado === 'cancelada').length;
  const pendientes = total - completadas - canceladas;

  const pctCumplimiento = calcularPorcentaje(completadas, total);
  const pctCanceladas = calcularPorcentaje(canceladas, total);
  const nivel = obtenerNivelClase(pctCumplimiento);

  kpiProgramadas.textContent = String(total);
  kpiCompletadas.textContent = String(completadas);
  kpiPendientesHint.textContent = `${pendientes} pendiente(s) o en proceso`;

  kpiPorcentaje.textContent = `${pctCumplimiento}%`;
  kpiBarraProgreso.style.width = `${pctCumplimiento}%`;
  kpiBarraProgreso.className = `kpi-progress-fill barra-${nivel}`;

  kpiCanceladas.textContent = String(canceladas);
  kpiCanceladasPct.textContent = `${pctCanceladas}% del periodo`;
}

function renderizarPorCuadrilla(ordenes) {
  if (ordenes.length === 0) {
    gridCuadrillas.innerHTML = '<p class="rep-empty">No hay órdenes programadas en el periodo seleccionado.</p>';
    return;
  }

  const grupos = new Map();

  for (const orden of ordenes) {
    const info = obtenerInfoCuadrilla(orden.cuadrilla_id);
    if (!grupos.has(info.key)) {
      grupos.set(info.key, {
        ...info,
        programadas: 0,
        completadas: 0,
        pendientes: 0,
        canceladas: 0
      });
    }
    const g = grupos.get(info.key);
    g.programadas++;
    if (orden.estado === 'completada') g.completadas++;
    else if (orden.estado === 'cancelada') g.canceladas++;
    else g.pendientes++;
  }

  const lista = [...grupos.values()].sort((a, b) => {
    const pctA = calcularPorcentaje(a.completadas, a.programadas);
    const pctB = calcularPorcentaje(b.completadas, b.programadas);
    if (pctB !== pctA) return pctB - pctA;
    return b.programadas - a.programadas;
  });

  gridCuadrillas.innerHTML = lista.map(item => {
    const pct = calcularPorcentaje(item.completadas, item.programadas);
    const nivel = obtenerNivelClase(pct);

    return `
      <article class="cuadrilla-rep-card">
        <div class="cuadrilla-rep-top">
          <div>
            <h3 class="cuadrilla-rep-nombre">${escaparHTML(item.nombre)}</h3>
            <p class="cuadrilla-rep-resp">Resp.: ${escaparHTML(item.responsable)}</p>
          </div>
          <span class="pct-pill pct-${nivel}">${pct}%</span>
        </div>

        <div class="barra-track" aria-label="Cumplimiento ${pct}%">
          <div class="barra-fill barra-${nivel}" style="width: ${pct}%;"></div>
        </div>

        <div class="cuadrilla-rep-stats">
          <div>
            <span class="stat-mini-num">${item.programadas}</span>
            <span class="stat-mini-lbl">Prog.</span>
          </div>
          <div>
            <span class="stat-mini-num" style="color:#15803d;">${item.completadas}</span>
            <span class="stat-mini-lbl">Comp.</span>
          </div>
          <div>
            <span class="stat-mini-num" style="color:#b45309;">${item.pendientes}</span>
            <span class="stat-mini-lbl">Pend.</span>
          </div>
          <div>
            <span class="stat-mini-num" style="color:#b91c1c;">${item.canceladas}</span>
            <span class="stat-mini-lbl">Canc.</span>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderizarPorSemanaYCuadrilla(ordenes) {
  if (ordenes.length === 0) {
    contenedorSemanas.innerHTML = '<p class="rep-empty">No hay datos semanales para el rango seleccionado.</p>';
    return;
  }

  const semanasMap = new Map();

  for (const orden of ordenes) {
    const sem = obtenerInfoSemanaISO(orden.fecha_programada);
    if (!semanasMap.has(sem.clave)) {
      semanasMap.set(sem.clave, {
        ...sem,
        programadas: 0,
        completadas: 0,
        canceladas: 0,
        pendientes: 0,
        cuadrillas: new Map()
      });
    }

    const bucketSemana = semanasMap.get(sem.clave);
    bucketSemana.programadas++;
    if (orden.estado === 'completada') bucketSemana.completadas++;
    else if (orden.estado === 'cancelada') bucketSemana.canceladas++;
    else bucketSemana.pendientes++;

    const infoCuad = obtenerInfoCuadrilla(orden.cuadrilla_id);
    if (!bucketSemana.cuadrillas.has(infoCuad.key)) {
      bucketSemana.cuadrillas.set(infoCuad.key, {
        ...infoCuad,
        programadas: 0,
        completadas: 0,
        pendientes: 0,
        canceladas: 0
      });
    }

    const bucketCuad = bucketSemana.cuadrillas.get(infoCuad.key);
    bucketCuad.programadas++;
    if (orden.estado === 'completada') bucketCuad.completadas++;
    else if (orden.estado === 'cancelada') bucketCuad.canceladas++;
    else bucketCuad.pendientes++;
  }

  // Ordenar de la semana más reciente a la más antigua
  const semanasOrdenadas = [...semanasMap.values()].sort((a, b) =>
    b.clave.localeCompare(a.clave)
  );

  contenedorSemanas.innerHTML = semanasOrdenadas.map(sem => {
    const pctSem = calcularPorcentaje(sem.completadas, sem.programadas);
    const nivelSem = obtenerNivelClase(pctSem);

    const filasCuadrillas = [...sem.cuadrillas.values()]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => {
        const pct = calcularPorcentaje(c.completadas, c.programadas);
        const nivel = obtenerNivelClase(pct);

        return `
          <tr>
            <td><strong>${escaparHTML(c.nombre)}</strong></td>
            <td class="celda-num">${c.programadas}</td>
            <td class="celda-num" style="color:#15803d;">${c.completadas}</td>
            <td class="celda-num" style="color:#b45309;">${c.pendientes}</td>
            <td class="celda-num" style="color:#b91c1c;">${c.canceladas}</td>
            <td class="celda-progreso">
              <div class="inline-bar-wrap">
                <div class="inline-bar-track">
                  <div class="barra-fill barra-${nivel}" style="width: ${pct}%;"></div>
                </div>
                <span class="inline-bar-pct">${pct}%</span>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    return `
      <article class="semana-card">
        <div class="semana-card-header">
          <h3 class="semana-titulo">${escaparHTML(sem.etiqueta)}</h3>
          <div class="semana-resumen-chips">
            <span>${sem.completadas} / ${sem.programadas} completadas</span>
            <span class="pct-pill pct-${nivelSem}">${pctSem}% cumplimiento</span>
          </div>
        </div>

        <div class="semana-tabla-wrap">
          <table class="semana-tabla">
            <thead>
              <tr>
                <th>Cuadrilla</th>
                <th class="celda-num">Programadas</th>
                <th class="celda-num">Completadas</th>
                <th class="celda-num">Pendientes</th>
                <th class="celda-num">Canceladas</th>
                <th>Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              ${filasCuadrillas}
            </tbody>
          </table>
        </div>
      </article>
    `;
  }).join('');
}

function renderizarCanceladas(ordenes) {
  const canceladas = ordenes.filter(o => o.estado === 'cancelada');
  badgeTotalCanceladas.textContent =
    canceladas.length === 1 ? '1 cancelada' : `${canceladas.length} canceladas`;

  if (canceladas.length === 0) {
    listaCanceladas.innerHTML =
      '<p class="rep-empty">No hubo órdenes canceladas en el periodo seleccionado.</p>';
    return;
  }

  listaCanceladas.innerHTML = canceladas.map(orden => {
    const condominio = mapaCondominios.get(Number(orden.condominio_id)) || `Condominio #${orden.condominio_id}`;
    const area = mapaAreas.get(Number(orden.area_id))?.nombre || `Área #${orden.area_id}`;
    const servicio = mapaServicios.get(Number(orden.servicio_id)) || `Servicio #${orden.servicio_id}`;
    const cuadrilla = obtenerInfoCuadrilla(orden.cuadrilla_id).nombre;
    const motivo = (orden.motivo_cancelacion || '').trim() || 'Sin motivo registrado';
    const canceladaPor = orden.cancelada_por
      ? (mapaUsuarios.get(String(orden.cancelada_por)) || 'Administrador')
      : 'Sin registro';

    return `
      <article class="cancelada-card">
        <div class="cancelada-top">
          <span class="cancelada-folio">Orden #${escaparHTML(String(orden.id))}</span>
          <span class="cancelada-fecha">${escaparHTML(formatearFechaLegible(orden.fecha_programada, true))}</span>
        </div>

        <div class="cancelada-meta">
          <strong>${escaparHTML(condominio)}</strong> · ${escaparHTML(area)}<br>
          <span>Servicio: ${escaparHTML(servicio)} · Cuadrilla: ${escaparHTML(cuadrilla)}</span>
        </div>

        <div class="cancelada-motivo">
          <strong>Motivo:</strong> ${escaparHTML(motivo)}
        </div>

        <div class="cancelada-pie">
          <span>Cancelada por: ${escaparHTML(canceladaPor)}</span>
          ${orden.cancelada_en ? `<span>Registrada: ${escaparHTML(new Date(orden.cancelada_en).toLocaleDateString('es-MX'))}</span>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

// =============================================================================
// 5. EVENTOS E INICIALIZACIÓN (EXCLUSIVO ADMINISTRADOR)
// =============================================================================

btnAplicarFiltros?.addEventListener('click', () => {
  botonesAtajo.forEach(b => b.classList.remove('active'));
  consultarYRenderizarReporte();
});

selectCuadrilla?.addEventListener('change', consultarYRenderizarReporte);

botonesAtajo.forEach(btn => {
  btn.addEventListener('click', () => {
    aplicarRangoAtajo(btn.dataset.periodo);
    consultarYRenderizarReporte();
  });
});

btnImprimir?.addEventListener('click', () => {
  window.print();
});

async function inicializar() {
  try {
    const sesion = await getActiveSession();
    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    if (nombreUsuarioReporte) {
      nombreUsuarioReporte.textContent = sesion.usuario.nombre || 'Administrador';
    }

    aplicarRangoAtajo('ultimas_4');
    await cargarCatalogos();
    await consultarYRenderizarReporte();
  } catch (err) {
    console.error('[Reportes] Error al inicializar:', err);
    mostrarAlerta(`Error al cargar el módulo de reportes: ${err.message}`);
  }
}

inicializar();