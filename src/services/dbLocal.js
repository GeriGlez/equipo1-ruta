// base de datos local con indexeddb para trabajar sin internet
const DB_NAME = 'ruta_local_db'
const DB_VERSION = 1
const STORE_USERS = 'usuarios_cache'

// abre la conexion a indexeddb
function abrirBD() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE_USERS)) {
        // creamos el almacen de usuarios usando el email como llave
        db.createObjectStore(STORE_USERS, { keyPath: 'email' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// guarda los datos del usuario en indexeddb al iniciar sesion con exito
export async function guardarUsuarioLocal(userData) {
  try {
    const db = await abrirBD()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readwrite')
      const store = tx.objectStore(STORE_USERS)
      
      const registro = {
        email: userData.email.toLowerCase(),
        password: userData.password,
        profile: userData.profile,
        user: userData.user,
        guardado_el: new Date().toISOString()
      }

      const req = store.put(registro)
      req.onsuccess = () => resolve(true)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('error al guardar usuario local:', err)
    return false
  }
}

// busca el usuario guardado para validar credenciales sin internet
export async function obtenerUsuarioLocal(email) {
  try {
    const db = await abrirBD()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly')
      const store = tx.objectStore(STORE_USERS)
      const req = store.get(email.toLowerCase())

      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('error al consultar usuario local:', err)
    return null
  }
}

// obtiene el ultimo usuario guardado para restaurar sesion offline
export async function obtenerUltimaSesionLocal() {
  try {
    const db = await abrirBD()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_USERS, 'readonly')
      const store = tx.objectStore(STORE_USERS)
      const req = store.openCursor(null, 'prev')

      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          resolve(cursor.value)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('error al obtener ultima sesion local:', err)
    return null
  }
}
