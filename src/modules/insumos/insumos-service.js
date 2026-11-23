// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Comunicación con Supabase para insumos
// ==============================================

import { supabase } from '../../services/supabase.js';

import {
  guardarCatalogoLocal,
  obtenerConsumosPendientes,
  marcarConsumoEnviado,
  eliminarConsumoLocal,
  ajustarExistenciaLocal
} from './insumos-local.js';

import {
  obtenerVisitasLocales,
  guardarVisitasServidor
} from '../pendientes_sync/db-local.js';


const COLUMNAS_INSUMO = 'id, nombre, unidad, existencia';

function normalizarInsumo(item) {
  if (!item) return null;
  const existencia = Number(item.existencia ?? item.stock ?? 0);
  return {
    ...item,
    existencia,
    stock: existencia,
    cantidad: existencia
  };
}


// ==============================================
// CATÁLOGO (ADMINISTRADOR)
// ==============================================

export async function listarCatalogoServidor() {

  const { data, error } = await supabase
    .from('insumos')
    .select(COLUMNAS_INSUMO)
    .order('id', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(normalizarInsumo);

}


export async function actualizarInsumo({id, nombre, unidad, existencia}) {
  const numExistencia = Number(existencia) || 0;
  const { data, error } = await supabase
    .from('insumos')
    .update({ nombre, unidad, existencia: numExistencia })
    .eq('id', id)
    .select(COLUMNAS_INSUMO)
    .single();
  if (error) {
    throw error;
  }
  return normalizarInsumo(data);
}

export async function crearInsumo({
  nombre,
  unidad,
  existencia
}) {
  const numExistencia = Number(existencia) || 0;
  const { data, error } = await supabase
    .from('insumos')
    .insert({
      nombre,
      unidad,
      existencia: numExistencia
    })
    .select(COLUMNAS_INSUMO)
    .single();
  if (error) {
    throw error;
  }
  return normalizarInsumo(data);
}


// ==============================================
// CATÁLOGO (TÉCNICO) - COPIA PARA USO SIN RED
// ==============================================

export async function sincronizarCatalogoLocal() {

  const { data, error } = await supabase
    .from('insumos')
    .select(COLUMNAS_INSUMO)
    .order('nombre', { ascending: true });

  if (error) {
    throw error;
  }

  const mapeados = (data || []).map(normalizarInsumo);

  await guardarCatalogoLocal(mapeados);

  return mapeados;

}


// ==============================================
// SINCRONIZAR CONSUMOS PENDIENTES
// ==============================================
//
// Debe ejecutarse DESPUÉS de sincronizar las visitas:
// un consumo necesita el id que la visita recibe en
// Supabase. Si la visita aún no llegó, el consumo se
// queda pendiente para el siguiente intento.

// Id de la visita en Supabase a partir del registro local.
// Solo es confiable si Supabase ya confirmó esa visita.
function obtenerVisitaServidorId(visita) {

  if (!visita) {
    return null;
  }

  if (visita.visita_servidor_id) {
    return visita.visita_servidor_id;
  }

  if (typeof visita.id === 'number') {
    return visita.id;
  }

  // Visitas descargadas del servidor: "servidor:<id>"
  const coincidencia = /^servidor:(\d+)$/.exec(String(visita.id));

  return coincidencia ? Number(coincidencia[1]) : null;

}


function redondear(valor) {

  return Math.round(Number(valor) * 1000) / 1000;

}


function errorInventario(consumo, disponible) {

  const error = new Error(
    `No hay suficiente existencia de ${consumo.insumo_nombre}` +
    (disponible === undefined ? '.' : ` (disponible: ${disponible}).`)
  );

  error.code = 'STOCK_INSUFICIENTE';

  return error;

}


// La base de datos rechaza existencias negativas (check existencia >= 0).
function traducirErrorInventario(error, consumo) {

  return error?.code === '23514'
    ? errorInventario(consumo)
    : error;

}


// Antes de enviar, comprueba en Supabase que alcance el inventario.
async function validarExistenciaServidor(consumo, porDescontar) {

  const { data, error } = await supabase
    .from('insumos')
    .select('existencia')
    .eq('id', consumo.insumo_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data && Number(data.existencia) < porDescontar) {
    throw errorInventario(consumo, Number(data.existencia));
  }

}


// Existencia actual en Supabase de un insumo (null si no se pudo leer).
export async function consultarExistenciaServidor(insumoId) {

  const { data, error } = await supabase
    .from('insumos')
    .select('existencia')
    .eq('id', insumoId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? Number(data.existencia) : null;

}


export async function sincronizarConsumosPendientes() {

  const pendientes = await obtenerConsumosPendientes();

  if (!pendientes.length) {
    return { enviados: 0, omitidos: 0 };
  }

  const visitas = await obtenerVisitasLocales();

  const visitasPorId = new Map(
    visitas.map(visita => [visita.id, visita])
  );

  let enviados = 0;
  let omitidos = 0;
  const errores = [];

  for (const consumo of pendientes) {

    try {

      const visitaServidorId = obtenerVisitaServidorId(
        visitasPorId.get(consumo.visita_local_id)
      );

      // La visita todavía no existe en Supabase: el consumo
      // se queda pendiente en el dispositivo.
      if (!visitaServidorId) {
        omitidos++;
        continue;
      }

      // Versión que se está enviando: sirve para no confirmar
      // un registro que el técnico editó durante el envío.
      const revision = consumo.actualizado_localmente_en;

      // ---------- ELIMINAR ----------
      if (consumo.operacion_pendiente === 'eliminar') {

        const { data: borradas, error } = await supabase
          .from('visita_insumo')
          .delete()
          .match({
            visita_id: visitaServidorId,
            insumo_id: consumo.insumo_id
          })
          .select('cantidad');

        if (error) {
          throw error;
        }

        // El trigger devolvió esa cantidad a la existencia.
        const devuelto = (borradas || [])
          .reduce((suma, fila) => suma + Number(fila.cantidad || 0), 0);

        if (devuelto) {
          await ajustarExistenciaLocal(consumo.insumo_id, -devuelto);
        }

        // Solo se borra del dispositivo cuando Supabase ya confirmó.
        await eliminarConsumoLocal(consumo.id, revision);
        enviados++;
        continue;

      }

      // ---------- ACTUALIZAR O INSERTAR (IDEMPOTENTE) ----------
      // Se busca por (visita, insumo): reintentar nunca duplica.
      const nueva = Number(consumo.cantidad);

      const { data: filas, error: errBusqueda } = await supabase
        .from('visita_insumo')
        .select('id, cantidad')
        .eq('visita_id', visitaServidorId)
        .eq('insumo_id', consumo.insumo_id)
        .order('id', { ascending: true })
        .limit(1);

      if (errBusqueda) {
        throw errBusqueda;
      }

      const existente = filas?.[0] || null;

      // Lo que Supabase todavía tiene que descontar por este consumo.
      const yaDescontado = Number(existente?.cantidad) || 0;
      const porDescontar = redondear(nueva - yaDescontado);

      // Segunda validación de inventario (la primera fue en el celular).
      if (porDescontar > 0) {
        await validarExistenciaServidor(consumo, porDescontar);
      }

      if (existente?.id) {

        const { error: errUpdate } = await supabase
          .from('visita_insumo')
          .update({ cantidad: nueva })
          .eq('id', existente.id);

        if (errUpdate) {
          throw traducirErrorInventario(errUpdate, consumo);
        }

      } else {

        const { error: errInsert } = await supabase
          .from('visita_insumo')
          .insert({
            visita_id: visitaServidorId,
            insumo_id: consumo.insumo_id,
            cantidad: nueva
          });

        if (errInsert) {
          throw traducirErrorInventario(errInsert, consumo);
        }

      }

      // Supabase confirmó: el catálogo local refleja el descuento una
      // sola vez y el registro sale de pendientes.
      if (porDescontar) {
        await ajustarExistenciaLocal(consumo.insumo_id, porDescontar);
      }

      await marcarConsumoEnviado(consumo.id, revision, nueva);
      enviados++;

    } catch (error) {

      console.error(
        '[RUTA] No se pudo sincronizar un consumo:',
        consumo.id,
        error
      );

      errores.push(error);

    }

  }

  if (errores.length) {
    throw errores[0];
  }

  return { enviados, omitidos };

}


// ==============================================
// VISITAS DEL TÉCNICO (COPIA LOCAL)
// ==============================================
//
// Descarga las visitas del técnico y las guarda en IndexedDB
// (misma consulta que usa la bitácora) para poder asignarles
// insumos también sin conexión.

export async function actualizarVisitasDesdeServidor(tecnicoId) {

  const { data, error } = await supabase
    .from('visitas')
    .select(`
      id,
      id_local,
      orden_id,
      tecnico_id,
      hora_entrada,
      hora_salida,
      ph,
      cloro,
      observaciones,
      quien_recibio,
      pendiente_envio,
      created_at
    `)
    .eq('tecnico_id', tecnicoId)
    .order('hora_entrada', { ascending: false });

  if (error) {
    throw error;
  }

  await guardarVisitasServidor(data || []);

  return (data || []).length;

}


// ==============================================
// REPORTE DE INSUMOS POR VISITA (ADMINISTRADOR)
// ==============================================

function unicos(valores) {
  return [...new Set(valores.filter(v => v !== null && v !== undefined))];
}


async function consultarPorIds(tabla, columnas, ids) {

  if (!ids.length) {
    return [];
  }

  const { data, error } = await supabase
    .from(tabla)
    .select(columnas)
    .in('id', ids);

  if (error) {
    throw error;
  }

  return data || [];

}


export async function obtenerReporteInsumos() {

  const { data: consumos, error } = await supabase
    .from('visita_insumo')
    .select('id, visita_id, insumo_id, cantidad')
    .order('id', { ascending: false });

  if (error) {
    throw error;
  }

  if (!consumos?.length) {
    return [];
  }

  const [insumos, visitas] = await Promise.all([
    consultarPorIds(
      'insumos',
      'id, nombre, unidad, existencia',
      unicos(consumos.map(c => c.insumo_id))
    ),
    consultarPorIds(
      'visitas',
      'id, orden_id, tecnico_id, hora_entrada, created_at',
      unicos(consumos.map(c => c.visita_id))
    )
  ]);

  const ordenes = await consultarPorIds(
    'ordenes_servicio',
    'id, condominio_id, area_id',
    unicos(visitas.map(v => v.orden_id))
  );

  const [condominios, areas, tecnicos] = await Promise.all([
    consultarPorIds(
      'condominios',
      'id, nombre',
      unicos(ordenes.map(o => o.condominio_id))
    ),
    consultarPorIds(
      'areas',
      'id, nombre',
      unicos(ordenes.map(o => o.area_id))
    ),
    consultarPorIds(
      'usuarios',
      'id, nombre',
      unicos(visitas.map(v => v.tecnico_id))
    )
  ]);

  const mapa = lista => new Map(lista.map(item => [item.id, item]));

  const insumosPorId = mapa(insumos);
  const visitasPorId = mapa(visitas);
  const ordenesPorId = mapa(ordenes);
  const condominiosPorId = mapa(condominios);
  const areasPorId = mapa(areas);
  const tecnicosPorId = mapa(tecnicos);

  const grupos = new Map();

  for (const consumo of consumos) {

    const visita = visitasPorId.get(consumo.visita_id);
    const orden = ordenesPorId.get(visita?.orden_id);
    const condominio = condominiosPorId.get(orden?.condominio_id);
    const area = areasPorId.get(orden?.area_id);
    const tecnico = tecnicosPorId.get(visita?.tecnico_id);
    const insumo = insumosPorId.get(consumo.insumo_id);

    if (!grupos.has(consumo.visita_id)) {

      grupos.set(consumo.visita_id, {
        visita_id: consumo.visita_id,
        orden_id: visita?.orden_id ?? null,
        titulo: [condominio?.nombre, area?.nombre]
          .filter(Boolean)
          .join(' - ') || `Visita #${consumo.visita_id}`,
        responsable: tecnico?.nombre || 'Sin responsable',
        fecha: visita?.hora_entrada || visita?.created_at || null,
        items: []
      });

    }

    grupos.get(consumo.visita_id).items.push({
      nombre: insumo?.nombre || `Insumo #${consumo.insumo_id}`,
      unidad: insumo?.unidad || '',
      cantidad: Number(consumo.cantidad)
    });

  }

  return [...grupos.values()].sort((a, b) =>
    String(b.fecha).localeCompare(String(a.fecha))
  );

}
