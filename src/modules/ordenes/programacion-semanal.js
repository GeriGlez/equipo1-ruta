// =============================================================================
// RUTA - PROGRAMACIÓN SEMANAL AUTOMÁTICA DE ÓRDENES DE SERVICIO (HU-05)
// Genera propuestas de órdenes a partir de contratos registrados, respetando
// frecuencias (1-5 días/semana, Quincenal, Mensual), días preferenciales,
// coherencia de catálogos, vista previa editable e idempotencia.
// =============================================================================

import {
  crearOrdenServicio,
  validarDatosOrden
} from './ordenes-db.js';

const STORAGE_AREAS_CONTRATO_KEY = 'ruta_preferencias_area_contrato_v1';

const NOMBRES_DIAS_ISO = {
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
  7: 'Domingo'
};

// =============================================================================
// 1. UTILIDADES DE TEXTO Y FECHAS (UTC / ISO)
// =============================================================================

export function normalizarNombreExacto(texto) {
  return String(texto ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function quitarAcentos(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function formatearFechaISO(dateUTC) {
  const y = dateUTC.getUTCFullYear();
  const m = String(dateUTC.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateUTC.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parsearFechaISO(fechaStr) {
  const limpio = String(fechaStr || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return null;
  const [y, m, d] = limpio.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== m ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

// Devuelve 1 (Lunes) .. 7 (Domingo)
export function obtenerDiaSemanaISO(dateUTC) {
  const day = dateUTC.getUTCDay();
  return day === 0 ? 7 : day;
}

export function obtenerLunesDeFecha(fechaInput) {
  let dt = fechaInput instanceof Date ? new Date(fechaInput.getTime()) : parsearFechaISO(fechaInput);
  if (!dt) {
    const hoy = new Date();
    dt = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  }
  const diaIso = obtenerDiaSemanaISO(dt);
  dt.setUTCDate(dt.getUTCDate() - (diaIso - 1));
  return dt;
}

// Convierte un valor tipo "2026-W44" o una fecha "2026-10-26" en el rango Lunes-Domingo
export function calcularRangoSemana(entradaSemana) {
  let lunesUTC = null;

  const valor = String(entradaSemana || '').trim();
  const matchWeek = /^(\d{4})-W(\d{2})$/i.exec(valor);

  if (matchWeek) {
    const anio = Number(matchWeek[1]);
    const numSemana = Number(matchWeek[2]);
    // ISO-8601: la semana 1 es la que contiene el 4 de enero
    const ene4 = new Date(Date.UTC(anio, 0, 4));
    const diaIsoEne4 = obtenerDiaSemanaISO(ene4);
    const lunesSemana1 = new Date(Date.UTC(anio, 0, 4 - (diaIsoEne4 - 1)));
    lunesUTC = new Date(lunesSemana1.getTime());
    lunesUTC.setUTCDate(lunesSemana1.getUTCDate() + (numSemana - 1) * 7);
  } else {
    lunesUTC = obtenerLunesDeFecha(valor);
  }

  const dias = [];
  const mapaDiaAFecha = {};

  for (let i = 0; i < 7; i++) {
    const d = new Date(lunesUTC.getTime());
    d.setUTCDate(lunesUTC.getUTCDate() + i);
    const isoDia = i + 1;
    const fecha = formatearFechaISO(d);
    dias.push({
      isoDia,
      nombreDia: NOMBRES_DIAS_ISO[isoDia],
      fecha
    });
    mapaDiaAFecha[isoDia] = fecha;
  }

  // Calcular código ISO YYYY-Www correspondiente a ese lunes
  const jueves = new Date(lunesUTC.getTime());
  jueves.setUTCDate(lunesUTC.getUTCDate() + 3);
  const anioIso = jueves.getUTCFullYear();
  const ene4 = new Date(Date.UTC(anioIso, 0, 4));
  const lunesSem1 = obtenerLunesDeFecha(ene4);
  const numSemIso = Math.round((lunesUTC.getTime() - lunesSem1.getTime()) / (7 * 86400000)) + 1;
  const codigoSemana = `${anioIso}-W${String(numSemIso).padStart(2, '0')}`;

  return {
    codigoSemana,
    fechaInicio: dias[0].fecha,
    fechaFin: dias[6].fecha,
    lunesUTC,
    dias,
    mapaDiaAFecha
  };
}

// =============================================================================
// 2. INTERPRETACIÓN DE DÍAS PREFERENCIALES Y FRECUENCIAS
// =============================================================================

export function extraerDiasPreferenciales(textoDias) {
  const limpio = quitarAcentos(textoDias);
  if (!limpio) return [];

  const encontrados = new Set();

  // Soporte de rangos como "lunes a viernes" o "lunes a sabado"
  const mapaNombres = [
    { patron: /\blunes\b/, iso: 1 },
    { patron: /\bmartes\b/, iso: 2 },
    { patron: /\bmiercoles\b/, iso: 3 },
    { patron: /\bjueves\b/, iso: 4 },
    { patron: /\bviernes\b/, iso: 5 },
    { patron: /\bsabados?\b/, iso: 6 },
    { patron: /\bdomingos?\b/, iso: 7 }
  ];

  const matchRango = /\b(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\s*(?:a|al|-)\s*(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)\b/.exec(limpio);
  if (matchRango) {
    const inicioEntry = mapaNombres.find(m => m.patron.test(matchRango[1]));
    const finEntry = mapaNombres.find(m => m.patron.test(matchRango[2]));
    if (inicioEntry && finEntry && inicioEntry.iso <= finEntry.iso) {
      for (let d = inicioEntry.iso; d <= finEntry.iso; d++) {
        encontrados.add(d);
      }
    }
  }

  for (const item of mapaNombres) {
    if (item.patron.test(limpio)) {
      encontrados.add(item.iso);
    }
  }

  return [...encontrados].sort((a, b) => a - b);
}

export function interpretarFrecuenciaContrato(frecuenciaTexto) {
  const limpio = quitarAcentos(frecuenciaTexto);
  if (!limpio) {
    return { valida: false, tipo: null, diasPorSemana: 0, motivo: 'El contrato no tiene una frecuencia definida.' };
  }

  const matchSemanal = /^([1-5])\s*dias?\s*(?:a\s*la|por)\s*semana$/.exec(limpio);
  if (matchSemanal) {
    const cantidad = Number(matchSemanal[1]);
    return {
      valida: true,
      tipo: 'semanal',
      diasPorSemana: cantidad,
      etiqueta: `${cantidad} ${cantidad === 1 ? 'día' : 'días'} a la semana`
    };
  }

  if (limpio === 'quincenal' || limpio.includes('quincenal')) {
    return {
      valida: true,
      tipo: 'quincenal',
      diasPorSemana: 1,
      etiqueta: 'Quincenal'
    };
  }

  if (limpio === 'mensual' || limpio.includes('mensual')) {
    return {
      valida: true,
      tipo: 'mensual',
      diasPorSemana: 1,
      etiqueta: 'Mensual'
    };
  }

  return {
    valida: false,
    tipo: null,
    diasPorSemana: 0,
    motivo: `Frecuencia no reconocida ("${frecuenciaTexto}").`
  };
}

export function construirClaveProgramacion(contratoId, fechaProgramada) {
  return `contrato:${Number(contratoId)}:fecha:${String(fechaProgramada).trim()}`;
}

// =============================================================================
// 3. PREFERENCIAS LOCALES DE ÁREA POR CONTRATO
// =============================================================================

export function obtenerPreferenciasAreaContrato() {
  try {
    const raw = localStorage.getItem(STORAGE_AREAS_CONTRATO_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function guardarPreferenciaAreaContrato(contratoId, areaId) {
  if (!contratoId || !areaId) return;
  try {
    const actual = obtenerPreferenciasAreaContrato();
    actual[String(contratoId)] = Number(areaId);
    localStorage.setItem(STORAGE_AREAS_CONTRATO_KEY, JSON.stringify(actual));
  } catch {
    // Ignorar errores de almacenamiento restringido
  }
}

function sugerirAreaPorServicio(servicioNombre, areasDelCondominio) {
  if (!Array.isArray(areasDelCondominio) || areasDelCondominio.length === 0) return null;
  const texto = quitarAcentos(servicioNombre);

  let tipoBuscado = null;
  if (texto.includes('alberca') || texto.includes('piscina') || texto.includes('cloro') || texto.includes('ph')) {
    tipoBuscado = 'alberca';
  } else if (texto.includes('jardin') || texto.includes('poda') || texto.includes('cesped') || texto.includes('riego')) {
    tipoBuscado = 'jardin';
  } else if (texto.includes('equipo') || texto.includes('bomba') || texto.includes('hidro') || texto.includes('caldera')) {
    tipoBuscado = 'equipo';
  } else if (texto.includes('comun') || texto.includes('pasillo') || texto.includes('salon') || texto.includes('terraza')) {
    tipoBuscado = 'area_comun';
  }

  if (!tipoBuscado) return null;

  const candidatas = areasDelCondominio.filter(a => {
    const t = quitarAcentos(a.tipo).replace('-', '_');
    return t === tipoBuscado;
  });

  return candidatas.length === 1 ? candidatas[0] : null;
}

// =============================================================================
// 4. EVALUACIÓN DE PERIODICIDAD QUINCENAL Y MENSUAL
// =============================================================================

function evaluarCorrespondenciaPeriodo({
  contrato,
  infoFrecuencia,
  diasSeleccionados,
  semana,
  ordenesExistentes,
  condominioId,
  servicioId
}) {
  if (infoFrecuencia.tipo === 'semanal') {
    return {
      corresponde: true,
      requiereConfirmacionFrecuencia: false,
      avisoPeriodicidad: null
    };
  }

  // Buscar órdenes previas asociadas a este contrato (o par condominio+servicio si no tenían contrato_id)
  const ordenesDelContrato = (ordenesExistentes || []).filter(o => {
    if (o.estado === 'cancelada' || o.operacion_pendiente === 'eliminar') return false;
    if (o.contrato_id && Number(o.contrato_id) === Number(contrato.id)) return true;
    if (!o.contrato_id && Number(o.condominio_id) === Number(condominioId) && Number(o.servicio_id) === Number(servicioId)) {
      return true;
    }
    return false;
  });

  // Determinar fecha de referencia del contrato
  const fechaRefRaw =
    contrato.fecha_inicio ||
    (contrato.created_at ? String(contrato.created_at).slice(0, 10) : null);

  const fechaRefUTC = parsearFechaISO(fechaRefRaw);
  const sinFechaReferencia = !fechaRefUTC;

  if (infoFrecuencia.tipo === 'quincenal') {
    // 1. Si existe una orden en la semana inmediatamente anterior o siguiente, no toca esta semana
    const lunesAnterior = new Date(semana.lunesUTC.getTime() - 7 * 86400000);
    const domingoAnterior = new Date(semana.lunesUTC.getTime() - 1 * 86400000);
    const iniAnt = formatearFechaISO(lunesAnterior);
    const finAnt = formatearFechaISO(domingoAnterior);

    const tuvoSemanaAnterior = ordenesDelContrato.some(
      o => o.fecha_programada >= iniAnt && o.fecha_programada <= finAnt
    );
    if (tuvoSemanaAnterior) {
      return {
        corresponde: false,
        motivoOmision: `Contrato quincenal: ya tuvo ejecución en la semana previa (${iniAnt} a ${finAnt}).`
      };
    }

    if (fechaRefUTC) {
      const lunesRef = obtenerLunesDeFecha(fechaRefUTC);
      const diffSemanas = Math.round(
        (semana.lunesUTC.getTime() - lunesRef.getTime()) / (7 * 86400000)
      );

      if (diffSemanas < 0) {
        return {
          corresponde: false,
          motivoOmision: `Contrato quincenal: la semana seleccionada es anterior a la fecha de referencia del contrato (${formatearFechaISO(fechaRefUTC)}).`
        };
      }

      if (diffSemanas % 2 !== 0) {
        return {
          corresponde: false,
          motivoOmision: `Contrato quincenal: no corresponde en esta semana según su ciclo quincenal iniciado en ${formatearFechaISO(fechaRefUTC)}.`
        };
      }

      return {
        corresponde: true,
        requiereConfirmacionFrecuencia: false,
        avisoPeriodicidad: `Ciclo quincenal activo (referencia: ${formatearFechaISO(fechaRefUTC)}).`
      };
    }

    // Sin fecha de referencia en el contrato: proponer en vista previa con aviso explícito
    return {
      corresponde: true,
      requiereConfirmacionFrecuencia: true,
      avisoPeriodicidad:
        'Contrato quincenal sin fecha de inicio de referencia: confirma en la vista previa si corresponde programar esta semana.'
    };
  }

  if (infoFrecuencia.tipo === 'mensual') {
    // Determinar el mes de la fecha preferencial dentro de la semana
    const primerDiaIso = diasSeleccionados[0];
    const fechaPropuesta = semana.mapaDiaAFecha[primerDiaIso] || semana.fechaInicio;
    const mesPropuesto = fechaPropuesta.slice(0, 7); // YYYY-MM

    // Verificar si ya existe orden en este mismo mes fuera de esta semana
    const ordenEnMismoMesOtraSemana = ordenesDelContrato.find(
      o =>
        String(o.fecha_programada || '').startsWith(mesPropuesto) &&
        (o.fecha_programada < semana.fechaInicio || o.fecha_programada > semana.fechaFin)
    );

    if (ordenEnMismoMesOtraSemana) {
      return {
        corresponde: false,
        motivoOmision: `Contrato mensual: ya cuenta con orden programada en el mes ${mesPropuesto} (${ordenEnMismoMesOtraSemana.fecha_programada}).`
      };
    }

    if (fechaRefUTC) {
      const lunesRef = obtenerLunesDeFecha(fechaRefUTC);
      const diffSemanas = Math.round(
        (semana.lunesUTC.getTime() - lunesRef.getTime()) / (7 * 86400000)
      );

      if (diffSemanas < 0) {
        return {
          corresponde: false,
          motivoOmision: `Contrato mensual: la semana seleccionada es anterior a la fecha de referencia (${formatearFechaISO(fechaRefUTC)}).`
        };
      }

      if (diffSemanas % 4 !== 0) {
        return {
          corresponde: false,
          motivoOmision: `Contrato mensual: no corresponde en esta semana según su ciclo mensual (referencia: ${formatearFechaISO(fechaRefUTC)}).`
        };
      }

      return {
        corresponde: true,
        requiereConfirmacionFrecuencia: false,
        avisoPeriodicidad: `Ciclo mensual activo (referencia: ${formatearFechaISO(fechaRefUTC)}).`
      };
    }

    // Si no tiene fecha de referencia, solo corresponde en la primera ocurrencia del día en el mes
    const diaDelMes = Number(fechaPropuesta.slice(8, 10));
    if (diaDelMes > 7) {
      return {
        corresponde: false,
        motivoOmision: `Contrato mensual: se programa en la primera semana del mes para el día preferencial (esta fecha es día ${diaDelMes}).`
      };
    }

    return {
      corresponde: true,
      requiereConfirmacionFrecuencia: true,
      avisoPeriodicidad:
        'Contrato mensual sin fecha de referencia explícita: propuesto en la primera ocurrencia del mes; confirma en la vista previa.'
    };
  }

  return { corresponde: false, motivoOmision: 'Frecuencia no aplicable.' };
}

// =============================================================================
// 5. GENERACIÓN DE LA VISTA PREVIA SEMANAL A PARTIR DE LOS CONTRATOS
// =============================================================================

export function generarVistaPreviaSemanal({
  entradaSemana,
  contratos = [],
  condominios = [],
  areas = [],
  servicios = [],
  ordenesExistentes = [],
  preferenciasArea = null
}) {
  const semana = calcularRangoSemana(entradaSemana);
  const prefsArea = preferenciasArea || obtenerPreferenciasAreaContrato();

  const propuestas = [];
  const noGenerables = [];
  const omitidosPorFrecuencia = [];

  // Contar cuántos contratos comparten el mismo par (condominio_id, servicio_id)
  // para no confundir dos contratos distintos del mismo servicio.
  const conteoContratosPorPar = new Map();

  // Primera pasada: resolver condominio y servicio de cada contrato de forma inequívoca
  const contratosEvaluados = contratos.map(contrato => {
    if (contrato.activo === false) {
      return { contrato, inactivo: true };
    }

    // 1. Resolver condominio
    let condominio = null;
    if (contrato.condominio_id) {
      condominio = condominios.find(c => Number(c.id) === Number(contrato.condominio_id)) || null;
      if (!condominio) {
        return {
          contrato,
          error: `El condominio_id #${contrato.condominio_id} del contrato no existe en el catálogo.`
        };
      }
    } else {
      const nombreBuscado = normalizarNombreExacto(contrato.nombre_condominio);
      if (!nombreBuscado) {
        return {
          contrato,
          error: 'El contrato no tiene nombre de condominio especificado.'
        };
      }
      const coincidenciasCondo = condominios.filter(
        c => normalizarNombreExacto(c.nombre) === nombreBuscado
      );
      if (coincidenciasCondo.length === 0) {
        return {
          contrato,
          error: `El condominio "${contrato.nombre_condominio}" no coincide con ningún condominio registrado en el catálogo.`
        };
      }
      if (coincidenciasCondo.length > 1) {
        return {
          contrato,
          error: `El nombre de condominio "${contrato.nombre_condominio}" es ambiguo (coincide con ${coincidenciasCondo.length} registros).`
        };
      }
      condominio = coincidenciasCondo[0];
    }

    if (condominio.activo === false) {
      return {
        contrato,
        error: `El condominio "${condominio.nombre}" se encuentra inactivo.`
      };
    }

    // 2. Resolver servicio
    let servicio = null;
    if (contrato.servicio_id) {
      servicio = servicios.find(s => Number(s.id) === Number(contrato.servicio_id)) || null;
      if (!servicio) {
        return {
          contrato,
          error: `El servicio_id #${contrato.servicio_id} del contrato no existe en el catálogo.`
        };
      }
    } else {
      const nombreServ = normalizarNombreExacto(contrato.servicio_nombre);
      if (!nombreServ) {
        return {
          contrato,
          error: `El contrato de "${condominio.nombre}" no tiene un servicio contratado especificado.`
        };
      }
      const coincidenciasServ = servicios.filter(
        s => normalizarNombreExacto(s.nombre) === nombreServ
      );
      if (coincidenciasServ.length === 0) {
        return {
          contrato,
          error: `El servicio "${contrato.servicio_nombre}" no existe en el catálogo de servicios.`
        };
      }
      if (coincidenciasServ.length > 1) {
        return {
          contrato,
          error: `El servicio "${contrato.servicio_nombre}" es ambiguo en el catálogo (${coincidenciasServ.length} coincidencias).`
        };
      }
      servicio = coincidenciasServ[0];
    }

    // 3. Verificar áreas registradas del condominio
    const areasDelCondominio = areas.filter(
      a => Number(a.condominio_id) === Number(condominio.id)
    );
    if (areasDelCondominio.length === 0) {
      return {
        contrato,
        error: `El condominio "${condominio.nombre}" no tiene áreas registradas en el catálogo.`
      };
    }

    const clavePar = `${condominio.id}:${servicio.id}`;
    conteoContratosPorPar.set(clavePar, (conteoContratosPorPar.get(clavePar) || 0) + 1);

    return {
      contrato,
      condominio,
      servicio,
      areasDelCondominio
    };
  });

  // Segunda pasada: evaluar frecuencia, días preferenciales, área e idempotencia
  for (const item of contratosEvaluados) {
    const { contrato } = item;
    if (item.inactivo) continue;

    if (item.error) {
      noGenerables.push({
        contrato_id: contrato.id,
        nombre_condominio: contrato.nombre_condominio || 'Sin condominio',
        servicio_nombre: contrato.servicio_nombre || 'Sin servicio',
        frecuencia: contrato.frecuencia || 'N/A',
        dias_preferenciales: contrato.dias_preferenciales || 'N/A',
        motivo: item.error
      });
      continue;
    }

    const { condominio, servicio, areasDelCondominio } = item;
    const infoFrecuencia = interpretarFrecuenciaContrato(contrato.frecuencia);

    if (!infoFrecuencia.valida) {
      noGenerables.push({
        contrato_id: contrato.id,
        nombre_condominio: condominio.nombre,
        servicio_nombre: servicio.nombre,
        frecuencia: contrato.frecuencia || 'N/A',
        dias_preferenciales: contrato.dias_preferenciales || 'N/A',
        motivo: infoFrecuencia.motivo
      });
      continue;
    }

    const diasExtraidos = extraerDiasPreferenciales(contrato.dias_preferenciales);
    if (diasExtraidos.length === 0) {
      noGenerables.push({
        contrato_id: contrato.id,
        nombre_condominio: condominio.nombre,
        servicio_nombre: servicio.nombre,
        frecuencia: contrato.frecuencia,
        dias_preferenciales: contrato.dias_preferenciales || 'Vacío',
        motivo: `No se pudieron determinar días preferenciales válidos a partir de "${contrato.dias_preferenciales || ''}".`
      });
      continue;
    }

    if (infoFrecuencia.tipo === 'semanal' && diasExtraidos.length < infoFrecuencia.diasPorSemana) {
      noGenerables.push({
        contrato_id: contrato.id,
        nombre_condominio: condominio.nombre,
        servicio_nombre: servicio.nombre,
        frecuencia: contrato.frecuencia,
        dias_preferenciales: contrato.dias_preferenciales,
        motivo: `El contrato indica "${contrato.frecuencia}" pero solo especifica ${diasExtraidos.length} día(s) preferencial(es) (${diasExtraidos.map(d => NOMBRES_DIAS_ISO[d]).join(', ')}).`
      });
      continue;
    }

    // Seleccionar los días que corresponden según la frecuencia
    const cantidadDiasObjetivo =
      infoFrecuencia.tipo === 'semanal' ? infoFrecuencia.diasPorSemana : 1;
    const diasSeleccionados = diasExtraidos.slice(0, cantidadDiasObjetivo);
    let avisoDiasRecortados = null;

    if (diasExtraidos.length > cantidadDiasObjetivo) {
      avisoDiasRecortados = `El contrato lista ${diasExtraidos.length} días (${diasExtraidos.map(d => NOMBRES_DIAS_ISO[d]).join(', ')}) para una frecuencia "${infoFrecuencia.etiqueta}". Se preseleccionó: ${diasSeleccionados.map(d => NOMBRES_DIAS_ISO[d]).join(', ')}. Puedes ajustar la fecha en la vista previa.`;
    }

    // Evaluar si corresponde en esta semana (para contratos quincenales o mensuales)
    const evalPeriodo = evaluarCorrespondenciaPeriodo({
      contrato,
      infoFrecuencia,
      diasSeleccionados,
      semana,
      ordenesExistentes,
      condominioId: condominio.id,
      servicioId: servicio.id
    });

    if (!evalPeriodo.corresponde) {
      omitidosPorFrecuencia.push({
        contrato_id: contrato.id,
        nombre_condominio: condominio.nombre,
        servicio_nombre: servicio.nombre,
        frecuencia: contrato.frecuencia,
        dias_preferenciales: contrato.dias_preferenciales,
        motivo: evalPeriodo.motivoOmision
      });
      continue;
    }

    // Determinar el área del contrato:
    // 1) Si el contrato tiene area_id válida del condominio, se usa.
    // 2) Si el administrador ya asignó un área previa a este contrato, se usa.
    // 3) Si el condominio solo tiene 1 área registrada, la relación es inequívoca y se preselecciona.
    // 4) Si tiene múltiples áreas y el contrato no especifica cuál, se deja sin seleccionar (null)
    //    para que el administrador la asigne explícitamente en la vista previa (con sugerencia por tipo).
    let areaPreseleccionadaId = null;
    let origenArea = 'pendiente';
    const areaSugerida = sugerirAreaPorServicio(servicio.nombre, areasDelCondominio);

    if (
      contrato.area_id &&
      areasDelCondominio.some(a => Number(a.id) === Number(contrato.area_id))
    ) {
      areaPreseleccionadaId = Number(contrato.area_id);
      origenArea = 'contrato';
    } else if (
      prefsArea[String(contrato.id)] &&
      areasDelCondominio.some(a => Number(a.id) === Number(prefsArea[String(contrato.id)]))
    ) {
      areaPreseleccionadaId = Number(prefsArea[String(contrato.id)]);
      origenArea = 'preferencia_guardada';
    } else if (areasDelCondominio.length === 1) {
      areaPreseleccionadaId = Number(areasDelCondominio[0].id);
      origenArea = 'unica_en_condominio';
    }

    const clavePar = `${condominio.id}:${servicio.id}`;
    const hayMultiplesContratosMismoServicio = (conteoContratosPorPar.get(clavePar) || 0) > 1;

    // Generar una orden propuesta independiente por cada fecha prevista en la semana
    for (const isoDia of diasSeleccionados) {
      const fechaProgramada = semana.mapaDiaAFecha[isoDia];
      if (!fechaProgramada) continue;

      const claveProgramacion = construirClaveProgramacion(contrato.id, fechaProgramada);

      // Comprobar si ya existe una orden generada para este contrato y fecha
      const ordenExistente = (ordenesExistentes || []).find(o => {
        if (o.operacion_pendiente === 'eliminar') return false;
        if (o.clave_programacion && o.clave_programacion === claveProgramacion) {
          return true;
        }
        if (
          o.contrato_id &&
          Number(o.contrato_id) === Number(contrato.id) &&
          String(o.fecha_programada) === fechaProgramada
        ) {
          return true;
        }
        // Fallback para órdenes guardadas en esquema sin columna contrato_id/clave_programacion,
        // únicamente cuando no hay otro contrato del mismo servicio en el mismo condominio.
        if (
          !o.contrato_id &&
          !o.clave_programacion &&
          !hayMultiplesContratosMismoServicio &&
          Number(o.condominio_id) === Number(condominio.id) &&
          Number(o.servicio_id) === Number(servicio.id) &&
          String(o.fecha_programada) === fechaProgramada &&
          o.estado !== 'cancelada'
        ) {
          return true;
        }
        return false;
      });

      const areaEfectivaId = ordenExistente
        ? Number(ordenExistente.area_id)
        : areaPreseleccionadaId;

      const areaObj = areasDelCondominio.find(a => Number(a.id) === Number(areaEfectivaId)) || null;

      propuestas.push({
        propuesta_id: `prop:${contrato.id}:${fechaProgramada}`,
        incluir: !ordenExistente,
        yaExiste: Boolean(ordenExistente),
        ordenExistenteId: ordenExistente?.id || null,
        ordenExistenteEstado: ordenExistente?.estado || null,
        contrato_id: Number(contrato.id),
        frecuencia: contrato.frecuencia,
        dias_preferenciales: contrato.dias_preferenciales,
        condominio_id: Number(condominio.id),
        condominio_nombre: condominio.nombre,
        servicio_id: Number(servicio.id),
        servicio_nombre: servicio.nombre,
        area_id: areaEfectivaId,
        area_nombre: areaObj ? areaObj.nombre : null,
        origen_area: origenArea,
        area_sugerida_id: areaSugerida ? Number(areaSugerida.id) : null,
        area_sugerida_nombre: areaSugerida ? areaSugerida.nombre : null,
        areas_disponibles: areasDelCondominio.map(a => ({
          id: Number(a.id),
          nombre: a.nombre,
          tipo: a.tipo
        })),
        dia_semana_iso: isoDia,
        dia_semana_nombre: NOMBRES_DIAS_ISO[isoDia],
        fecha_programada: fechaProgramada,
        clave_programacion: claveProgramacion,
        requiereConfirmacionFrecuencia: Boolean(evalPeriodo.requiereConfirmacionFrecuencia),
        avisos: [evalPeriodo.avisoPeriodicidad, avisoDiasRecortados].filter(Boolean)
      });
    }
  }

  // Ordenar propuestas por fecha programada, luego por nombre de condominio y servicio
  propuestas.sort((a, b) => {
    if (a.fecha_programada !== b.fecha_programada) {
      return a.fecha_programada.localeCompare(b.fecha_programada);
    }
    const cmpCondo = a.condominio_nombre.localeCompare(b.condominio_nombre, 'es');
    if (cmpCondo !== 0) return cmpCondo;
    return a.servicio_nombre.localeCompare(b.servicio_nombre, 'es');
  });

  return {
    semana,
    propuestas,
    noGenerables,
    omitidosPorFrecuencia
  };
}

// =============================================================================
// 6. CONFIRMACIÓN Y GUARDADO IDEMPOTENTE DE LA PROGRAMACIÓN SEMANAL
// =============================================================================

export async function confirmarProgramacionSemanal({
  semana,
  propuestasRevisadas = [],
  noGenerablesPrevios = [],
  catalogos = {},
  ordenesExistentes = []
}) {
  const ordenesCreadas = [];
  const yaExistentes = [];
  const noGeneradas = [...(noGenerablesPrevios || [])];
  const clavesProcesadasEnLote = new Set();
  let todasEnServidor = true;

  for (const prop of propuestasRevisadas) {
    // Si ya existía originalmente, la contabilizamos en yaExistentes
    if (prop.yaExiste) {
      yaExistentes.push({
        contrato_id: prop.contrato_id,
        condominio_nombre: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: prop.fecha_programada,
        orden_id: prop.ordenExistenteId
      });
      continue;
    }

    // Si el administrador desmarcó explícitamente la fila en la vista previa
    if (prop.incluir === false) {
      continue;
    }

    const fecha = String(prop.fecha_programada || '').trim();
    const areaId = Number(prop.area_id);
    const condominioId = Number(prop.condominio_id);
    const servicioId = Number(prop.servicio_id);
    const contratoId = Number(prop.contrato_id);

    // 1. Validar que la fecha esté dentro de la semana seleccionada
    if (!fecha || fecha < semana.fechaInicio || fecha > semana.fechaFin) {
      noGeneradas.push({
        contrato_id: contratoId,
        nombre_condominio: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha || 'Sin fecha',
        motivo: `La fecha "${fecha || 'vacía'}" está fuera de la semana seleccionada (${semana.fechaInicio} al ${semana.fechaFin}).`
      });
      continue;
    }

    // 2. Validar que el administrador haya asignado un área válida del condominio
    if (!Number.isInteger(areaId) || areaId <= 0) {
      noGeneradas.push({
        contrato_id: contratoId,
        nombre_condominio: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha,
        motivo: `Falta seleccionar el área obligatoria para el condominio "${prop.condominio_nombre}".`
      });
      continue;
    }

    try {
      validarDatosOrden(
        {
          condominio_id: condominioId,
          area_id: areaId,
          servicio_id: servicioId,
          fecha_programada: fecha
        },
        catalogos
      );
    } catch (errValidacion) {
      noGeneradas.push({
        contrato_id: contratoId,
        nombre_condominio: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha,
        motivo: errValidacion.message
      });
      continue;
    }

    const claveProgramacion = construirClaveProgramacion(contratoId, fecha);

    // 3. Verificar idempotencia dentro del mismo lote y contra las órdenes actuales
    if (clavesProcesadasEnLote.has(claveProgramacion)) {
      yaExistentes.push({
        contrato_id: contratoId,
        condominio_nombre: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha,
        motivo: 'Ocurrencia duplicada en la misma solicitud para el mismo contrato y fecha.'
      });
      continue;
    }

    const duplicadaActual = (ordenesExistentes || []).find(o => {
      if (o.operacion_pendiente === 'eliminar') return false;
      if (o.clave_programacion && o.clave_programacion === claveProgramacion) return true;
      if (
        o.contrato_id &&
        Number(o.contrato_id) === contratoId &&
        String(o.fecha_programada) === fecha
      ) {
        return true;
      }
      return false;
    });

    if (duplicadaActual) {
      yaExistentes.push({
        contrato_id: contratoId,
        condominio_nombre: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha,
        orden_id: duplicadaActual.id
      });
      continue;
    }

    // 4. Crear la orden con estado inicial 'programada' y trazabilidad del contrato
    try {
      const resultadoCreacion = await crearOrdenServicio(
        {
          condominio_id: condominioId,
          area_id: areaId,
          servicio_id: servicioId,
          fecha_programada: fecha,
          estado: 'programada',
          contrato_id: contratoId,
          origen_generacion: 'programacion_semanal',
          clave_programacion: claveProgramacion
        },
        catalogos
      );

      clavesProcesadasEnLote.add(claveProgramacion);
      guardarPreferenciaAreaContrato(contratoId, areaId);

      if (!resultadoCreacion.guardadoEnServidor) {
        todasEnServidor = false;
      }

      ordenesCreadas.push(resultadoCreacion.orden);
      ordenesExistentes.push(resultadoCreacion.orden);
    } catch (errCreacion) {
      noGeneradas.push({
        contrato_id: contratoId,
        nombre_condominio: prop.condominio_nombre,
        servicio_nombre: prop.servicio_nombre,
        fecha_programada: fecha,
        motivo: errCreacion.message || 'Error al guardar la orden.'
      });
    }
  }

  return {
    generadas: ordenesCreadas.length,
    yaExistentes: yaExistentes.length,
    noGeneradas: noGeneradas.length,
    detalleYaExistentes: yaExistentes,
    detalleNoGeneradas: noGeneradas,
    ordenesCreadas,
    guardadoEnServidor: todasEnServidor
  };
}
