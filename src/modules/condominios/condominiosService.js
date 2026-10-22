// Módulo 1 · Condominios y áreas
// Funciones que hablan con Supabase. Las pantallas solo llaman a estas funciones.

import { supabase } from '../../services/supabase.js'

export const TIPOS_AREA = [
  { valor: 'alberca', etiqueta: 'Alberca' },
  { valor: 'jardin', etiqueta: 'Jardín' },
  { valor: 'area_comun', etiqueta: 'Área común' },
  { valor: 'equipo', etiqueta: 'Equipo' }
]

export const POR_PAGINA = 10

// '' o '   ' se guardan como null; quita espacios sobrantes
function limpiar(texto) {
  const valor = (texto ?? '').trim()
  return valor === '' ? null : valor
}
// Teléfono: solo números y exactamente 10 dígitos (se toleran espacios y guiones al escribir)
const PATRON_TELEFONO = /^\d{10}$/

function prepararTelefono(texto) {
  const telefono = limpiar(texto)?.replace(/[\s-]/g, '') ?? null
  if (telefono && !PATRON_TELEFONO.test(telefono)) {
    throw new Error('El teléfono debe tener exactamente 10 dígitos, solo números.')
  }
  return telefono
}
function prepararCondominio(datos) {
  const condominio = {
    nombre: limpiar(datos.nombre),
    direccion: limpiar(datos.direccion),
    colonia: limpiar(datos.colonia),
    contacto: limpiar(datos.contacto),
    telefono: prepararTelefono(datos.telefono),
    notas_acceso: limpiar(datos.notas_acceso),
    activo: datos.activo ?? true
  }

  if (!condominio.nombre) throw new Error('El nombre del condominio es obligatorio.')
  if (!condominio.direccion) throw new Error('La dirección es obligatoria.')

  return condominio
}

function prepararArea(area, condominioId) {
  const nombre = limpiar(area.nombre)

  if (!nombre) throw new Error('Cada área necesita un nombre.')
  if (!TIPOS_AREA.some(t => t.valor === area.tipo)) {
    throw new Error(`Tipo de área no válido: ${area.tipo}`)
  }

  return {
    condominio_id: condominioId,
    nombre,
    tipo: area.tipo,
    requiere_lecturas: area.requiere_lecturas ?? area.tipo === 'alberca'
  }
}

// ---------- Listado con búsqueda, filtros y paginación ----------

export async function listarCondominios({
  busqueda = '',
  tipoArea = '',
  estado = 'activos',
  pagina = 1
} = {}) {
  const columnas = 'id, nombre, direccion, colonia, contacto, telefono, activo, areas(id, tipo)'

  // Si filtran por tipo, se une con areas "!inner": solo quedan
  // los condominios que tienen al menos un área de ese tipo
  const seleccion = tipoArea ? `${columnas}, filtro:areas!inner(tipo)` : columnas

  let consulta = supabase
    .from('condominios')
    .select(seleccion, { count: 'exact' })
    .order('nombre')

  if (estado === 'activos') consulta = consulta.eq('activo', true)
  if (estado === 'inactivos') consulta = consulta.eq('activo', false)

  // Quitamos caracteres que romperían el filtro .or()
  const texto = busqueda.replace(/[,()%]/g, ' ').trim()
  if (texto) {
    consulta = consulta.or(
      `nombre.ilike.%${texto}%,colonia.ilike.%${texto}%,contacto.ilike.%${texto}%`
    )
  }

  if (tipoArea) consulta = consulta.eq('filtro.tipo', tipoArea)

  const desde = (pagina - 1) * POR_PAGINA
  consulta = consulta.range(desde, desde + POR_PAGINA - 1)

  const { data, error, count } = await consulta
  if (error) throw error

  const total = count ?? 0

  return {
    condominios: data.map(({ filtro, ...c }) => ({ ...c, total_areas: c.areas.length })),
    total,
    pagina,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA))
  }
}

// ---------- Detalle (para editar) ----------

export async function obtenerCondominio(id) {
  const { data, error } = await supabase
    .from('condominios')
    .select('*, areas(id, nombre, tipo, requiere_lecturas)')
    .eq('id', id)
    .order('nombre', { referencedTable: 'areas' })
    .single()

  if (error) throw error
  return data
}

// ---------- Alta: condominio + sus áreas ----------

export async function crearCondominio(datos, areas = []) {
  const condominio = prepararCondominio(datos)
  // Validamos TODAS las áreas antes de guardar nada
  const filasAreas = areas.map(a => prepararArea(a, null))

  const { data: nuevo, error } = await supabase
    .from('condominios')
    .insert(condominio)
    .select('id')
    .single()

  if (error) throw error

  if (filasAreas.length > 0) {
    const { error: errorAreas } = await supabase
      .from('areas')
      .insert(filasAreas.map(a => ({ ...a, condominio_id: nuevo.id })))

    if (errorAreas) {
      throw new Error(
        `El condominio se guardó, pero sus áreas no (${errorAreas.message}). Edítalo para agregarlas.`
      )
    }
  }

  return nuevo.id
}

// ---------- Edición ----------

export async function actualizarCondominio(id, datos) {
  const { data, error } = await supabase
    .from('condominios')
    .update(prepararCondominio(datos))
    .eq('id', id)
    .select('id')

  if (error) throw error
  // Si RLS bloquea un update, Supabase NO marca error: solo actualiza 0 filas
  if (data.length === 0) throw new Error('No tienes permiso o el condominio no existe.')
}

export async function cambiarEstadoCondominio(id, activo) {
  const { data, error } = await supabase
    .from('condominios')
    .update({ activo })
    .eq('id', id)
    .select('id')

  if (error) throw error
  if (data.length === 0) throw new Error('No tienes permiso o el condominio no existe.')
}

export async function agregarAreas(condominioId, areas) {
  const filas = areas.map(a => prepararArea(a, condominioId))
  const { error } = await supabase.from('areas').insert(filas)
  if (error) throw error
}
// ---------- Eliminar áreas ya registradas ----------

export async function eliminarAreas(ids) {
  if (ids.length === 0) return

  // Un área con órdenes no se borra: rompería el historial de visitas y reportes
  const { data: conOrdenes, error: errorOrdenes } = await supabase
    .from('ordenes_servicio')
    .select('area_id, areas(nombre)')
    .in('area_id', ids)

  if (errorOrdenes) throw errorOrdenes

  if (conOrdenes.length > 0) {
    const nombres = [...new Set(conOrdenes.map(o => o.areas?.nombre ?? `#${o.area_id}`))]
    throw new Error(
      `No se puede eliminar ${nombres.join(', ')}: ya tiene órdenes de servicio registradas.`
    )
  }

  const { data, error } = await supabase
    .from('areas')
    .delete()
    .in('id', ids)
    .select('id')

  // 23503 = la base lo impide porque otra tabla apunta al área (por ejemplo, incidencias)
  if (error?.code === '23503') {
    throw new Error('No se puede eliminar el área: tiene incidencias u otros registros asociados.')
  }
  if (error) throw error
  // Igual que en update: si RLS bloquea el delete, no hay error, solo 0 filas
  if (data.length < ids.length) throw new Error('No tienes permiso para eliminar estas áreas.')
}