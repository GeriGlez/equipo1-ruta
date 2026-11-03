// =============================================================================
// RUTA - MÓDULO DE ÓRDENES DE SERVICIO (HU-05, HU-06, HU-07)
// Persistencia local en IndexedDB (RUTA_Local), gestión online/offline y
// cola de sincronización segura con Supabase sin alterar almacenes de visitas.
// Implementa BAJA LÓGICA (activo = false) al eliminar para conservar historial en DB.
// =============================================================================

import { supabase } from '../../services/supabase.js';
import { abrirBD } from '../visitas/db-local.js';

const STORE_ORDENES = 'ordenes_admin';
const STORE_COLA = 'ordenes_cola_sync';
const STORE_CATALOGOS = 'ordenes_catalogos';
const STORAGE_INHABILITADAS_KEY = 'ruta_ordenes_inhabilitadas_v1';

// Control de soporte de columnas extendidas en Supabase (fallback automático si
// la migración 03 aún no se ha ejecutado en la instancia remota).
let esquemaRemotoExtendido = true;
let soportaColumnaActivo = true;

function obtenerIdsInhabilitadosLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_INHABILITADAS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(arr.map(Number));
  } catch {
    return new Set();
  }
}

function registrarIdInhabilitadoLocal(id) {
  if (!id) return;
  try {
    const set = obtenerIdsInhabilitadosLocal();
    set.add(Number(id));
    localStorage.setItem(STORAGE_INHABILITADAS_KEY, JSON.stringify([...set]));
  } catch {
    // Ignorar si localStorage no está disponible
  }
}

export function esErrorDeRed(error) {
  if (!navigator.onLine) return true;
  const msg = String(error?.message || error?.details || error || '').toLowerCase();
  return (
    error instanceof TypeError ||
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('internet') ||
    msg.includes('fetch') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  );
}

function esErrorColumnaInexistente(error) {
  const codigo = String(error?.code || '');
  const msg = String(error?.message || error?.details || '').toLowerCase();
  return (
    codigo === '42703' ||
    codigo === 'PGRST204' ||
    (msg.includes('column') && msg.includes('does not exist')) ||
    (msg.includes('could not find') && msg.includes('schema cache'))
  );
}

function generarUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// 1. GESTIÓN DE CATÁLOGOS EN INDEXEDDB (ordenes_catalogos)
// =============================================================================

export async function guardarCatalogoLocal(catalogo, datos) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATALOGOS, 'readwrite');
    const store = tx.objectStore(STORE_CATALOGOS);
    store.put({
      catalogo,
      datos: Array.isArray(datos) ? datos : [],
      actualizado_en: new Date().toISOString()
    });
    tx.oncomplete = () => {
      db.close();
      resolve(datos);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function obtenerCatalogoLocal(catalogo) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CATALOGOS, 'readonly');
    const store = tx.objectStore(STORE_CATALOGOS);
    const req = store.get(catalogo);
    let resultado = [];
    req.onsuccess = () => {
      resultado = req.result?.datos || [];
    };
    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function cargarCatalogosCompletos() {
  if (navigator.onLine) {
    try {
      const [resCondominios, resAreas, resServicios, resContratos] = await Promise.all([
        supabase.from('condominios').select('id, nombre, activo').order('nombre', { ascending: true }),
        supabase.from('areas').select('id, condominio_id, nombre, tipo, requiere_lecturas').order('nombre', { ascending: true }),
        supabase.from('servicios').select('id, nombre, descripcion, duracion_estimada_min').order('nombre', { ascending: true }),
        supabase.from('contratos').select('*').order('id', { ascending: true })
      ]);

      if (resCondominios.error) throw resCondominios.error;
      if (resAreas.error) throw resAreas.error;
      if (resServicios.error) throw resServicios.error;

      const condominios = resCondominios.data || [];
      const areas = resAreas.data || [];
      const servicios = resServicios.data || [];
      const contratos = resContratos.error ? await obtenerCatalogoLocal('contratos') : (resContratos.data || []);

      await Promise.all([
        guardarCatalogoLocal('condominios', condominios),
        guardarCatalogoLocal('areas', areas),
        guardarCatalogoLocal('servicios', servicios),
        guardarCatalogoLocal('contratos', contratos)
      ]);

      return {
        condominios,
        areas,
        servicios,
        contratos,
        fuente: 'online'
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        console.warn('[Órdenes] Advertencia al consultar catálogos en Supabase, usando copia local:', error);
      }
    }
  }

  const [condominios, areas, servicios, contratos] = await Promise.all([
    obtenerCatalogoLocal('condominios'),
    obtenerCatalogoLocal('areas'),
    obtenerCatalogoLocal('servicios'),
    obtenerCatalogoLocal('contratos')
  ]);

  return {
    condominios,
    areas,
    servicios,
    contratos,
    fuente: 'offline'
  };
}

// =============================================================================
// 2. VALIDACIONES DE INTEGRIDAD Y REGLAS DE NEGOCIO DE ÓRDENES
// =============================================================================

export function validarDatosOrden(datos, catalogos = {}) {
  const condominioId = Number(datos?.condominio_id);
  const areaId = Number(datos?.area_id);
  const servicioId = Number(datos?.servicio_id);
  const fechaProgramada = String(datos?.fecha_programada || '').trim();

  if (!Number.isInteger(condominioId) || condominioId <= 0) {
    throw new Error('Debes seleccionar un condominio válido.');
  }
  if (!Number.isInteger(areaId) || areaId <= 0) {
    throw new Error('Debes seleccionar un área válida.');
  }
  if (!Number.isInteger(servicioId) || servicioId <= 0) {
    throw new Error('Debes seleccionar un servicio válido.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaProgramada)) {
    throw new Error('Debes ingresar una fecha programada válida (YYYY-MM-DD).');
  }

  const [anio, mes, dia] = fechaProgramada.split('-').map(Number);
  const fechaObj = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    Number.isNaN(fechaObj.getTime()) ||
    fechaObj.getUTCFullYear() !== anio ||
    fechaObj.getUTCMonth() + 1 !== mes ||
    fechaObj.getUTCDate() !== dia
  ) {
    throw new Error('La fecha programada indicada no existe en el calendario.');
  }

  if (Array.isArray(catalogos.condominios) && catalogos.condominios.length > 0) {
    const condominio = catalogos.condominios.find(c => Number(c.id) === condominioId);
    if (!condominio) {
      throw new Error('El condominio seleccionado no existe en el catálogo.');
    }
    if (condominio.activo === false) {
      throw new Error(`El condominio "${condominio.nombre}" está inactivo y no admite nuevas órdenes.`);
    }
  }

  if (Array.isArray(catalogos.areas) && catalogos.areas.length > 0) {
    const area = catalogos.areas.find(a => Number(a.id) === areaId);
    if (!area) {
      throw new Error('El área seleccionada no existe en el catálogo.');
    }
    if (
      area.condominio_id !== undefined &&
      area.condominio_id !== null &&
      Number(area.condominio_id) !== condominioId
    ) {
      throw new Error('El área seleccionada no pertenece al condominio indicado.');
    }
  }

  if (Array.isArray(catalogos.servicios) && catalogos.servicios.length > 0) {
    const servicio = catalogos.servicios.find(s => Number(s.id) === servicioId);
    if (!servicio) {
      throw new Error('El servicio seleccionado no existe en el catálogo.');
    }
  }

  return {
    condominio_id: condominioId,
    area_id: areaId,
    servicio_id: servicioId,
    fecha_programada: fechaProgramada
  };
}

