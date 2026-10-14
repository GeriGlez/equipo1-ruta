import {
  supabase
} from '../../services/supabase.js'

import {
  guardarUsuarioContexto,
  obtenerUsuarioContexto,
  obtenerUsuarioContextoPorCorreo,
  guardarCredencialOffline
} from '../visitas/db-local.js'


// ============================================
// CONFIGURACIÓN LOCAL
// ============================================

const ACTIVE_AUTH_UID_KEY =
  'ruta_active_auth_uid'

const LOGOUT_PENDING_KEY =
  'ruta_logout_pendiente'

const OFFLINE_ALGORITHM =
  'PBKDF2-SHA-256'

const PBKDF2_ITERATIONS =
  200000


// ============================================
// UTILIDADES
// ============================================

function normalizarCorreo(
  correo
) {

  return String(
    correo || ''
  )
    .trim()
    .toLowerCase()

}


function bytesABase64(
  bytes
) {

  let texto = ''


  for (
    const byte
    of bytes
  ) {

    texto +=
      String.fromCharCode(
        byte
      )

  }


  return btoa(
    texto
  )

}


function base64ABytes(
  valor
) {

  const texto =
    atob(
      valor
    )


  return Uint8Array.from(
    texto,
    caracter =>
      caracter.charCodeAt(0)
  )

}


function compararBytes(
  a,
  b
) {

  if (
    a.length !==
    b.length
  ) {

    return false

  }


  let diferencia = 0


  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    diferencia |=
      a[i] ^ b[i]

  }


  return diferencia === 0

}


function esErrorDeRed(
  error
) {

  const mensaje =
    String(
      error?.message ||
      error ||
      ''
    ).toLowerCase()


  return (
    error instanceof TypeError ||
    mensaje.includes(
      'failed to fetch'
    ) ||
    mensaje.includes(
      'network'
    ) ||
    mensaje.includes(
      'internet'
    ) ||
    mensaje.includes(
      'fetch'
    )
  )

}


// ============================================
// DERIVAR VERIFICADOR DE CONTRASEÑA
// ============================================

async function derivarVerificador(
  password,
  salt,
  iteraciones
) {

  const encoder =
    new TextEncoder()


  const material =
    await crypto.subtle.importKey(
      'raw',
      encoder.encode(
        password
      ),
      {
        name: 'PBKDF2'
      },
      false,
      [
        'deriveBits'
      ]
    )


  const bits =
    await crypto.subtle.deriveBits(
      {
        name:
          'PBKDF2',

        salt,

        iterations:
          iteraciones,

        hash:
          'SHA-256'
      },
      material,
      256
    )


  return new Uint8Array(
    bits
  )

}


// ============================================
// CREAR CREDENCIAL OFFLINE
// ============================================

async function crearCredencialOffline(
  password
) {

  const salt =
    crypto.getRandomValues(
      new Uint8Array(16)
    )


  const verificador =
    await derivarVerificador(
      password,
      salt,
      PBKDF2_ITERATIONS
    )


  return {

    algoritmo:
      OFFLINE_ALGORITHM,

    iteraciones:
      PBKDF2_ITERATIONS,

    salt:
      bytesABase64(
        salt
      ),

    verificador:
      bytesABase64(
        verificador
      )

  }

}


// ============================================
// VALIDAR CREDENCIAL OFFLINE
// ============================================

async function validarCredencialOffline(
  password,
  credencial
) {

  if (
    !credencial ||
    credencial.algoritmo !==
      OFFLINE_ALGORITHM ||
    !credencial.salt ||
    !credencial.verificador ||
    !credencial.iteraciones
  ) {

    return false

  }


  const salt =
    base64ABytes(
      credencial.salt
    )


  const esperado =
    base64ABytes(
      credencial.verificador
    )


  const obtenido =
    await derivarVerificador(
      password,
      salt,
      credencial.iteraciones
    )


  return compararBytes(
    esperado,
    obtenido
  )

}


// ============================================
// RECONSTRUIR USUARIO LOCAL
// ============================================

function construirUsuarioLocal(
  usuarioLocal
) {

  return {

    id:
      usuarioLocal.usuario_id,

    nombre:
      usuarioLocal.nombre,

    correo:
      usuarioLocal.correo,

    rol:
      usuarioLocal.rol,

    telefono:
      usuarioLocal.telefono ||
      null,

    activo:
      usuarioLocal.activo

  }

}


