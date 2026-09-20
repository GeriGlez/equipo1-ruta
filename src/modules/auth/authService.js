import { supabase } from '../../services/supabase.js'
//inicia sesion con correo y contraseña, con superbase
export async function login (email, password) {
    const {data, error}= await supabase.auth.signInWithPassword({
        email,
        password
    })
    if (error){
        throw error //si la contraseña eesta mal lanza error
    }

    //profe, este es un easter egg, si está leyendo esto significa que si lee el codigo de sus alumnos, gracias
    //el codigo es escrito por mi (alexei), pero debo admitir el uso de ia para corrección y guia

    const profile = await getUserprofile(data.user.id)

    return {
        user: data.user,
        profile: profile
    }
}


//esta es una consulta del rol y nombre en la tabla public.perfiles
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

//obtiene la sesión actual cuardada en el navegador
export async function getActiveSession() {
  const { data: { session } } = await supabase.auth.getSession()
  
  if (!session?.user) return null
  const profile = await getUserprofile(session.user.id)
  return { user: session.user, profile }
}

// funcion para cerrar sesión
export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('Error al salir:', error.message)
  }
}
