// Módulo 1 · HU-02: Notas de acceso visibles para el técnico
// Pieza reutilizable: cualquier pantalla de orden puede usarla.
//
// Uso:
//   import { mostrarNotasAcceso } from '../condominios/notas-acceso.js'
//   mostrarNotasAcceso(contenedor, contexto.condominio)

// Vite permite importar CSS desde JS: quien use el componente
// recibe sus estilos sin tocar su HTML
import './notas-acceso.css'

// Sin conexión las notas vienen dentro del contexto guardado en IndexedDB.
// Con conexión, si no vienen, se consultan (RLS solo deja ver las de sus órdenes).
async function obtenerNotas(condominio) {
  if (condominio?.notas_acceso !== undefined) return condominio.notas_acceso
  if (!condominio?.id || !navigator.onLine) return null

  try {
    // Import dinámico: Supabase solo se carga si hace falta,
    // así la pantalla abre aunque no haya conexión
    const { supabase } = await import('../../services/supabase.js')

    const { data, error } = await supabase
      .from('condominios')
      .select('notas_acceso')
      .eq('id', condominio.id)
      .maybeSingle()

    if (error) throw error
    return data?.notas_acceso ?? null
  } catch (error) {
    console.warn('[Condominios] No se pudieron obtener las notas de acceso:', error)
    return null
  }
}

export async function mostrarNotasAcceso(contenedor, condominio) {
  if (!contenedor) return

  // Si ya se había dibujado (por ejemplo, al recargar el contexto), se reemplaza
  contenedor.querySelector('.notas-acceso')?.remove()

  const notas = (await obtenerNotas(condominio))?.trim()
  if (!notas) return

  const recuadro = document.createElement('aside')
  recuadro.className = 'notas-acceso'
  recuadro.setAttribute('aria-label', 'Notas de acceso al condominio')

  const titulo = document.createElement('strong')
  titulo.textContent = 'Notas de acceso'

  const texto = document.createElement('p')
  texto.textContent = notas // textContent: una nota con HTML no se ejecuta

  recuadro.append(titulo, texto)
  contenedor.append(recuadro)
}