function construirUsuarioAuthLocal(
  usuarioLocal
) {

  return {

    id:
      usuarioLocal.auth_uid,

    email:
      usuarioLocal.correo,

    aud:
      'authenticated',

    role:
      'authenticated'

  }

}


// ============================================
// OBTENER SESIÓN LOCAL ACTIVA
// ============================================

async function obtenerSesionLocalActiva() {

  const authUid =
    localStorage.getItem(
      ACTIVE_AUTH_UID_KEY
    )


  if (!authUid) {

    return null

  }


  const usuarioLocal =
    await obtenerUsuarioContexto(
      authUid
    )


  if (
    !usuarioLocal ||
    usuarioLocal.activo !== true
  ) {

    localStorage.removeItem(
      ACTIVE_AUTH_UID_KEY
    )

    return null

  }


  return {

    user:
      construirUsuarioAuthLocal(
        usuarioLocal
      ),

    usuario:
      construirUsuarioLocal(
        usuarioLocal
      )

  }

}


// ============================================
// LOGIN OFFLINE
// ============================================

async function loginOffline(
  email,
  password
) {

  const correo =
    normalizarCorreo(
      email
    )


  const usuarioLocal =
    await obtenerUsuarioContextoPorCorreo(
      correo
    )


  if (
    !usuarioLocal ||
    usuarioLocal.activo !== true
  ) {

    throw new Error(
      'No hay acceso offline disponible para este usuario.'
    )

  }


  // La experiencia offline del proyecto
  // está destinada al técnico.
  if (
    usuarioLocal.rol !==
      'tecnico'
  ) {

    throw new Error(
      'El acceso sin conexión está disponible únicamente para técnicos.'
    )

  }


  if (
    !usuarioLocal
      .credencial_offline
  ) {

    throw new Error(
      'Este dispositivo aún no está habilitado para iniciar sesión sin conexión. Inicia sesión una vez con internet.'
    )

  }


  const credencialValida =
    await validarCredencialOffline(
      password,
      usuarioLocal
        .credencial_offline
    )


  if (!credencialValida) {

    throw new Error(
      'Correo o contraseña incorrectos.'
    )

  }


  localStorage.setItem(
    ACTIVE_AUTH_UID_KEY,
    usuarioLocal.auth_uid
  )


  localStorage.removeItem(
    LOGOUT_PENDING_KEY
  )


  return {

    user:
      construirUsuarioAuthLocal(
        usuarioLocal
      ),

    usuario:
      construirUsuarioLocal(
        usuarioLocal
      )

  }

}


// ============================================
// INICIAR SESIÓN
// ============================================

export async function login(
  email,
  password
) {

  const correo =
    normalizarCorreo(
      email
    )


  // ==========================================
  // SIN CONEXIÓN
  // ==========================================

  if (!navigator.onLine) {

    return loginOffline(
      correo,
      password
    )

  }


  // ==========================================
  // CON CONEXIÓN
  // ==========================================

  let data


  try {

    const resultado =
      await supabase.auth
        .signInWithPassword({
          email:
            correo,

          password
        })


    if (
      resultado.error
    ) {

      throw resultado.error

    }


    data =
      resultado.data

  } catch (error) {

    // Puede existir Wi-Fi pero no haber
    // acceso real al servidor.
    if (
      esErrorDeRed(
        error
      )
    ) {

      return loginOffline(
        correo,
        password
      )

    }


    throw error

  }


  const usuario =
    await obtenerUsuarioRuta(
      data.user
    )


  // Primero guardamos o actualizamos
  // el contexto normal del usuario.
  await guardarUsuarioContexto({

    auth_uid:
      data.user.id,

    usuario_id:
      usuario.id,

    nombre:
      usuario.nombre,

    correo:
      usuario.correo,

    rol:
      usuario.rol,

    telefono:
      usuario.telefono,

    activo:
      usuario.activo

  })


  // Sólo habilitamos autenticación offline
  // para el técnico.
  if (
    usuario.rol ===
      'tecnico'
  ) {

    const credencialOffline =
      await crearCredencialOffline(
        password
      )


    await guardarCredencialOffline(
      data.user.id,
      credencialOffline
    )

  }


  localStorage.setItem(
    ACTIVE_AUTH_UID_KEY,
    data.user.id
  )


  localStorage.removeItem(
    LOGOUT_PENDING_KEY
  )


  return {

    user:
      data.user,

    usuario

  }

}