export function puedeEditarOrden(orden) {
  if (!orden) return false;
  if (orden.operacion_pendiente === 'eliminar' || orden.activo === false) return false;
  return orden.estado === 'programada' || orden.estado === 'asignada';
}

export function puedeCancelarOrden(orden) {
  if (!orden) return false;
  if (orden.operacion_pendiente === 'eliminar' || orden.activo === false) return false;
  return orden.estado === 'programada' || orden.estado === 'asignada' || orden.estado === 'en_proceso';
}

export function puedeEliminarOrden(orden) {
  if (!orden) return false;
  if (orden.activo === false) return false;
  if (orden.estado === 'en_proceso' || orden.estado === 'completada') {
    return false;
  }
  return true;
}

// Verifica si una orden tiene visitas registradas localmente en el almacén 'visitas'
export async function ordenTieneVisitasLocales(ordenId) {
  if (ordenId === null || ordenId === undefined) return false;
  const db = await abrirBD();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('visitas', 'readonly');
      const store = tx.objectStore('visitas');
      const req = store.getAll();
      let tiene = false;
      req.onsuccess = () => {
        const visitas = req.result || [];
        tiene = visitas.some(v => Number(v.orden_id) === Number(ordenId));
      };
      tx.oncomplete = () => {
        db.close();
        resolve(tiene);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

// =============================================================================
// 3. ALMACÉN LOCAL DE ÓRDENES (ordenes_admin) Y COLA (ordenes_cola_sync)
// =============================================================================

export async function obtenerOrdenesLocales() {
  const db = await abrirBD();
  const inhabilitadasLocal = obtenerIdsInhabilitadosLocal();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ORDENES, 'readonly');
    const store = tx.objectStore(STORE_ORDENES);
    const req = store.getAll();
    let lista = [];
    req.onsuccess = () => {
      // Filtramos las órdenes inhabilitadas (activo === false) para que no aparezcan en la tabla visual
      lista = (req.result || []).filter(o => {
        if (o.activo === false) return false;
        if (o.id && inhabilitadasLocal.has(Number(o.id))) return false;
        return true;
      });
    };
    tx.oncomplete = () => {
      db.close();
      lista.sort((a, b) => {
        const fa = String(a.fecha_programada || '');
        const fb = String(b.fecha_programada || '');
        if (fa !== fb) return fb.localeCompare(fa);
        const ida = Number(a.id) || 0;
        const idb = Number(b.id) || 0;
        return idb - ida;
      });
      resolve(lista);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function obtenerColaSyncOrdenes() {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_COLA, 'readonly');
    const store = tx.objectStore(STORE_COLA);
    const req = store.getAll();
    let ops = [];
    req.onsuccess = () => {
      ops = (req.result || []).sort((a, b) => (a.secuencia || 0) - (b.secuencia || 0));
    };
    tx.oncomplete = () => {
      db.close();
      resolve(ops);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

function construirSnapshotServidor(orden) {
  return {
    condominio_id: Number(orden.condominio_id),
    area_id: Number(orden.area_id),
    servicio_id: Number(orden.servicio_id),
    fecha_programada: orden.fecha_programada,
    estado: orden.estado,
    motivo_cancelacion: orden.motivo_cancelacion || null,
    activo: orden.activo ?? true
  };
}

// Fusiona las órdenes recibidas desde Supabase con las órdenes locales que aún
// tengan operaciones pendientes de sincronización, respetando las inhabilitadas (activo = false).
export async function fusionarOrdenesServidorConLocales(ordenesServidor) {
  const db = await abrirBD();
  const inhabilitadasLocal = obtenerIdsInhabilitadosLocal();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    const reqLocales = storeOrdenes.getAll();
    const reqCola = storeCola.getAll();

    let locales = [];
    let cola = [];

    reqLocales.onsuccess = () => {
      locales = reqLocales.result || [];
    };

    reqCola.onsuccess = () => {
      cola = reqCola.result || [];
      const clavesConCola = new Set(cola.map(op => op.clave_local));
      const mapaLocales = new Map(locales.map(item => [item.clave_local, item]));
      const clavesServidorVistas = new Set();

      for (const srv of ordenesServidor) {
        const claveLocal = `srv:${srv.id}`;
        clavesServidorVistas.add(claveLocal);

        // Si en la base de datos está inhabilitada (activo === false) o inhabilitada localmente,
        // la quitamos del almacén visual local pero permanece intacta en Supabase.
        if (srv.activo === false || inhabilitadasLocal.has(Number(srv.id))) {
          storeOrdenes.delete(claveLocal);
          continue;
        }

        const previo = mapaLocales.get(claveLocal);

        // Si el registro tiene cambios pendientes en cola local, respetamos el estado local
        if (previo && (previo.pendiente_sync || clavesConCola.has(claveLocal))) {
          continue;
        }

        const registroFusionado = {
          ...(previo || {}),
          clave_local: claveLocal,
          id: Number(srv.id),
          id_local: srv.id_local || previo?.id_local || null,
          condominio_id: Number(srv.condominio_id),
          area_id: Number(srv.area_id),
          servicio_id: Number(srv.servicio_id),
          cuadrilla_id: srv.cuadrilla_id ?? previo?.cuadrilla_id ?? null,
          fecha_programada: srv.fecha_programada,
          estado: srv.estado || 'programada',
          activo: srv.activo ?? true,
          motivo_cancelacion:
            srv.motivo_cancelacion !== undefined
              ? srv.motivo_cancelacion
              : (previo?.motivo_cancelacion || null),
          cancelada_en:
            srv.cancelada_en !== undefined
              ? srv.cancelada_en
              : (previo?.cancelada_en || null),
          contrato_id:
            srv.contrato_id !== undefined
              ? srv.contrato_id
              : (previo?.contrato_id || null),
          origen_generacion:
            srv.origen_generacion ||
            previo?.origen_generacion ||
            'manual',
          clave_programacion:
            srv.clave_programacion ||
            previo?.clave_programacion ||
            null,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          snapshot_servidor: construirSnapshotServidor(srv),
          actualizado_en: new Date().toISOString()
        };

        storeOrdenes.put(registroFusionado);
      }

      for (const local of locales) {
        if (
          local.clave_local.startsWith('srv:') &&
          !clavesServidorVistas.has(local.clave_local) &&
          !local.pendiente_sync &&
          !clavesConCola.has(local.clave_local)
        ) {
          storeOrdenes.delete(local.clave_local);
        }
      }
    };

    tx.oncomplete = async () => {
      db.close();
      const actualizadas = await obtenerOrdenesLocales();
      resolve(actualizadas);
    };

    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// =============================================================================
// 4. OPERACIONES OFFLINE Y ENCOLADO INTELIGENTE (COALESCING)
// =============================================================================

export async function encolarCreacionOrdenLocal(datosOrden) {
  const db = await abrirBD();
  const uuid = datosOrden.id_local || generarUUID();
  const claveLocal = `local:${uuid}`;
  const ahora = new Date().toISOString();

  const nuevaOrdenLocal = {
    clave_local: claveLocal,
    id: null,
    id_local: uuid,
    condominio_id: Number(datosOrden.condominio_id),
    area_id: Number(datosOrden.area_id),
    servicio_id: Number(datosOrden.servicio_id),
    cuadrilla_id: datosOrden.cuadrilla_id ?? null,
    fecha_programada: datosOrden.fecha_programada,
    estado: 'programada',
    activo: true,
    motivo_cancelacion: null,
    cancelada_en: null,
    contrato_id: datosOrden.contrato_id ? Number(datosOrden.contrato_id) : null,
    origen_generacion: datosOrden.origen_generacion || 'manual',
    clave_programacion: datosOrden.clave_programacion || null,
    pendiente_sync: true,
    operacion_pendiente: 'crear',
    error_sync: null,
    snapshot_servidor: null,
    creado_en: ahora,
    actualizado_en: ahora
  };

  const opCola = {
    op_id: `op:${uuid}`,
    clave_local: claveLocal,
    servidor_id: null,
    tipo: 'crear',
    payload: {
      id_local: uuid,
      condominio_id: nuevaOrdenLocal.condominio_id,
      area_id: nuevaOrdenLocal.area_id,
      servicio_id: nuevaOrdenLocal.servicio_id,
      fecha_programada: nuevaOrdenLocal.fecha_programada,
      estado: 'programada',
      activo: true,
      contrato_id: nuevaOrdenLocal.contrato_id,
      origen_generacion: nuevaOrdenLocal.origen_generacion,
      clave_programacion: nuevaOrdenLocal.clave_programacion
    },
    snapshot_servidor: null,
    estado_sync: 'pendiente',
    error_sync: null,
    intentos: 0,
    secuencia: Date.now() + Math.random(),
    creado_en: ahora,
    actualizado_en: ahora
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    tx.objectStore(STORE_ORDENES).put(nuevaOrdenLocal);
    tx.objectStore(STORE_COLA).put(opCola);

    tx.oncomplete = () => {
      db.close();
      resolve(nuevaOrdenLocal);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function encolarEdicionOrdenLocal(claveLocal, cambios) {
  const db = await abrirBD();
  const ahora = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    const reqOrden = storeOrdenes.get(claveLocal);
    let ordenActualizada = null;
    let errorNegocio = null;

    reqOrden.onsuccess = () => {
      const orden = reqOrden.result;
      if (!orden) {
        errorNegocio = new Error('No se encontró la orden que intentas editar.');
        tx.abort();
        return;
      }

      if (!puedeEditarOrden(orden)) {
        errorNegocio = new Error(
          `No se puede editar una orden en estado "${orden.estado}".`
        );
        tx.abort();
        return;
      }

      const esCreacionPendiente =
        claveLocal.startsWith('local:') || orden.operacion_pendiente === 'crear';

      ordenActualizada = {
        ...orden,
        condominio_id: Number(cambios.condominio_id),
        area_id: Number(cambios.area_id),
        servicio_id: Number(cambios.servicio_id),
        fecha_programada: cambios.fecha_programada,
        pendiente_sync: true,
        operacion_pendiente: esCreacionPendiente ? 'crear' : 'editar',
        error_sync: null,
        actualizado_en: ahora
      };

      storeOrdenes.put(ordenActualizada);

      const idxCola = storeCola.index('clave_local');
      const reqOps = idxCola.getAll(claveLocal);

      reqOps.onsuccess = () => {
        const opsExistentes = reqOps.result || [];
        const opCrear = opsExistentes.find(op => op.tipo === 'crear');
        const opEditar = opsExistentes.find(op => op.tipo === 'editar');

        if (opCrear) {
          storeCola.put({
            ...opCrear,
            payload: {
              ...opCrear.payload,
              condominio_id: ordenActualizada.condominio_id,
              area_id: ordenActualizada.area_id,
              servicio_id: ordenActualizada.servicio_id,
              fecha_programada: ordenActualizada.fecha_programada
            },
            estado_sync: 'pendiente',
            error_sync: null,
            actualizado_en: ahora
          });
        } else if (opEditar) {
          storeCola.put({
            ...opEditar,
            payload: {
              ...opEditar.payload,
              condominio_id: ordenActualizada.condominio_id,
              area_id: ordenActualizada.area_id,
              servicio_id: ordenActualizada.servicio_id,
              fecha_programada: ordenActualizada.fecha_programada
            },
            estado_sync: 'pendiente',
            error_sync: null,
            actualizado_en: ahora
          });
        } else {
          storeCola.put({
            op_id: `op:edit:${orden.id}:${Date.now()}`,
            clave_local: claveLocal,
            servidor_id: Number(orden.id),
            tipo: 'editar',
            payload: {
              condominio_id: ordenActualizada.condominio_id,
              area_id: ordenActualizada.area_id,
              servicio_id: ordenActualizada.servicio_id,
              fecha_programada: ordenActualizada.fecha_programada
            },
            snapshot_servidor: orden.snapshot_servidor || construirSnapshotServidor(orden),
            estado_sync: 'pendiente',
            error_sync: null,
            intentos: 0,
            secuencia: Date.now() + Math.random(),
            creado_en: ahora,
            actualizado_en: ahora
          });
        }
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve(ordenActualizada);
    };
    tx.onerror = () => {
      db.close();
      reject(errorNegocio || tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(errorNegocio || tx.error || new Error('No se pudo editar la orden.'));
    };
  });
}

export async function encolarCancelacionOrdenLocal(claveLocal, motivo) {
  const motivoLimpio = String(motivo || '').trim();
  if (!motivoLimpio) {
    throw new Error('El motivo de cancelación es obligatorio.');
  }

  const db = await abrirBD();
  const ahora = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    const reqOrden = storeOrdenes.get(claveLocal);
    let ordenCancelada = null;
    let errorNegocio = null;

    reqOrden.onsuccess = () => {
      const orden = reqOrden.result;
      if (!orden) {
        errorNegocio = new Error('No se encontró la orden que deseas cancelar.');
        tx.abort();
        return;
      }

      if (!puedeCancelarOrden(orden)) {
        errorNegocio = new Error(
          `No es posible cancelar una orden en estado "${orden.estado}".`
        );
        tx.abort();
        return;
      }

      const esCreacionPendiente =
        claveLocal.startsWith('local:') || orden.operacion_pendiente === 'crear';

      ordenCancelada = {
        ...orden,
        estado: 'cancelada',
        motivo_cancelacion: motivoLimpio,
        cancelada_en: ahora,
        pendiente_sync: true,
        operacion_pendiente: esCreacionPendiente ? 'crear' : 'cancelar',
        error_sync: null,
        actualizado_en: ahora
      };

      storeOrdenes.put(ordenCancelada);

      const idxCola = storeCola.index('clave_local');
      const reqOps = idxCola.getAll(claveLocal);

      reqOps.onsuccess = () => {
        const opsExistentes = reqOps.result || [];
        const opCrear = opsExistentes.find(op => op.tipo === 'crear');

        if (opCrear) {
          storeCola.put({
            ...opCrear,
            payload: {
              ...opCrear.payload,
              estado: 'cancelada',
              motivo_cancelacion: motivoLimpio,
              cancelada_en: ahora
            },
            estado_sync: 'pendiente',
            error_sync: null,
            actualizado_en: ahora
          });
        } else {
          let payloadAcumulado = {};
          for (const op of opsExistentes) {
            if (op.tipo === 'editar' || op.tipo === 'cancelar') {
              payloadAcumulado = { ...payloadAcumulado, ...op.payload };
              storeCola.delete(op.op_id);
            }
          }

          storeCola.put({
            op_id: `op:cancel:${orden.id}:${Date.now()}`,
            clave_local: claveLocal,
            servidor_id: Number(orden.id),
            tipo: 'cancelar',
            payload: {
              ...payloadAcumulado,
              estado: 'cancelada',
              motivo_cancelacion: motivoLimpio,
              cancelada_en: ahora
            },
            snapshot_servidor: orden.snapshot_servidor || construirSnapshotServidor(orden),
            estado_sync: 'pendiente',
            error_sync: null,
            intentos: 0,
            secuencia: Date.now() + Math.random(),
            creado_en: ahora,
            actualizado_en: ahora
          });
        }
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve(ordenCancelada);
    };
    tx.onerror = () => {
      db.close();
      reject(errorNegocio || tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(errorNegocio || tx.error || new Error('No se pudo cancelar la orden.'));
    };
  });
}

export async function encolarEliminacionOrdenLocal(claveLocal) {
  const db = await abrirBD();
  const ahora = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA, 'visitas'], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);
    const storeVisitas = tx.objectStore('visitas');

    const reqOrden = storeOrdenes.get(claveLocal);
    let resultado = null;
    let errorNegocio = null;

    reqOrden.onsuccess = () => {
      const orden = reqOrden.result;
      if (!orden) {
        errorNegocio = new Error('No se encontró la orden que deseas inhabilitar/eliminar.');
        tx.abort();
        return;
      }

      if (!puedeEliminarOrden(orden)) {
        errorNegocio = new Error(
          `No se puede eliminar una orden en estado "${orden.estado}" para proteger el historial.`
        );
        tx.abort();
        return;
      }

      const reqVisitas = storeVisitas.getAll();
      reqVisitas.onsuccess = () => {
        const visitas = reqVisitas.result || [];
        if (orden.id && visitas.some(v => Number(v.orden_id) === Number(orden.id))) {
          errorNegocio = new Error(
            `No se puede eliminar la orden #${orden.id} porque tiene visitas asociadas en la bitácora.`
          );
          tx.abort();
          return;
        }

        const idxCola = storeCola.index('clave_local');
        const reqOps = idxCola.getAll(claveLocal);

        reqOps.onsuccess = () => {
          const opsExistentes = reqOps.result || [];
          const esSoloLocal =
            claveLocal.startsWith('local:') ||
            !orden.id ||
            opsExistentes.some(op => op.tipo === 'crear');

          for (const op of opsExistentes) {
            storeCola.delete(op.op_id);
          }

          if (esSoloLocal) {
            storeOrdenes.delete(claveLocal);
            resultado = {
              eliminadaDefinitivamente: true,
              eraSoloLocal: true,
              clave_local: claveLocal
            };
          } else {
            // Baja lógica local inmediata (activo = false) para ocultarla visualmente de la tabla,
            // y encolado de la inhabilitación para actualizar activo = false en Supabase al reconectar.
            const ordenInhabilitada = {
              ...orden,
              activo: false,
              pendiente_sync: true,
              operacion_pendiente: 'eliminar',
              error_sync: null,
              actualizado_en: ahora
            };
            storeOrdenes.put(ordenInhabilitada);
            registrarIdInhabilitadoLocal(orden.id);

            storeCola.put({
              op_id: `op:del:${orden.id}:${Date.now()}`,
              clave_local: claveLocal,
              servidor_id: Number(orden.id),
              tipo: 'eliminar',
              payload: { id: Number(orden.id), activo: false },
              snapshot_servidor: orden.snapshot_servidor || construirSnapshotServidor(orden),
              estado_sync: 'pendiente',
              error_sync: null,
              intentos: 0,
              secuencia: Date.now() + Math.random(),
              creado_en: ahora,
              actualizado_en: ahora
            });

            resultado = {
              eliminadaDefinitivamente: false,
              eraSoloLocal: false,
              clave_local: claveLocal,
              orden: ordenInhabilitada
            };
          }
        };
      };
    };

    tx.oncomplete = () => {
      db.close();
      resolve(resultado);
    };
    tx.onerror = () => {
      db.close();
      reject(errorNegocio || tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(errorNegocio || tx.error || new Error('No se pudo eliminar la orden.'));
    };
  });
}

export async function descartarCambioLocalOrden(claveLocal) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    const idxCola = storeCola.index('clave_local');
    const reqOps = idxCola.getAll(claveLocal);

    reqOps.onsuccess = () => {
      for (const op of reqOps.result || []) {
        storeCola.delete(op.op_id);
      }
    };

    const reqOrden = storeOrdenes.get(claveLocal);
    reqOrden.onsuccess = () => {
      const orden = reqOrden.result;
      if (!orden) return;
      if (claveLocal.startsWith('local:') || !orden.id) {
        storeOrdenes.delete(claveLocal);
      } else if (orden.snapshot_servidor) {
        storeOrdenes.put({
          ...orden,
          ...orden.snapshot_servidor,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          actualizado_en: new Date().toISOString()
        });
      } else {
        storeOrdenes.put({
          ...orden,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          actualizado_en: new Date().toISOString()
        });
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// =============================================================================
// 5. OPERACIONES CONTRA SUPABASE CON BAJA LÓGICA (activo = false)
// =============================================================================

async function insertarOrdenEnSupabase(payload) {
  const payloadBase = {
    condominio_id: Number(payload.condominio_id),
    area_id: Number(payload.area_id),
    servicio_id: Number(payload.servicio_id),
    fecha_programada: payload.fecha_programada,
    estado: payload.estado || 'programada'
  };

  if (esquemaRemotoExtendido) {
    const payloadExtendido = {
      ...payloadBase,
      motivo_cancelacion: payload.motivo_cancelacion || null,
      cancelada_en: payload.cancelada_en || null,
      contrato_id: payload.contrato_id ? Number(payload.contrato_id) : null,
      origen_generacion: payload.origen_generacion || 'manual',
      clave_programacion: payload.clave_programacion || null,
      id_local: payload.id_local || null
    };

    const { data, error } = await supabase
      .from('ordenes_servicio')
      .insert([payloadExtendido])
      .select('*')
      .single();

    if (!error) return data;

    if (error.code === '23505') {
      if (payload.id_local) {
        const { data: existente } = await supabase
          .from('ordenes_servicio')
          .select('*')
          .eq('id_local', payload.id_local)
          .maybeSingle();
        if (existente) return existente;
      }
      if (payload.clave_programacion) {
        const { data: existenteClave } = await supabase
          .from('ordenes_servicio')
          .select('*')
          .eq('clave_programacion', payload.clave_programacion)
          .maybeSingle();
        if (existenteClave) return existenteClave;
      }
    }

    if (esErrorColumnaInexistente(error)) {
      esquemaRemotoExtendido = false;
    } else {
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('ordenes_servicio')
    .insert([payloadBase])
    .select('*')
    .single();

  if (error) throw error;

  return {
    ...data,
    motivo_cancelacion: payload.motivo_cancelacion || null,
    cancelada_en: payload.cancelada_en || null,
    contrato_id: payload.contrato_id ? Number(payload.contrato_id) : null,
    origen_generacion: payload.origen_generacion || 'manual',
    clave_programacion: payload.clave_programacion || null,
    id_local: payload.id_local || null
  };
}

async function actualizarOrdenEnSupabase(servidorId, payload) {
  const camposBase = {};
  if (payload.condominio_id !== undefined) camposBase.condominio_id = Number(payload.condominio_id);
  if (payload.area_id !== undefined) camposBase.area_id = Number(payload.area_id);
  if (payload.servicio_id !== undefined) camposBase.servicio_id = Number(payload.servicio_id);
  if (payload.fecha_programada !== undefined) camposBase.fecha_programada = payload.fecha_programada;
  if (payload.estado !== undefined) camposBase.estado = payload.estado;

  if (esquemaRemotoExtendido) {
    const camposExtendidos = { ...camposBase };
    if (payload.motivo_cancelacion !== undefined) {
      camposExtendidos.motivo_cancelacion = payload.motivo_cancelacion;
    }
    if (payload.cancelada_en !== undefined) {
      camposExtendidos.cancelada_en = payload.cancelada_en;
    }

    const { data, error } = await supabase
      .from('ordenes_servicio')
      .update(camposExtendidos)
      .eq('id', Number(servidorId))
      .select('*');

    if (!error) {
      if (!data || data.length === 0) {
        throw new Error('No tienes permiso o la orden ya no existe en el servidor.');
      }
      return data[0];
    }

    if (esErrorColumnaInexistente(error)) {
      esquemaRemotoExtendido = false;
    } else {
      throw error;
    }
  }

  const { data, error } = await supabase
    .from('ordenes_servicio')
    .update(camposBase)
    .eq('id', Number(servidorId))
    .select('*');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No tienes permiso o la orden ya no existe en el servidor.');
  }

  return {
    ...data[0],
    motivo_cancelacion: payload.motivo_cancelacion ?? data[0].motivo_cancelacion ?? null,
    cancelada_en: payload.cancelada_en ?? data[0].cancelada_en ?? null
  };
}

// BAJA LÓGICA EN SUPABASE: en lugar de borrar la fila físicamente (DELETE),
// actualiza activo = false para que permanezca en la base de datos pero se oculte de la tabla.
async function inhabilitarOrdenEnSupabase(servidorId) {
  const { data: visitasAsociadas, error: errVisitas } = await supabase
    .from('visitas')
    .select('id')
    .eq('orden_id', Number(servidorId))
    .limit(1);

  if (!errVisitas && Array.isArray(visitasAsociadas) && visitasAsociadas.length > 0) {
    throw new Error(
      `No se puede inhabilitar la orden #${servidorId} porque ya tiene visitas registradas en la bitácora.`
    );
  }

  if (soportaColumnaActivo) {
    const { data, error } = await supabase
      .from('ordenes_servicio')
      .update({ activo: false })
      .eq('id', Number(servidorId))
      .select('id, activo');

    if (!error) {
      if (!data || data.length === 0) {
        throw new Error('No tienes permiso para inhabilitar esta orden o ya no existe.');
      }
      registrarIdInhabilitadoLocal(servidorId);
      return true;
    }

    if (esErrorColumnaInexistente(error)) {
      // Si aún no se ha agregado la columna 'activo' en Supabase, conservamos el registro
      // en la base de datos y lo ocultamos visualmente mediante el registro de inhabilitadas.
      soportaColumnaActivo = false;
      registrarIdInhabilitadoLocal(servidorId);
      return true;
    }

    throw error;
  }

  registrarIdInhabilitadoLocal(servidorId);
  return true;
}

function detectarConflictoServidor(actualServidor, snapshotLocal, op) {
  if (!actualServidor) {
    return 'La orden ya no se encuentra disponible en el servidor.';
  }

  if (op.tipo === 'editar') {
    if (actualServidor.estado === 'en_proceso' || actualServidor.estado === 'completada' || actualServidor.estado === 'cancelada') {
      return `La orden cambió en el servidor al estado "${actualServidor.estado}" y ya no puede editarse.`;
    }
  }

  if (op.tipo === 'cancelar') {
    if (actualServidor.estado === 'completada') {
      return 'La orden ya fue marcada como "completada" en el servidor y no puede cancelarse.';
    }
  }

  if (op.tipo === 'eliminar') {
    if (actualServidor.estado === 'en_proceso' || actualServidor.estado === 'completada') {
      return `La orden pasó a estado "${actualServidor.estado}" en el servidor y no puede inhabilitarse.`;
    }
  }

  if (snapshotLocal) {
    const cambioEnServidor =
      Number(actualServidor.condominio_id) !== Number(snapshotLocal.condominio_id) ||
      Number(actualServidor.area_id) !== Number(snapshotLocal.area_id) ||
      Number(actualServidor.servicio_id) !== Number(snapshotLocal.servicio_id) ||
      String(actualServidor.fecha_programada) !== String(snapshotLocal.fecha_programada) ||
      String(actualServidor.estado) !== String(snapshotLocal.estado);

    if (cambioEnServidor) {
      const coincideConDeseado =
        op.tipo !== 'eliminar' &&
        (op.payload.condominio_id === undefined || Number(actualServidor.condominio_id) === Number(op.payload.condominio_id)) &&
        (op.payload.area_id === undefined || Number(actualServidor.area_id) === Number(op.payload.area_id)) &&
        (op.payload.servicio_id === undefined || Number(actualServidor.servicio_id) === Number(op.payload.servicio_id)) &&
        (op.payload.fecha_programada === undefined || String(actualServidor.fecha_programada) === String(op.payload.fecha_programada)) &&
        (op.payload.estado === undefined || String(actualServidor.estado) === String(op.payload.estado));

      if (!coincideConDeseado) {
        return `Conflicto de sincronización: la orden #${actualServidor.id} fue modificada en el servidor (estado: ${actualServidor.estado}, fecha: ${actualServidor.fecha_programada}).`;
      }
    }
  }

  return null;
}

async function marcarErrorOperacionCola(opId, claveLocal, mensajeError, esConflicto = false) {
  const db = await abrirBD();
  return new Promise((resolve) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    const reqOp = storeCola.get(opId);
    reqOp.onsuccess = () => {
      if (reqOp.result) {
        storeCola.put({
          ...reqOp.result,
          estado_sync: esConflicto ? 'conflicto' : 'error',
          error_sync: mensajeError,
          intentos: (reqOp.result.intentos || 0) + 1,
          actualizado_en: new Date().toISOString()
        });
      }
    };

    const reqOrd = storeOrdenes.get(claveLocal);
    reqOrd.onsuccess = () => {
      if (reqOrd.result) {
        storeOrdenes.put({
          ...reqOrd.result,
          activo: true, // Si hubo conflicto al inhabilitar, vuelve a mostrarse para que el admin vea el aviso
          error_sync: mensajeError,
          actualizado_en: new Date().toISOString()
        });
      }
    };

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

async function confirmarOperacionSincronizada(op, registroServidor = null) {
  const db = await abrirBD();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
    const storeOrdenes = tx.objectStore(STORE_ORDENES);
    const storeCola = tx.objectStore(STORE_COLA);

    storeCola.delete(op.op_id);

    if (op.tipo === 'eliminar') {
      storeOrdenes.delete(op.clave_local);
    } else if (op.tipo === 'crear' && registroServidor) {
      storeOrdenes.delete(op.clave_local);
      const nuevaClave = `srv:${registroServidor.id}`;
      storeOrdenes.put({
        clave_local: nuevaClave,
        id: Number(registroServidor.id),
        id_local: registroServidor.id_local || op.payload.id_local || null,
        condominio_id: Number(registroServidor.condominio_id),
        area_id: Number(registroServidor.area_id),
        servicio_id: Number(registroServidor.servicio_id),
        cuadrilla_id: registroServidor.cuadrilla_id ?? null,
        fecha_programada: registroServidor.fecha_programada,
        estado: registroServidor.estado || 'programada',
        activo: registroServidor.activo ?? true,
        motivo_cancelacion:
          registroServidor.motivo_cancelacion ?? op.payload.motivo_cancelacion ?? null,
        cancelada_en:
          registroServidor.cancelada_en ?? op.payload.cancelada_en ?? null,
        contrato_id:
          registroServidor.contrato_id ?? op.payload.contrato_id ?? null,
        origen_generacion:
          registroServidor.origen_generacion || op.payload.origen_generacion || 'manual',
        clave_programacion:
          registroServidor.clave_programacion || op.payload.clave_programacion || null,
        pendiente_sync: false,
        operacion_pendiente: null,
        error_sync: null,
        snapshot_servidor: construirSnapshotServidor(registroServidor),
        actualizado_en: new Date().toISOString()
      });
    } else if (registroServidor) {
      const reqOrd = storeOrdenes.get(op.clave_local);
      reqOrd.onsuccess = () => {
        const previo = reqOrd.result || {};
        storeOrdenes.put({
          ...previo,
          clave_local: `srv:${registroServidor.id}`,
          id: Number(registroServidor.id),
          condominio_id: Number(registroServidor.condominio_id),
          area_id: Number(registroServidor.area_id),
          servicio_id: Number(registroServidor.servicio_id),
          fecha_programada: registroServidor.fecha_programada,
          estado: registroServidor.estado,
          activo: registroServidor.activo ?? true,
          motivo_cancelacion:
            registroServidor.motivo_cancelacion ?? op.payload.motivo_cancelacion ?? previo.motivo_cancelacion ?? null,
          cancelada_en:
            registroServidor.cancelada_en ?? op.payload.cancelada_en ?? previo.cancelada_en ?? null,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          snapshot_servidor: construirSnapshotServidor(registroServidor),
          actualizado_en: new Date().toISOString()
        });
      };
    }

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

// =============================================================================
// 6. SINCRONIZACIÓN DE LA COLA DE ÓRDENES AL RECUPERAR CONEXIÓN
// =============================================================================

let sincronizandoOrdenes = false;

export async function sincronizarColaOrdenes() {
  if (!navigator.onLine || sincronizandoOrdenes) {
    return { sincronizadas: 0, pendientes: (await obtenerColaSyncOrdenes()).length, errores: [] };
  }

  sincronizandoOrdenes = true;
  let sincronizadas = 0;
  const errores = [];

  try {
    const cola = await obtenerColaSyncOrdenes();

    for (const op of cola) {
      if (!navigator.onLine) {
        errores.push({
          op_id: op.op_id,
          clave_local: op.clave_local,
          mensaje: 'Se perdió la conexión durante la sincronización. Los cambios restantes siguen guardados localmente.'
        });
        break;
      }

      try {
        if (op.tipo === 'crear') {
          const creado = await insertarOrdenEnSupabase(op.payload);
          await confirmarOperacionSincronizada(op, creado);
          sincronizadas++;
        } else if (op.tipo === 'editar' || op.tipo === 'cancelar') {
          const { data: actualSrv, error: errConsulta } = await supabase
            .from('ordenes_servicio')
            .select('*')
            .eq('id', Number(op.servidor_id))
            .maybeSingle();

          if (errConsulta) throw errConsulta;

          const conflicto = detectarConflictoServidor(actualSrv, op.snapshot_servidor, op);
          if (conflicto) {
            await marcarErrorOperacionCola(op.op_id, op.clave_local, conflicto, true);
            errores.push({ op_id: op.op_id, clave_local: op.clave_local, mensaje: conflicto, conflicto: true });
            continue;
          }

          const actualizado = await actualizarOrdenEnSupabase(op.servidor_id, op.payload);
          await confirmarOperacionSincronizada(op, actualizado);
          sincronizadas++;
        } else if (op.tipo === 'eliminar') {
          const { data: actualSrv, error: errConsulta } = await supabase
            .from('ordenes_servicio')
            .select('*')
            .eq('id', Number(op.servidor_id))
            .maybeSingle();

          if (errConsulta) throw errConsulta;

          if (!actualSrv || actualSrv.activo === false) {
            await confirmarOperacionSincronizada(op, null);
            sincronizadas++;
            continue;
          }

          const conflicto = detectarConflictoServidor(actualSrv, op.snapshot_servidor, op);
          if (conflicto) {
            await marcarErrorOperacionCola(op.op_id, op.clave_local, conflicto, true);
            errores.push({ op_id: op.op_id, clave_local: op.clave_local, mensaje: conflicto, conflicto: true });
            continue;
          }

          await inhabilitarOrdenEnSupabase(op.servidor_id);
          await confirmarOperacionSincronizada(op, null);
          sincronizadas++;
        }
      } catch (errOp) {
        if (esErrorDeRed(errOp)) {
          await marcarErrorOperacionCola(
            op.op_id,
            op.clave_local,
            'Sin conexión al intentar sincronizar. Se reintentará al recuperar internet.',
            false
          );
          errores.push({
            op_id: op.op_id,
            clave_local: op.clave_local,
            mensaje: 'Conexión interrumpida durante la sincronización.'
          });
          break;
        } else {
          const msg = errOp?.message || 'Error al sincronizar operación con Supabase.';
          await marcarErrorOperacionCola(op.op_id, op.clave_local, msg, false);
          errores.push({ op_id: op.op_id, clave_local: op.clave_local, mensaje: msg });
        }
      }
    }
  } finally {
    sincronizandoOrdenes = false;
  }

  const restantes = await obtenerColaSyncOrdenes();
  return {
    sincronizadas,
    pendientes: restantes.length,
    errores
  };
}

// =============================================================================
// 7. FACHADA UNIFICADA ONLINE / OFFLINE PARA EL MÓDULO DE ÓRDENES
// =============================================================================

export async function consultarOrdenesServicio() {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('ordenes_servicio')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;

      const fusionadas = await fusionarOrdenesServidorConLocales(data || []);
      return {
        ordenes: fusionadas,
        fuente: 'online'
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        throw error;
      }
    }
  }

  const locales = await obtenerOrdenesLocales();
  return {
    ordenes: locales,
    fuente: 'offline'
  };
}

export async function crearOrdenServicio(datos, catalogos = {}) {
  const validados = validarDatosOrden(datos, catalogos);
  const payloadCompleto = {
    ...validados,
    estado: 'programada',
    activo: true,
    contrato_id: datos.contrato_id ? Number(datos.contrato_id) : null,
    origen_generacion: datos.origen_generacion || 'manual',
    clave_programacion: datos.clave_programacion || null,
    id_local: datos.id_local || generarUUID()
  };

  if (navigator.onLine) {
    try {
      const creado = await insertarOrdenEnSupabase(payloadCompleto);
      const db = await abrirBD();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ORDENES, 'readwrite');
        tx.objectStore(STORE_ORDENES).put({
          clave_local: `srv:${creado.id}`,
          id: Number(creado.id),
          id_local: creado.id_local || payloadCompleto.id_local,
          condominio_id: Number(creado.condominio_id),
          area_id: Number(creado.area_id),
          servicio_id: Number(creado.servicio_id),
          cuadrilla_id: creado.cuadrilla_id ?? null,
          fecha_programada: creado.fecha_programada,
          estado: creado.estado || 'programada',
          activo: creado.activo ?? true,
          motivo_cancelacion: creado.motivo_cancelacion || null,
          cancelada_en: creado.cancelada_en || null,
          contrato_id: creado.contrato_id ?? payloadCompleto.contrato_id ?? null,
          origen_generacion: creado.origen_generacion || payloadCompleto.origen_generacion,
          clave_programacion: creado.clave_programacion || payloadCompleto.clave_programacion,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          snapshot_servidor: construirSnapshotServidor(creado),
          actualizado_en: new Date().toISOString()
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });

      return {
        orden: creado,
        guardadoEnServidor: true
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        throw error;
      }
    }
  }

  const ordenLocal = await encolarCreacionOrdenLocal(payloadCompleto);
  return {
    orden: ordenLocal,
    guardadoEnServidor: false
  };
}

export async function actualizarOrdenServicio(claveLocal, datos, catalogos = {}) {
  const validados = validarDatosOrden(datos, catalogos);
  const locales = await obtenerOrdenesLocales();
  const actual = locales.find(o => o.clave_local === claveLocal);

  if (!actual) {
    throw new Error('No se encontró la orden seleccionada.');
  }
  if (!puedeEditarOrden(actual)) {
    throw new Error(`No está permitido editar una orden en estado "${actual.estado}".`);
  }

  const esCreacionPendiente =
    claveLocal.startsWith('local:') || actual.operacion_pendiente === 'crear' || !actual.id;

  if (navigator.onLine && !esCreacionPendiente) {
    try {
      const actualizado = await actualizarOrdenEnSupabase(actual.id, validados);
      const db = await abrirBD();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ORDENES, 'readwrite');
        tx.objectStore(STORE_ORDENES).put({
          ...actual,
          condominio_id: Number(actualizado.condominio_id),
          area_id: Number(actualizado.area_id),
          servicio_id: Number(actualizado.servicio_id),
          fecha_programada: actualizado.fecha_programada,
          estado: actualizado.estado,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          snapshot_servidor: construirSnapshotServidor(actualizado),
          actualizado_en: new Date().toISOString()
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });

      return {
        orden: actualizado,
        guardadoEnServidor: true
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        throw error;
      }
    }
  }

  const ordenLocal = await encolarEdicionOrdenLocal(claveLocal, validados);
  return {
    orden: ordenLocal,
    guardadoEnServidor: false
  };
}

export async function cancelarOrdenServicio(claveLocal, motivo) {
  const motivoLimpio = String(motivo || '').trim();
  if (!motivoLimpio) {
    throw new Error('Por favor, ingresa el motivo de cancelación. Es obligatorio.');
  }

  const locales = await obtenerOrdenesLocales();
  const actual = locales.find(o => o.clave_local === claveLocal);

  if (!actual) {
    throw new Error('No se encontró la orden seleccionada.');
  }
  if (!puedeCancelarOrden(actual)) {
    throw new Error(`No está permitido cancelar una orden en estado "${actual.estado}".`);
  }

  const esCreacionPendiente =
    claveLocal.startsWith('local:') || actual.operacion_pendiente === 'crear' || !actual.id;

  if (navigator.onLine && !esCreacionPendiente) {
    try {
      const ahora = new Date().toISOString();
      const actualizado = await actualizarOrdenEnSupabase(actual.id, {
        estado: 'cancelada',
        motivo_cancelacion: motivoLimpio,
        cancelada_en: ahora
      });

      const db = await abrirBD();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_ORDENES, 'readwrite');
        tx.objectStore(STORE_ORDENES).put({
          ...actual,
          estado: 'cancelada',
          motivo_cancelacion: motivoLimpio,
          cancelada_en: actualizado.cancelada_en || ahora,
          pendiente_sync: false,
          operacion_pendiente: null,
          error_sync: null,
          snapshot_servidor: construirSnapshotServidor({
            ...actualizado,
            estado: 'cancelada',
            motivo_cancelacion: motivoLimpio
          }),
          actualizado_en: ahora
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });

      return {
        orden: { ...actualizado, motivo_cancelacion: motivoLimpio },
        guardadoEnServidor: true
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        throw error;
      }
    }
  }

  const ordenCancelada = await encolarCancelacionOrdenLocal(claveLocal, motivoLimpio);
  return {
    orden: ordenCancelada,
    guardadoEnServidor: false
  };
}

// ELIMINAR ORDEN (BAJA LÓGICA):
// Oculta visualmente la orden de la tabla y marca activo = false en Supabase
// para que el registro permanezca almacenado en la base de datos.
export async function eliminarOrdenServicio(claveLocal) {
  const locales = await obtenerOrdenesLocales();
  const actual = locales.find(o => o.clave_local === claveLocal);

  if (!actual) {
    throw new Error('No se encontró la orden que deseas eliminar.');
  }
  if (!puedeEliminarOrden(actual)) {
    throw new Error(
      `No se puede eliminar una orden en estado "${actual.estado}" para proteger el historial.`
    );
  }

  if (actual.id && (await ordenTieneVisitasLocales(actual.id))) {
    throw new Error(
      `No se puede eliminar la orden #${actual.id} porque tiene visitas registradas en este dispositivo.`
    );
  }

  const esCreacionPendiente =
    claveLocal.startsWith('local:') || actual.operacion_pendiente === 'crear' || !actual.id;

  if (navigator.onLine && !esCreacionPendiente) {
    try {
      await inhabilitarOrdenEnSupabase(actual.id);
      const db = await abrirBD();
      await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_ORDENES, STORE_COLA], 'readwrite');
        tx.objectStore(STORE_ORDENES).delete(claveLocal);
        const idxCola = tx.objectStore(STORE_COLA).index('clave_local');
        const reqOps = idxCola.getAll(claveLocal);
        reqOps.onsuccess = () => {
          for (const op of reqOps.result || []) {
            tx.objectStore(STORE_COLA).delete(op.op_id);
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      });

      return {
        eliminadaEnServidor: true,
        eraSoloLocal: false
      };
    } catch (error) {
      if (!esErrorDeRed(error)) {
        throw error;
      }
    }
  }

  const resOffline = await encolarEliminacionOrdenLocal(claveLocal);
  return {
    eliminadaEnServidor: false,
    eraSoloLocal: resOffline.eraSoloLocal
  };
}