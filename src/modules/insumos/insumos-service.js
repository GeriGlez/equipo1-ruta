// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Comunicación con Supabase para insumos
// ==============================================

import { supabase } from '../../services/supabase.js';

import {
  guardarCatalogoLocal,
  obtenerConsumosPendientes,
  marcarConsumoEnviado,
  eliminarConsumoLocal
} from './insumos-local.js';

import { obtenerVisitasLocales } from '../pendientes_sync/db-local.js';


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

      const visita = visitasPorId.get(consumo.visita_local_id);
      const visitaServidorId =
        visita?.visita_servidor_id ||
        (typeof visita?.id === 'number' ? visita.id : null);

      if (!visitaServidorId) {
        omitidos++;
        continue;
      }

      // ---------- ELIMINAR ----------
      if (consumo.operacion_pendiente === 'eliminar') {

        const { error } = await supabase
          .from('visita_insumo')
          .delete()
          .match({
            visita_id: visitaServidorId,
            insumo_id: consumo.insumo_id
          });

        if (error) {
          throw error;
        }

        await eliminarConsumoLocal(consumo.id);
        enviados++;
        continue;

      }

      // ---------- ACTUALIZAR O INSERTAR (IDEMPOTENTE) ----------
      const { data: existente, error: errBusqueda } = await supabase
        .from('visita_insumo')
        .select('id')
        .eq('visita_id', visitaServidorId)
        .eq('insumo_id', consumo.insumo_id)
        .maybeSingle();

      if (errBusqueda) {
        throw errBusqueda;
      }

      if (existente?.id) {

        const { error: errUpdate } = await supabase
          .from('visita_insumo')
          .update({
            cantidad: Number(consumo.cantidad)
          })
          .eq('id', existente.id);

        if (errUpdate) {
          throw errUpdate;
        }

      } else {

        const { error: errInsert } = await supabase
          .from('visita_insumo')
          .insert({
            visita_id: visitaServidorId,
            insumo_id: consumo.insumo_id,
            cantidad: Number(consumo.cantidad)
          });

        if (errInsert) {
          throw errInsert;
        }

      }

      await marcarConsumoEnviado(consumo.id);
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
