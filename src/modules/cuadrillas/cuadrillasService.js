import { supabase } from '../../services/supabase.js'

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PATRON_TELEFONO = /^\d{10}$/

function limpiarTelefono(texto) {
  const limpio = String(texto || '').replace(/[\s-]/g, '').trim()
  if (!limpio) {
    throw new Error('Por favor, ingresa el número de teléfono del empleado.')
  }
  if (!PATRON_TELEFONO.test(limpio)) {
    throw new Error('El teléfono debe contener exactamente 10 dígitos numéricos (sin espacios ni letras).')
  }
  return limpio
}

function validarDatosCuadrilla(nombre, responsable_id, miembrosIds = []) {
  const nombreLimpio = String(nombre || '').trim()
  const respLimpio = String(responsable_id || '').trim()

  if (!nombreLimpio) {
    throw new Error('Por favor, ingresa el nombre de la cuadrilla.')
  }
  if (!respLimpio) {
    throw new Error('Debes seleccionar un técnico responsable para la cuadrilla.')
  }

  const idsLimpiados = Array.from(new Set(miembrosIds.map(id => String(id || '').trim()).filter(Boolean)))
  if (idsLimpiados.includes(respLimpio)) {
    throw new Error('El técnico responsable no puede asignarse también como técnico de apoyo en la misma cuadrilla.')
  }

  return { nombreLimpio, respLimpio, miembrosApoyoIds: idsLimpiados }
}

// ============================================
// CUADRILLAS - SERVICIO DE DATOS
// ============================================

/**
 * Consulta todas las cuadrillas con su responsable y sus técnicos de apoyo.
 */
