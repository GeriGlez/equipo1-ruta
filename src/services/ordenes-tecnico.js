import {
  supabase
} from './supabase.js'

import {
  reemplazarOrdenesContextoTecnico,
  obtenerOrdenesContextoTecnico
} from '../modules/visitas/db-local.js'


// ============================================
// FECHA LOCAL YYYY-MM-DD
// ============================================

function obtenerFechaLocal() {

  const ahora = new Date()

  const year =
    ahora.getFullYear()

  const month =
    String(
      ahora.getMonth() + 1
    ).padStart(2, '0')

  const day =
    String(
      ahora.getDate()
    ).padStart(2, '0')


  return `${year}-${month}-${day}`

}


// ============================================
// SINCRONIZAR ÓRDENES DEL TÉCNICO
// ============================================

export async function sincronizarOrdenesTecnico(
  usuario,
  fechaProgramada = null
) {

  const fecha =
    fechaProgramada ||
    obtenerFechaLocal()

  
  // ------------------------------------------
  // SIN CONEXIÓN
  // ------------------------------------------

  if (!navigator.onLine) {

    return obtenerOrdenesContextoTecnico(
      usuario.id,
      fecha
    )

  }


  // ------------------------------------------
  // ÓRDENES AUTORIZADAS POR RLS
  // ------------------------------------------

  const {
    data: ordenes,
    error: errorOrdenes
  } =
    await supabase
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
      .eq(
        'fecha_programada',
        fecha
      )
      .order(
        'id',
        {
          ascending: true
        }
      )


  if (errorOrdenes) {
    throw errorOrdenes
  }


  // Si hoy no tiene órdenes, también debemos
  // limpiar cualquier copia local anterior.

  if (!ordenes.length) {

    return reemplazarOrdenesContextoTecnico(
      usuario.id,
      fecha,
      []
    )

  }


  // ------------------------------------------
  // IDS RELACIONADOS
  // ------------------------------------------

  const condominioIds =
    [...new Set(
      ordenes.map(
        orden => orden.condominio_id
      )
    )]


  const areaIds =
    [...new Set(
      ordenes.map(
        orden => orden.area_id
      )
    )]


  const servicioIds =
    [...new Set(
      ordenes.map(
        orden => orden.servicio_id
      )
    )]


  // ------------------------------------------
  // DATOS DEL CONTEXTO
  // ------------------------------------------

  const [
    respuestaCondominios,
    respuestaAreas,
    respuestaServicios
  ] =
    await Promise.all([

      supabase
        .from('condominios')
        .select(`
          id,
          nombre,
          notas_acceso
        `)
        .in(
          'id',
          condominioIds
        ),

      supabase
        .from('areas')
        .select(`
          id,
          nombre,
          tipo,
          requiere_lecturas
        `)
        .in(
          'id',
          areaIds
        ),

      supabase
        .from('servicios')
        .select(`
          id,
          nombre
        `)
        .in(
          'id',
          servicioIds
        )

    ])


  if (respuestaCondominios.error) {
    throw respuestaCondominios.error
  }

  if (respuestaAreas.error) {
    throw respuestaAreas.error
  }

  if (respuestaServicios.error) {
    throw respuestaServicios.error
  }


  // ------------------------------------------
  // MAPAS
  // ------------------------------------------

  const condominios =
    new Map(
      respuestaCondominios.data.map(
        item => [
          item.id,
          item
        ]
      )
    )


  const areas =
    new Map(
      respuestaAreas.data.map(
        item => [
          item.id,
          item
        ]
      )
    )


  const servicios =
    new Map(
      respuestaServicios.data.map(
        item => [
          item.id,
          item
        ]
      )
    )


  // ------------------------------------------
  // CONTEXTO COMPLETO
  // ------------------------------------------

  const contextos =
    ordenes.map(orden => {

      const condominio =
        condominios.get(
          orden.condominio_id
        )

      const area =
        areas.get(
          orden.area_id
        )

      const servicio =
        servicios.get(
          orden.servicio_id
        )


      if (
        !condominio ||
        !area ||
        !servicio
      ) {

        throw new Error(
          `No fue posible completar el contexto de la orden ${orden.id}.`
        )

      }


      return {

        orden_id:
          orden.id,

        tecnico_id:
          usuario.id,

        tecnico_nombre:
          usuario.nombre,

        cuadrilla_id:
          orden.cuadrilla_id,

        fecha_programada:
          orden.fecha_programada,

        estado:
          orden.estado,

        condominio: {

          id:
            condominio.id,

          nombre:
            condominio.nombre,

          notas_acceso:
            condominio.notas_acceso

        },

        area: {

          id:
            area.id,

          nombre:
            area.nombre,

          tipo:
            area.tipo,

          requiere_lecturas:
            area.requiere_lecturas

        },

        servicio: {

          id:
            servicio.id,

          nombre:
            servicio.nombre

        }

      }

    })


  return reemplazarOrdenesContextoTecnico(
    usuario.id,
    fecha,
    contextos
  )

}