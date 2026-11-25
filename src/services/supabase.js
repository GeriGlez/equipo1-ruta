import { createClient } from '@supabase/supabase-js'

// Obtenemos las variables de entorno de Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[RUTA Warning] Faltan las variables de entorno de Supabase.\n' +
    'Crea un archivo .env en la raíz con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
  )
}

// Instancia global única del cliente para evitar conexiones duplicadas
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)
