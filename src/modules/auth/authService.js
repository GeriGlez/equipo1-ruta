import { supabase } from '../../services/supabase.js'
import {
  guardarUsuarioContexto,
  obtenerUsuarioContexto,
  obtenerUsuarioContextoPorCorreo,
  guardarCredencialOffline
} from '../visitas/db-local.js'

// Constantes de almacenamiento local
const ACTIVE_AUTH_UID_KEY = 'ruta_active_auth_uid'
const LOGOUT_PENDING_KEY = 'ruta_logout_pendiente'
const OFFLINE_ALGORITHM = 'PBKDF2-SHA-256'
const PBKDF2_ITERATIONS = 200000

// ============================================
// UTILIDADES
// ============================================

function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase()
}

function esErrorDeRed(error) {
  const mensaje = String(error?.message || error || '').toLowerCase()
  return (
    error instanceof TypeError ||
    mensaje.includes('failed to fetch') ||
    mensaje.includes('network') ||
    mensaje.includes('internet') ||
    mensaje.includes('fetch')
  )
}

// ============================================
// CRIPTOGRAFÍA OFFLINE (PBKDF2 NATIVO)
// ============================================

async function derivarVerificador(password, salt, iteraciones = PBKDF2_ITERATIONS) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: iteraciones, hash: 'SHA-256' },
    key,
    256
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

async function crearCredencialOffline(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const verificador = await derivarVerificador(password, salt, PBKDF2_ITERATIONS)
  return {
    algoritmo: OFFLINE_ALGORITHM,
    iteraciones: PBKDF2_ITERATIONS,
    salt: btoa(String.fromCharCode(...salt)),
    verificador
  }
}

async function validarCredencialOffline(password, credencial) {
  if (!credencial?.salt || !credencial?.verificador) return false
  const salt = Uint8Array.from(atob(credencial.salt), c => c.charCodeAt(0))
  const iteraciones = credencial.iteraciones || PBKDF2_ITERATIONS
  const obtenido = await derivarVerificador(password, salt, iteraciones)
  return obtenido === credencial.verificador
}

// ============================================
// ADAPTADOR DE SESIÓN COMPATIBLE CON LA APP
// ============================================

function construirSesion(usuarioLocal) {
  const usuario = {
    id: usuarioLocal.usuario_id || usuarioLocal.id,
    nombre: usuarioLocal.nombre,
    correo: usuarioLocal.correo,
    rol: usuarioLocal.rol,
    telefono: usuarioLocal.telefono || null,
    activo: usuarioLocal.activo ?? true
  }

  const user = {
    id: usuarioLocal.auth_uid || usuarioLocal.id,
    email: usuarioLocal.correo,
    aud: 'authenticated',
    role: 'authenticated'
  }

  return {
    user,
    usuario,
    profile: usuario, // alias para retrocompatibilidad
    isOffline: true
  }
}

// ============================================
// CONSULTA DE USUARIO EN SUPABASE (TABLA USUARIOS)
// ============================================

export async function obtenerUsuarioRuta(usuarioAuth) {
  if (!usuarioAuth?.email) {
    throw new Error('El usuario autenticado no tiene correo asociado.')
  }

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, correo, rol, telefono, activo')
    .eq('correo', usuarioAuth.email)
    .eq('activo', true)
    .single()

  if (error) throw error
  if (!data) throw new Error('El usuario autenticado no existe en RUTA.')

  return data
}

// ============================================
// SESIÓN LOCAL ACTIVA (OFFLINE)
// ============================================

async function obtenerSesionLocalActiva() {
  const authUid = localStorage.getItem(ACTIVE_AUTH_UID_KEY)
  if (!authUid) return null

  const usuarioLocal = await obtenerUsuarioContexto(authUid)
  if (!usuarioLocal || usuarioLocal.activo !== true) {
    localStorage.removeItem(ACTIVE_AUTH_UID_KEY)
    return null
  }

  return construirSesion(usuarioLocal)
}

// ============================================
// LOGIN OFFLINE
// ============================================

