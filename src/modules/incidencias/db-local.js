// db-local.js

// 1. Inicializa y configura la base de datos local
export const iniciarBDOFFline = () => {
  return new Promise((resolve, reject) => {
    // Abrimos la base de datos (usamos versión 2 para asegurar la actualización)
    const request = indexedDB.open('RutaOfflineDB', 2);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Creamos el almacén específico para las incidencias atrapadas sin red
      if (!db.objectStoreNames.contains('incidencias_pendientes')) {
        db.createObjectStore('incidencias_pendientes', { 
          keyPath: 'id_local', 
          autoIncrement: true 
        });
        console.log('Almacén de incidencias offline creado.');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// 2. Guarda la incidencia en el dispositivo
export const guardarIncidenciaOffline = async (incidencia) => {
  try {
    const db = await iniciarBDOFFline();
    const transaction = db.transaction('incidencias_pendientes', 'readwrite');
    const store = transaction.objectStore('incidencias_pendientes');
    
    // Le inyectamos la fecha en que se intentó capturar
    const incidenciaLocal = {
      ...incidencia,
      estado: 'reportada',
      fecha_captura_offline: new Date().toISOString()
    };
    
    store.add(incidenciaLocal);
    
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        console.log('Guardado local exitoso. Listo para sincronizar cuando haya red.');
        resolve(true);
      };
      transaction.onerror = () => {
        console.error('Error al guardar en IndexedDB');
        reject(false);
      };
    });
  } catch (error) {
    console.error('Fallo general en almacenamiento local:', error);
    return false;
  }
};