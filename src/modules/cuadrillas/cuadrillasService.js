import { supabase } from '../../services/supabase.js'

// ============================================
// CUADRILLAS - SERVICIO DE DATOS
// ============================================

/**
 * Consulta todas las cuadrillas con su responsable y sus miembros asignados.
 */
export async function listarCuadrillas(filtro = '') {
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(`
      id,
      nombre,
      responsable_id,
      created_at,
      responsable:usuarios(id, nombre, correo, telefono),
      miembros:cuadrilla_usuario(
        id,
        usuario_id,
        fecha_alta,
        usuario:usuarios(id, nombre, correo, telefono, rol)
      )
    `)
    .order('created_at', { ascending: false })

  if (error) throw error

  let resultado = data || []

  if (filtro.trim()) {
    const q = filtro.trim().toLowerCase()
    resultado = resultado.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.responsable?.nombre?.toLowerCase().includes(q) ||
      c.miembros?.some(m => m.usuario?.nombre?.toLowerCase().includes(q))
    )
  }

  return resultado
}

/**
 * Obtiene el detalle de una cuadrilla por ID.
 */
export async function obtenerCuadrilla(id) {
  const { data, error } = await supabase
    .from('cuadrillas')
    .select(`
      id,
      nombre,
      responsable_id,
      responsable:usuarios(id, nombre, correo, telefono),
      miembros:cuadrilla_usuario(usuario_id)
    `)
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

/**
 * Crea una cuadrilla y asocia a sus técnicos miembros.
 * Criterio de aceptación: No permite cuadrilla sin responsable.
 */
export async function crearCuadrilla({ nombre, responsable_id, miembrosIds = [] }) {
  const nombreLimpio = String(nombre || '').trim()

  if (!nombreLimpio) {
    throw new Error('El nombre de la cuadrilla es obligatorio.')
  }

  if (!responsable_id) {
    throw new Error('Debes asignar un responsable a la cuadrilla obligatoriamente.')
  }

  // 1. Insertar la cuadrilla
  const { data: cuadrilla, error: errorCuadrilla } = await supabase
    .from('cuadrillas')
    .insert([{ nombre: nombreLimpio, responsable_id }])
    .select('id')
    .single()

  if (errorCuadrilla) throw errorCuadrilla

  // 2. Asociar miembros en cuadrilla_usuario
  // El responsable se incluye automáticamente si no venía en la lista
  const listaFinalMiembros = Array.from(new Set([responsable_id, ...miembrosIds]))

  const filasMiembros = listaFinalMiembros.map(uid => ({
    cuadrilla_id: cuadrilla.id,
    usuario_id: uid,
    fecha_alta: new Date().toISOString()
  }))

  const { error: errorMiembros } = await supabase
    .from('cuadrilla_usuario')
    .insert(filasMiembros)

  if (errorMiembros) throw errorMiembros

  return cuadrilla
}

/**
 * Actualiza los datos de una cuadrilla y sincroniza sus miembros.
 */
export async function actualizarCuadrilla(id, { nombre, responsable_id, miembrosIds = [] }) {
  const nombreLimpio = String(nombre || '').trim()

  if (!nombreLimpio) {
    throw new Error('El nombre de la cuadrilla es obligatorio.')
  }

  if (!responsable_id) {
    throw new Error('Debes asignar un responsable a la cuadrilla obligatoriamente.')
  }

  // 1. Actualizar encabezado
  const { error: errorUpdate } = await supabase
    .from('cuadrillas')
    .update({ nombre: nombreLimpio, responsable_id })
    .eq('id', id)

  if (errorUpdate) throw errorUpdate

  // 2. Sincronizar miembros en tabla pivote
  const listaFinalMiembros = Array.from(new Set([responsable_id, ...miembrosIds]))

  // Eliminar miembros anteriores
  await supabase
    .from('cuadrilla_usuario')
    .delete()
    .eq('cuadrilla_id', id)

  // Insertar nuevos miembros
  const filasMiembros = listaFinalMiembros.map(uid => ({
    cuadrilla_id: id,
    usuario_id: uid,
    fecha_alta: new Date().toISOString()
  }))

  const { error: errorInsert } = await supabase
    .from('cuadrilla_usuario')
    .insert(filasMiembros)

  if (errorInsert) throw errorInsert

  return true
}

/**
 * Elimina una cuadrilla y sus relaciones.
 */
export async function eliminarCuadrilla(id) {
  // Primero eliminamos de la tabla pivote
  await supabase
    .from('cuadrilla_usuario')
    .delete()
    .eq('cuadrilla_id', id)

  const { error } = await supabase
    .from('cuadrillas')
    .delete()
    .eq('id', id)

  if (error) throw error
  return true
}

// ============================================
// PERSONAL / EMPLEADOS - SERVICIO DE DATOS
// ============================================

/**
 * Lista todos los técnicos/empleados activos.
 */
export async function listarPersonal(filtro = '') {
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
        cuadrilla:cuadrillas(id, nombre)
      )
    `)
    .eq('activo', true)
    .order('nombre', { ascending: true })

  if (error) throw error

  let resultado = data || []
  if (filtro.trim()) {
    const q = filtro.trim().toLowerCase()
    resultado = resultado.filter(u =>
      u.nombre?.toLowerCase().includes(q) ||
      u.correo?.toLowerCase().includes(q) ||
      u.telefono?.includes(q) ||
      u.rol?.toLowerCase().includes(q)
    )
  }

  return resultado
}

/**
 * Registra un nuevo empleado en la tabla usuarios y opcionalmente lo asigna a cuadrillas.
 */
export async function crearEmpleado({ nombre, correo, telefono, rol = 'tecnico', cuadrillasIds = [] }) {
  const nombreLimpio = String(nombre || '').trim()
  const correoLimpio = String(correo || '').trim().toLowerCase()
  const telLimpio = String(telefono || '').trim()

  if (!nombreLimpio) throw new Error('El nombre completo es obligatorio.')
  if (!correoLimpio) throw new Error('El correo electrónico es obligatorio.')
  if (!telLimpio) throw new Error('El teléfono es obligatorio.')

  const { data: usuario, error: errorUsuario } = await supabase
    .from('usuarios')
    .insert([{
      nombre: nombreLimpio,
      correo: correoLimpio,
      telefono: telLimpio,
      rol: rol || 'tecnico',
      activo: true
    }])
    .select('id, nombre')
    .single()

  if (errorUsuario) throw errorUsuario

  // Asignar a cuadrillas seleccionadas
  if (cuadrillasIds.length > 0) {
    const filas = cuadrillasIds.map(cid => ({
      cuadrilla_id: cid,
      usuario_id: usuario.id,
      fecha_alta: new Date().toISOString()
    }))

    await supabase.from('cuadrilla_usuario').insert(filas)
  }

  return usuario
}