// ============================================
// OBTENER USUARIO DE RUTA
// ============================================

export async function obtenerUsuarioRuta(
  usuarioAuth
) {

  if (
    !usuarioAuth?.email
  ) {

    throw new Error(
      'El usuario autenticado no tiene correo asociado.'
    )

  }


  const {
    data,
    error
  } =
    await supabase
      .from(
        'usuarios'
      )
      .select(`
        id,
        nombre,
        correo,
        rol,
        telefono,
        activo
      `)
      .eq(
        'correo',
        usuarioAuth.email
      )
      .eq(
        'activo',
        true
      )
      .single()


  if (error) {

    throw error

  }


  if (!data) {

    throw new Error(
      'El usuario autenticado no existe en RUTA.'
    )

  }


  return data

}


// ============================================
// SESIÓN ACTIVA
// ============================================

export async function getActiveSession() {

  // ==========================================
  // SIN CONEXIÓN
  // ==========================================

  if (!navigator.onLine) {

    return obtenerSesionLocalActiva()

  }


  // ==========================================
  // LOGOUT REALIZADO OFFLINE
  // ==========================================

  if (
    localStorage.getItem(
      LOGOUT_PENDING_KEY
    ) === 'true'
  ) {

    try {

      await supabase.auth.signOut({
        scope:
          'local'
      })

    } catch (error) {

      console.warn(
        '[RUTA] No fue posible completar el cierre de sesión pendiente:',
        error
      )

    }


    localStorage.removeItem(
      LOGOUT_PENDING_KEY
    )

    localStorage.removeItem(
      ACTIVE_AUTH_UID_KEY
    )


    return null

  }


  // ==========================================
  // CON CONEXIÓN
  // ==========================================

  let session


  try {

    const {
      data,
      error
    } =
      await supabase.auth
        .getSession()


    if (error) {

      throw error

    }


    session =
      data.session

  } catch (error) {

    // Si el navegador cree que hay conexión
    // pero Supabase no responde, usamos
    // la sesión local.
    if (
      esErrorDeRed(
        error
      )
    ) {

      return obtenerSesionLocalActiva()

    }


    throw error

  }


  if (
    !session?.user
  ) {

    localStorage.removeItem(
      ACTIVE_AUTH_UID_KEY
    )

    return null

  }


  let usuario


  try {

    usuario =
      await obtenerUsuarioRuta(
        session.user
      )

  } catch (error) {

    if (
      esErrorDeRed(
        error
      )
    ) {

      return obtenerSesionLocalActiva()

    }


    throw error

  }


  // Mantener actualizado el contexto
  // sin destruir credencial_offline.
  await guardarUsuarioContexto({

    auth_uid:
      session.user.id,

    usuario_id:
      usuario.id,

    nombre:
      usuario.nombre,

    correo:
      usuario.correo,

    rol:
      usuario.rol,

    telefono:
      usuario.telefono,

    activo:
      usuario.activo

  })


  localStorage.setItem(
    ACTIVE_AUTH_UID_KEY,
    session.user.id
  )


  return {

    user:
      session.user,

    usuario

  }

}


// ============================================
// CERRAR SESIÓN
// ============================================

export async function logout() {

  // Cerramos inmediatamente nuestra
  // sesión local.
  localStorage.removeItem(
    ACTIVE_AUTH_UID_KEY
  )


  // ==========================================
  // SIN CONEXIÓN
  // ==========================================

  if (!navigator.onLine) {

    localStorage.setItem(
      LOGOUT_PENDING_KEY,
      'true'
    )

    return

  }


  // ==========================================
  // CON CONEXIÓN
  // ==========================================

  const {
    error
  } =
    await supabase.auth.signOut({
      scope:
        'local'
    })


  if (error) {

    if (
      esErrorDeRed(
        error
      )
    ) {

      localStorage.setItem(
        LOGOUT_PENDING_KEY,
        'true'
      )

      return

    }


    throw error

  }


  localStorage.removeItem(
    LOGOUT_PENDING_KEY
  )

}