
import { supabase } from './supabase.js';

import {
  obtenerVisitasLocales,
  guardarVisitasServidor,
  obtenerContextoOrden,
  guardarContextoOrden
} from '../modules/pendientes_sync/db-local.js';


async function confirmarIdentidad(authUid) {
  if (localStorage.getItem('ruta_active_auth_uid') !== authUid) {
    throw new Error('Cambió el técnico activo en RUTA.');
  }

  const { data, error } = await supabase.auth.getUser();

  if (
    error ||
    !data?.user ||
    data.user.id !== authUid ||
    localStorage.getItem('ruta_active_auth_uid') !== authUid
  ) {
    throw new Error(
      'La sesión remota no corresponde al técnico activo.'
    );
  }
}


// Reutilizar aquí la función completarContextosFaltantes()
// que actualmente funciona en visitas-bitacora.js.

export async function precargarBitacoraTecnico(sesion) {
  if (
    !navigator.onLine ||
    sesion?.isOffline !== false ||
    sesion?.requiereAutenticacionOnline === true ||
    sesion?.usuario?.rol !== 'tecnico' ||
    !sesion?.usuario?.id ||
    !sesion?.user?.id
  ) {
    return;
  }

  const usuario = sesion.usuario;
  const authUid = sesion.user.id;

  await confirmarIdentidad(authUid);

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
    .eq('tecnico_id', usuario.id)
    .order('hora_entrada', { ascending: false });

  if (error) throw error;

  // Evitar guardar datos si cambió la cuenta
  // durante la solicitud de red.
  await confirmarIdentidad(authUid);

  // Conserva las ediciones locales pendientes.
  await guardarVisitasServidor(data || []);

  const visitasLocales = await obtenerVisitasLocales();

  const visitasTecnico = visitasLocales.filter(
    visita =>
      String(visita.tecnico_id) === String(usuario.id)
  );

    const recuperados = await completarContextosFaltantes(
    visitasTecnico,
    usuario,
    authUid
    );
  console.log('[RUTA] Precarga offline completada:', {
    visitas: visitasTecnico.length,
    contextosRecuperados: recuperados
  });
}


// ============================================
 // RECUPERAR CONTEXTOS DE VISITAS HISTÓRICAS
 // ============================================

export async function completarContextosFaltantes(
  visitas,
  usuario,
  authUid
) {
  if (!navigator.onLine || visitas.length === 0) return 0;

  await confirmarIdentidad(authUid);

  if (!authUid) {
    throw new Error('No se proporcionó la identidad del técnico.');
  }

  if (!navigator.onLine || visitas.length === 0) return 0;

  const idsOrden = [...new Set(
    visitas
      .map(visita => Number(visita.orden_id))
      .filter(id => Number.isSafeInteger(id) && id > 0)
  )];

  const idsFaltantes = [];

  for (const ordenId of idsOrden) {
    const contexto = await obtenerContextoOrden(ordenId);

    if (
      !contexto?.condominio?.nombre ||
      !contexto?.area?.nombre ||
      !contexto?.servicio?.nombre
    ) {
      idsFaltantes.push(ordenId);
    }
  }

  if (idsFaltantes.length === 0) return 0;

  // Consultar únicamente órdenes históricas de las visitas visibles.
  // Supabase/RLS determina cuáles puede leer el técnico.
  const { data: ordenes, error: errorOrdenes } = await supabase
    .from('ordenes_servicio')
    .select(`
      id,
      condominio_id,
      area_id,
      servicio_id,
      cuadrilla_id,
      fecha_programada,
      estado
    `)
    .in('id', idsFaltantes);

  if (errorOrdenes) throw errorOrdenes;

  if (!ordenes?.length) {
    console.warn(
      '[RUTA] No hay órdenes históricas accesibles para completar la bitácora.'
    );
    return 0;
  }

  const idsRelacionados = campo =>
    [...new Set(
      ordenes
        .map(orden => orden[campo])
        .filter(id => id !== null && id !== undefined)
    )];

  const [respuestaCondominios, respuestaAreas, respuestaServicios] =
    await Promise.all([
      supabase
        .from('condominios')
        .select('id, nombre, notas_acceso')
        .in('id', idsRelacionados('condominio_id')),
      supabase
        .from('areas')
        .select('id, nombre, tipo, requiere_lecturas')
        .in('id', idsRelacionados('area_id')),
      supabase
        .from('servicios')
        .select('id, nombre')
        .in('id', idsRelacionados('servicio_id'))
    ]);

  for (const respuesta of [
    respuestaCondominios,
    respuestaAreas,
    respuestaServicios
  ]) {
    if (respuesta.error) throw respuesta.error;
  }

  const condominios = new Map(
    (respuestaCondominios.data || []).map(item => [String(item.id), item])
  );
  const areas = new Map(
    (respuestaAreas.data || []).map(item => [String(item.id), item])
  );
  const servicios = new Map(
    (respuestaServicios.data || []).map(item => [String(item.id), item])
  );

  let guardados = 0;

  for (const orden of ordenes) {
    // Evitar guardar contextos si la sesión cambió.
    await confirmarIdentidad(authUid);
    const condominio = condominios.get(String(orden.condominio_id));
    const area = areas.get(String(orden.area_id));
    const servicio = servicios.get(String(orden.servicio_id));

    // No almacenar un contexto incompleto ni inventar nombres.
    if (!condominio || !area || !servicio) {
      console.warn(
        `[RUTA] Contexto incompleto o sin permisos para la orden ${orden.id}.`
      );
      continue;
    }

    await guardarContextoOrden({
      orden_id: orden.id,
      tecnico_id: usuario.id,
      tecnico_nombre: usuario.nombre,
      cuadrilla_id: orden.cuadrilla_id,
      fecha_programada: orden.fecha_programada,
      estado: orden.estado,
      condominio: {
        id: condominio.id,
        nombre: condominio.nombre,
        notas_acceso: condominio.notas_acceso
      },
      area: {
        id: area.id,
        nombre: area.nombre,
        tipo: area.tipo,
        requiere_lecturas: area.requiere_lecturas
      },
      servicio: {
        id: servicio.id,
        nombre: servicio.nombre
      }
    });

    guardados++;
  }

  return guardados;
}
