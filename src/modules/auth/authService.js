import { supabase } from '../../services/supabase.js'
import { guardarUsuarioLocal, obtenerUsuarioLocal, obtenerUltimaSesionLocal } from '../../services/dbLocal.js'

// inicia sesion con correo y contraseña, con soporte online y offline
export async function login (email, password) {
    const emailNorm = email.trim().toLowerCase()

    // si no hay conexion a internet, validamos con indexeddb
    if (!navigator.onLine) {
        const cached = await obtenerUsuarioLocal(emailNorm)
        if (!cached) {
            throw new Error('Sin conexión. Este usuario no ha iniciado sesión en este dispositivo previamente.')
        }
        if (cached.password !== password) {
            throw new Error('Contraseña incorrecta.')
        }
        localStorage.setItem('ruta_sesion_activa', emailNorm)
        return {
            user: cached.user,
            profile: cached.profile,
            isOffline: true
        }
    }

    // si hay conexion, intentamos login normal con supabase
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: emailNorm,
            password
        })

        if (error) {
            throw error // si la contraseña eesta mal lanza error
        }

        //profe, este es un easter egg, si está leyendo esto significa que si lee el codigo de sus alumnos, gracias
        //el codigo es escrito por mi (alexei), pero debo admitir el uso de ia para corrección y guia

        const profile = await getUserprofile(data.user.id)

        // guardamos en indexeddb para que funcione la proxima vez sin internet
        await guardarUsuarioLocal({
            email: emailNorm,
            password,
            profile,
            user: data.user
        })

        localStorage.setItem('ruta_sesion_activa', emailNorm)

        return {
            user: data.user,
            profile: profile,
            isOffline: false
        }
    } catch (err) {
        // si falla por caida de conexion al enviar, intentamos respaldo local
        if (err.message && (err.message.includes('Failed to fetch') || err.message.includes('NetworkError'))) {
            const cached = await obtenerUsuarioLocal(emailNorm)
            if (cached && cached.password === password) {
                return {
                    user: cached.user,
                    profile: cached.profile,
                    isOffline: true
                }
            }
        }
        throw err
    }
}


// esta es una consulta del rol y nombre en la tabla public.perfiles
export async function getUserprofile(userId){
    const{data, error} = await supabase
    .from('perfiles')
    .select('id, nombre, apellido, rol')
    .eq('id', userId)
    .single()
    //si falla en la consulta salta error en la consola
    if (error){
        console.error('error al obtener perfil', error.message)
        return null
    }
    return data
}

// obtiene la sesión actual cuardada en el navegador
export async function getActiveSession() {
  // si hay internet, revisamos primero la sesion de supabase
  if (navigator.onLine) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const profile = await getUserprofile(session.user.id)
        localStorage.setItem('ruta_sesion_activa', session.user.email.toLowerCase())
        return { user: session.user, profile, isOffline: false }
      }
    } catch (e) {
      console.warn('no se pudo consultar sesion online, probando local...')
    }
  }

  // si estamos offline, revisamos si habia una sesion activa en este dispositivo
  const emailActivo = localStorage.getItem('ruta_sesion_activa')
  if (emailActivo) {
    const cached = await obtenerUsuarioLocal(emailActivo)
    if (cached) {
      return { user: cached.user, profile: cached.profile, isOffline: true }
    }
  }

  return null
}

// funcion para cerrar sesión
export async function logout() {
  // quitamos la sesion activa local
  localStorage.removeItem('ruta_sesion_activa')

  // si hay internet tambien cerramos sesion en supabase
  if (navigator.onLine) {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Error al salir de supabase:', err.message)
    }
  }
}