export async function listarCuadrillas() {
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(`
      id,
      nombre,
      responsable_id,
      activo,
      created_at,
      responsable:usuarios(id, nombre, correo, telefono, activo),
      miembros:cuadrilla_usuario(
        id,
        usuario_id,
        fecha_alta,
        usuario:usuarios(id, nombre, correo, telefono, rol, activo)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  // Si existen registros históricos donde el responsable estaba duplicado como apoyo, limpiarlos en BD
  const idsDuplicados = (data || []).flatMap(c =>
    (c.miembros || []).filter(m => m.usuario_id === c.responsable_id && m.id).map(m => m.id)
  )
  if (idsDuplicados.length > 0) {
    supabase.from('cuadrilla_usuario').delete().in('id', idsDuplicados).then(() => {})
  }

  // Un técnico responsable, administrador o dado de baja nunca debe figurar como técnico de apoyo activo
  return (data || []).map(c => ({
    ...c,
    activo: c.activo ?? true,
    miembros: (c.miembros || []).filter(
      m =>
        m.usuario_id !== c.responsable_id &&
        m.usuario?.activo !== false &&
        m.usuario?.rol !== 'administrador'
    )
  }))
}

async function verificarNombreCuadrillaUnico(nombreLimpio, excluirId = null) {
  const { data, error } = await supabase
    .from('cuadrillas')
    .select('id, nombre')
    .ilike('nombre', nombreLimpio)

  if (error) throw error
  const duplicada = (data || []).some(
    c => c.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase() && String(c.id) !== String(excluirId)
  )
  if (duplicada) {
    throw new Error(`Ya existe una cuadrilla registrada con el nombre "${nombreLimpio}".`)
  }
}

/**
 * Crea una cuadrilla y asocia únicamente a sus técnicos de apoyo.
 */
export async function crearCuadrilla({ nombre, responsable_id, miembrosIds = [] }) {
  const { nombreLimpio, respLimpio, miembrosApoyoIds } = validarDatosCuadrilla(
    nombre,
    responsable_id,
    miembrosIds
  )

  await verificarNombreCuadrillaUnico(nombreLimpio)

  const { data: cuadrilla, error: errorCuadrilla } = await supabase
    .from('cuadrillas')
    .insert([{ nombre: nombreLimpio, responsable_id: respLimpio, activo: true }])
    .select('id')
    .single()

  if (errorCuadrilla) throw errorCuadrilla

  if (miembrosApoyoIds.length > 0) {
    const filasMiembros = miembrosApoyoIds.map(uid => ({
      cuadrilla_id: cuadrilla.id,
      usuario_id: uid,
      fecha_alta: new Date().toISOString().split('T')[0]
    }))

    const { error: errorMiembros } = await supabase
      .from('cuadrilla_usuario')
      .insert(filasMiembros)

    if (errorMiembros) {
      await supabase.from('cuadrillas').delete().eq('id', cuadrilla.id)
      throw new Error(`No se pudieron asignar los técnicos de apoyo: ${errorMiembros.message}`)
    }
  }

  return cuadrilla
}

/**
 * Actualiza los datos de una cuadrilla y sincroniza sus técnicos de apoyo.
 */
export async function actualizarCuadrilla(id, { nombre, responsable_id, miembrosIds = [] }) {
  const { nombreLimpio, respLimpio, miembrosApoyoIds } = validarDatosCuadrilla(
    nombre,
    responsable_id,
    miembrosIds
  )

  await verificarNombreCuadrillaUnico(nombreLimpio, id)

  const { data: actualizada, error: errorUpdate } = await supabase
    .from('cuadrillas')
    .update({ nombre: nombreLimpio, responsable_id: respLimpio })
    .eq('id', id)
    .select('id')

  if (errorUpdate) throw errorUpdate
  if (!actualizada?.length) {
    throw new Error('No tienes permiso para editar esta cuadrilla o ya no existe.')
  }

  const { data: miembrosAnteriores } = await supabase
    .from('cuadrilla_usuario')
    .select('usuario_id, fecha_alta')
    .eq('cuadrilla_id', id)

  const mapaFechas = new Map(
    (miembrosAnteriores || []).map(m => [String(m.usuario_id), m.fecha_alta])
  )

  const { error: errorDelete } = await supabase
    .from('cuadrilla_usuario')
    .delete()
    .eq('cuadrilla_id', id)

  if (errorDelete) throw errorDelete

  if (miembrosApoyoIds.length > 0) {
    const hoy = new Date().toISOString().split('T')[0]
    const filasMiembros = miembrosApoyoIds.map(uid => ({
      cuadrilla_id: id,
      usuario_id: uid,
      fecha_alta: mapaFechas.get(String(uid)) || hoy
    }))

    const { error: errorInsert } = await supabase
      .from('cuadrilla_usuario')
      .insert(filasMiembros)

    if (errorInsert) {
      if (miembrosAnteriores?.length) {
        await supabase.from('cuadrilla_usuario').insert(
          miembrosAnteriores
            .filter(m => m.usuario_id !== respLimpio)
            .map(m => ({
              cuadrilla_id: id,
              usuario_id: m.usuario_id,
              fecha_alta: m.fecha_alta
            }))
        )
      }
      throw new Error(`No se pudieron actualizar los técnicos de apoyo: ${errorInsert.message}`)
    }
  }

  return true
}

/**
 * Borrado lógico (activar / desactivar) de una cuadrilla conservando su historial.
 */
export async function cambiarEstadoCuadrilla(id, activo) {
  if (!id) throw new Error('El identificador de la cuadrilla es obligatorio.')

  if (activo) {
    const { data: actual, error: errorActual } = await supabase
      .from('cuadrillas')
      .select('responsable:usuarios(nombre, activo, rol)')
      .eq('id', id)
      .single()

    if (errorActual) throw errorActual
    if (!actual?.responsable?.activo || actual.responsable.rol !== 'tecnico') {
      throw new Error(
        'No puedes reactivar esta cuadrilla porque su técnico responsable fue dado de baja. Edita la cuadrilla y asigna primero a un técnico activo.'
      )
    }
  }

  const { data, error } = await supabase
    .from('cuadrillas')
    .update({ activo: Boolean(activo) })
    .eq('id', id)
    .select('id')

  if (error) throw error
  if (!data?.length) {
    throw new Error('No tienes permiso para cambiar el estado de la cuadrilla o no existe.')
  }

  return true
}

/**
 * Elimina físicamente una cuadrilla solo si no tiene órdenes de servicio asociadas.
 */
export async function eliminarCuadrilla(id) {
  if (!id) throw new Error('El identificador de la cuadrilla es obligatorio.')

  // Verificar primero si tiene órdenes de servicio antes de tocar cuadrilla_usuario
  const { data: conOrdenes, error: errorOrdenes } = await supabase
    .from('ordenes_servicio')
    .select('id')
    .eq('cuadrilla_id', id)
    .limit(1)

  if (errorOrdenes) throw errorOrdenes
  if (conOrdenes?.length > 0) {
    throw new Error(
      'No se puede eliminar esta cuadrilla porque ya tiene órdenes de servicio registradas. Usa el botón "Desactivar" para darla de baja conservando su historial.'
    )
  }

  const { data: miembrosRespaldo } = await supabase
    .from('cuadrilla_usuario')
    .select('usuario_id, fecha_alta')
    .eq('cuadrilla_id', id)

  const { error: errorPivote } = await supabase
    .from('cuadrilla_usuario')
    .delete()
    .eq('cuadrilla_id', id)

  if (errorPivote) {
    throw new Error(`No se pudieron desvincular los técnicos de la cuadrilla: ${errorPivote.message}`)
  }

  const { data, error } = await supabase
    .from('cuadrillas')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    if (miembrosRespaldo?.length) {
      await supabase.from('cuadrilla_usuario').insert(
        miembrosRespaldo.map(m => ({
          cuadrilla_id: id,
          usuario_id: m.usuario_id,
          fecha_alta: m.fecha_alta
        }))
      )
    }
    if (error.code === '23503') {
      throw new Error(
        'No se puede eliminar esta cuadrilla porque tiene registros asociados en el sistema. Usa la opción "Desactivar".'
      )
    }
    throw new Error(`No se pudo eliminar la cuadrilla: ${error.message}`)
  }

  if (!data?.length) {
    throw new Error('No tienes permiso para eliminar esta cuadrilla o ya no existe.')
  }

  return true
}

// ============================================
// PERSONAL / EMPLEADOS - SERVICIO DE DATOS
// ============================================

function prepararDatosEmpleado({ nombre, correo, telefono, rol = 'tecnico' }) {
  const nombreLimpio = String(nombre || '').trim()
  const correoLimpio = String(correo || '').trim().toLowerCase()
  const rolLimpio = rol === 'administrador' ? 'administrador' : 'tecnico'

  if (!nombreLimpio) {
    throw new Error('Por favor, ingresa el nombre completo del empleado.')
  }
  if (!correoLimpio) {
    throw new Error('Por favor, ingresa el correo electrónico del empleado.')
  }
  if (!PATRON_CORREO.test(correoLimpio)) {
    throw new Error('El formato del correo electrónico no es válido (ejemplo: usuario@dominio.com).')
  }

  const telLimpio = limpiarTelefono(telefono)

  return {
    nombre: nombreLimpio,
    correo: correoLimpio,
    telefono: telLimpio,
    rol: rolLimpio
  }
}

/**
 * Lista todos los empleados (activos e inactivos) para permitir gestión completa.
 */
export async function listarPersonal() {
  const { data, error } = await supabase
    .from('usuarios')
    .select(`
      id,
      nombre,
      correo,
      telefono,
      rol,
      activo,
      cuadrillas:cuadrilla_usuario(
        cuadrilla:cuadrillas(id, nombre, activo)
      )
    `)
    .order('nombre', { ascending: true })

  if (error) throw error
  return (data || []).map(u => ({
    ...u,
    activo: u.activo ?? true
  }))
}

/**
 * Registra un nuevo empleado en la tabla usuarios.
 */
export async function crearEmpleado(datos) {
  const empleado = prepararDatosEmpleado(datos)

  const { data: usuario, error } = await supabase
    .from('usuarios')
    .insert([{ ...empleado, activo: true }])
    .select('id, nombre')
    .single()

  if (error) {
    if (error.code === '23505' || error.message?.includes('usuarios_correo_key')) {
      throw new Error('Ya existe un empleado registrado con ese correo electrónico.')
    }
    throw new Error(`No se pudo registrar al empleado: ${error.message}`)
  }

  return usuario
}

/**
 * Edita los datos de un empleado existente.
 */
export async function actualizarEmpleado(id, datos) {
  if (!id) throw new Error('El identificador del empleado es obligatorio.')
  const empleado = prepararDatosEmpleado(datos)

  if (empleado.rol === 'administrador') {
    const { data: cuadrillasResp, error: errorResp } = await supabase
      .from('cuadrillas')
      .select('nombre')
      .eq('responsable_id', id)
      .eq('activo', true)

    if (errorResp) throw errorResp
    if (cuadrillasResp?.length > 0) {
      const nombres = cuadrillasResp.map(c => `"${c.nombre}"`).join(', ')
      throw new Error(
        `No puedes cambiar el rol a Administrador porque este técnico es responsable de la cuadrilla activa ${nombres}. Asigna otro responsable primero.`
      )
    }
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update(empleado)
    .eq('id', id)
    .select('id')

  if (error) {
    if (error.code === '23505' || error.message?.includes('usuarios_correo_key')) {
      throw new Error('Ya existe otro empleado registrado con ese correo electrónico.')
    }
    throw new Error(`No se pudieron guardar los cambios del empleado: ${error.message}`)
  }

  if (!data?.length) {
    throw new Error('No tienes permiso para editar este empleado o el registro no existe.')
  }

  if (empleado.rol === 'administrador') {
    await supabase.from('cuadrilla_usuario').delete().eq('usuario_id', id)
  }

  return true
}

/**
 * Da de baja (activo = false) o reactiva (activo = true) a un empleado.
 */
export async function cambiarEstadoEmpleado(id, activo) {
  if (!id) throw new Error('El identificador del empleado es obligatorio.')

  if (!activo) {
    const { data: cuadrillasResponsable, error: errorResp } = await supabase
      .from('cuadrillas')
      .select('nombre')
      .eq('responsable_id', id)
      .eq('activo', true)

    if (errorResp) throw errorResp
    if (cuadrillasResponsable?.length > 0) {
      const nombres = cuadrillasResponsable.map(c => `"${c.nombre}"`).join(', ')
      throw new Error(
        `No puedes dar de baja a este técnico porque es responsable de la cuadrilla activa ${nombres}. Asigna otro responsable primero.`
      )
    }
  }

  const { data, error } = await supabase
    .from('usuarios')
    .update({ activo: Boolean(activo) })
    .eq('id', id)
    .select('id')

  if (error) throw new Error(`No se pudo actualizar el estado del empleado: ${error.message}`)
  if (!data?.length) {
    throw new Error('No tienes permiso para cambiar el estado de este empleado.')
  }

  return true
}