async function loginOffline(email, password) {
  const correo = normalizarCorreo(email)
  const usuarioLocal = await obtenerUsuarioContextoPorCorreo(correo)

  if (!usuarioLocal || usuarioLocal.activo !== true) {
    throw new Error('No hay acceso sin conexión disponible para este usuario.')
  }

  if (usuarioLocal.rol !== 'tecnico') {
    throw new Error('El acceso sin conexión está disponible únicamente para técnicos.')
  }

  if (!usuarioLocal.credencial_offline) {
    throw new Error('Este dispositivo aún no está habilitado para iniciar sesión sin conexión. Inicia sesión una vez con internet.')
  }

  const valida = await validarCredencialOffline(password, usuarioLocal.credencial_offline)
  if (!valida) {
    throw new Error('Correo o contraseña incorrectos.')
  }

  localStorage.setItem(ACTIVE_AUTH_UID_KEY, usuarioLocal.auth_uid)
  localStorage.removeItem(LOGOUT_PENDING_KEY)

  return construirSesion(usuarioLocal)
}

// ============================================
// INICIAR SESIÓN (ONLINE / OFFLINE)
// ============================================

export async function login(email, password) {
  const correo = normalizarCorreo(email)

  // Sin conexión a internet
  if (!navigator.onLine) {
    return loginOffline(correo, password)
  }

  // Con conexión a internet
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password
    })

    if (error) throw error

    const usuario = await obtenerUsuarioRuta(data.user)

    // Guardar contexto local para persistencia offline
    await guardarUsuarioContexto({
      auth_uid: data.user.id,
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      telefono: usuario.telefono,
      activo: usuario.activo
    })

    // Si es técnico, guardar credencial cifrada para permitir login offline futuro
    if (usuario.rol === 'tecnico') {
      const credencialOffline = await crearCredencialOffline(password)
      await guardarCredencialOffline(data.user.id, credencialOffline)
    }

    localStorage.setItem(ACTIVE_AUTH_UID_KEY, data.user.id)
    localStorage.removeItem(LOGOUT_PENDING_KEY)

    return {
      user: data.user,
      usuario,
      profile: usuario,
      isOffline: false
    }
  } catch (error) {
    if (esErrorDeRed(error)) {
      return loginOffline(correo, password)
    }
    throw error
  }
}

// ============================================
// OBTENER SESIÓN ACTIVA (AL REFRESCAR LA APP)
// ============================================

export async function getActiveSession() {
  // Modo offline
  if (!navigator.onLine) {
    return obtenerSesionLocalActiva()
  }

  // Procesar logout pendiente si se cerró sesión mientras estaba offline
  if (localStorage.getItem(LOGOUT_PENDING_KEY) === 'true') {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch (e) {
      console.warn('[RUTA] Cierre de sesión pendiente sincronizado:', e)
    }
    localStorage.removeItem(LOGOUT_PENDING_KEY)
    localStorage.removeItem(ACTIVE_AUTH_UID_KEY)
    return null
  }

  // Modo online: consultar sesión en Supabase
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    const session = data?.session
    if (!session?.user) {
      localStorage.removeItem(ACTIVE_AUTH_UID_KEY)
      return null
    }

    let usuario
    try {
      usuario = await obtenerUsuarioRuta(session.user)
    } catch (err) {
      if (esErrorDeRed(err)) return obtenerSesionLocalActiva()
      throw err
    }

    // Mantener actualizado el contexto local
    await guardarUsuarioContexto({
      auth_uid: session.user.id,
      usuario_id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      telefono: usuario.telefono,
      activo: usuario.activo
    })

    localStorage.setItem(ACTIVE_AUTH_UID_KEY, session.user.id)

    return {
      user: session.user,
      usuario,
      profile: usuario,
      isOffline: false
    }
  } catch (error) {
    if (esErrorDeRed(error)) {
      return obtenerSesionLocalActiva()
    }
    throw error
  }
}

// ============================================
// CERRAR SESIÓN
// ============================================

export async function logout() {
  localStorage.removeItem(ACTIVE_AUTH_UID_KEY)

  if (!navigator.onLine) {
    localStorage.setItem(LOGOUT_PENDING_KEY, 'true')
    return
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      if (esErrorDeRed(error)) {
        localStorage.setItem(LOGOUT_PENDING_KEY, 'true')
        return
      }
      throw error
    }
    localStorage.removeItem(LOGOUT_PENDING_KEY)
  } catch (error) {
    if (esErrorDeRed(error)) {
      localStorage.setItem(LOGOUT_PENDING_KEY, 'true')
      return
    }
    throw error
  }
}
