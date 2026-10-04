// ==============================================
// RUTA - MÓDULO 5
// Base de datos local para visitas
// ==============================================

const DB_NAME = "RUTA_Local";
const DB_VERSION = 1;

// Abrir o crear base de datos local
export function abrirBD() {

  return new Promise((resolve, reject) => {

    const request = indexedDB.open(
      DB_NAME,
      DB_VERSION
    );

    // Crear estructura si no existe
    request.onupgradeneeded = () => {

      const db = request.result;

      if (!db.objectStoreNames.contains("visitas")) {

        const store = db.createObjectStore(
          "visitas",
          {
            keyPath: "id"
          }
        );

        // Índice para encontrar visitas pendientes
        store.createIndex(
            "estado_envio",
            "estado_envio",
            { unique: false }
        );

      }

    };

    // Apertura exitosa
    request.onsuccess = () => {
      resolve(request.result);
    };

    // Error al abrir la base
    request.onerror = () => {
      reject(request.error);
    };

    request.onblocked = () => {
      reject(new Error(
        "La base de datos está bloqueada por otra conexión."
      ));
    };

  });

}


// ==============================================
// GUARDAR VISITA EN INDEXEDDB
// ==============================================

export async function guardarVisita(datosVisita) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "visitas",
      "readwrite"
    );

    const store = transaction.objectStore("visitas");

    const visita = {
      ...datosVisita,

      id: crypto.randomUUID(),

      estado_envio: "pendiente",

      pendiente_envio: true,

      creado_localmente_en: new Date().toISOString()
    };

    store.add(visita);

    transaction.oncomplete = () => {
      db.close();
      resolve(visita);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(
        transaction.error ||
        new Error("No se pudo guardar la visita")
      );
    };

  });

}


// ==============================================
// OBTENER VISITAS PENDIENTES
// ==============================================

export async function obtenerVisitasPendientes() {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    let transaction;

    try {

      transaction = db.transaction(
        "visitas",
        "readonly"
      );

      const store = transaction.objectStore("visitas");

      const indice = store.index("estado_envio");

      // Buscar únicamente registros pendientes
      const request = indice.getAll("pendiente");

      let visitas = [];

      request.onsuccess = () => {
        visitas = request.result;
      };

      // Confirmar que la transacción terminó
      transaction.oncomplete = () => {
        db.close();
        resolve(visitas);
      };

      transaction.onabort = () => {
        db.close();

        reject(
          transaction.error ||
          new Error("Error al consultar visitas pendientes")
        );
      };

    } catch (error) {
      db.close();
      reject(error);
    }

  });

}