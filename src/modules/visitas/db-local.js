// ==============================================
// RUTA - MÓDULO 5
// Base de datos local 
// ==============================================

const DB_NAME = "RUTA_Local";
const DB_VERSION = 7;

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

        store.createIndex(
          "estado_envio",
          "estado_envio",
          { unique: false }
        );

      }

      if (!db.objectStoreNames.contains("ordenes_contexto")) {

        db.createObjectStore(
          "ordenes_contexto",
          {
            keyPath: "orden_id"
          }
        );

      }

      let storeUsuario;


      if (
        !db.objectStoreNames.contains(
          "usuario_contexto"
        )
      ) {

        storeUsuario =
          db.createObjectStore(
            "usuario_contexto",
            {
              keyPath: "auth_uid" 
            }
          );

      } else {

        storeUsuario =
          request.transaction.objectStore(
            "usuario_contexto"
          );

      }


      if (
        !storeUsuario.indexNames.contains(
          "correo_normalizado"
        )
      ) {

        storeUsuario.createIndex(
          "correo_normalizado",
          "correo_normalizado",
          {
            unique: false
          }
        );

      }

      if (!db.objectStoreNames.contains("ordenes_admin")) {

        const storeOrdenesAdmin = db.createObjectStore(
          "ordenes_admin",
          {
            keyPath: "clave_local"
          }
        );

        storeOrdenesAdmin.createIndex(
          "fecha_programada",
          "fecha_programada",
          { unique: false }
        );

        storeOrdenesAdmin.createIndex(
          "clave_programacion",
          "clave_programacion",
          { unique: false }
        );

      }

      if (!db.objectStoreNames.contains("ordenes_cola_sync")) {

        const storeColaOrdenes = db.createObjectStore(
          "ordenes_cola_sync",
          {
            keyPath: "op_id"
          }
        );

        storeColaOrdenes.createIndex(
          "clave_local",
          "clave_local",
          { unique: false }
        );

        storeColaOrdenes.createIndex(
          "estado_sync",
          "estado_sync",
          { unique: false }
        );

      }

      if (!db.objectStoreNames.contains("ordenes_catalogos")) {

        db.createObjectStore(
          "ordenes_catalogos",
          {
            keyPath: "catalogo"
          }
        );

      }

    }; // cierra request.onupgradeneeded

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

// ==============================================
// OBTENER TODAS LAS VISITAS LOCALES
// ==============================================

export async function obtenerVisitasLocales() {

  const db =
    await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          'visitas',
          'readonly'
        );

      const store =
        transaction.objectStore(
          'visitas'
        );

      const request =
        store.getAll();

      let visitas = [];


      request.onsuccess = () => {

        visitas =
          request.result || [];

      };


      transaction.oncomplete = () => {

        db.close();

        resolve(visitas);

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            'No fue posible consultar las visitas locales.'
          )
        );

      };

    }
  );

}

// ==============================================
// GUARDAR VISITAS RECIBIDAS DESDE SUPABASE
// ==============================================

export async function guardarVisitasServidor(
  visitasServidor
) {

  const db =
    await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          'visitas',
          'readwrite'
        );

      const store =
        transaction.objectStore(
          'visitas'
        );

      const ahora =
        new Date().toISOString();


      function extraerHoraLocal(
        fechaIso
      ) {

        if (!fechaIso) {
          return null;
        }


        const fecha =
          new Date(fechaIso);


        if (
          Number.isNaN(
            fecha.getTime()
          )
        ) {
          return null;
        }


        const horas =
          String(
            fecha.getHours()
          ).padStart(2, '0');

        const minutos =
          String(
            fecha.getMinutes()
          ).padStart(2, '0');


        return `${horas}:${minutos}`;

      }


      for (
        const visitaServidor
        of visitasServidor
      ) {

        const idLocal =
          visitaServidor.id_local ||
          `servidor:${visitaServidor.id}`;


        const request =
          store.get(idLocal);


        request.onsuccess = () => {

          const visitaLocal =
            request.result;


          // Una modificación local pendiente
          // tiene prioridad sobre la copia
          // que todavía existe en Supabase.
          if (
            visitaLocal &&
            (
              visitaLocal.estado_envio ===
                'pendiente' ||
              visitaLocal.pendiente_envio ===
                true
            )
          ) {

            return;

          }


          const visitaActualizada = {

            ...(visitaLocal || {}),

            id:
              idLocal,

            orden_id:
              visitaServidor.orden_id,

            tecnico_id:
              visitaServidor.tecnico_id,

            hora_entrada:
              extraerHoraLocal(
                visitaServidor.hora_entrada
              ),

            hora_salida:
              extraerHoraLocal(
                visitaServidor.hora_salida
              ),

            ph:
              visitaServidor.ph === null
                ? null
                : Number(
                    visitaServidor.ph
                  ),

            cloro:
              visitaServidor.cloro === null
                ? null
                : Number(
                    visitaServidor.cloro
                  ),

            observaciones:
              visitaServidor.observaciones ||
              '',

            quien_recibio:
              visitaServidor.quien_recibio ||
              '',

            orden_referencia:
              `Orden #${visitaServidor.orden_id}`,

            estado_envio:
              'enviado',

            pendiente_envio:
              false,

            operacion_pendiente:
              null,

            visita_servidor_id:
              visitaServidor.id,

            id_local_servidor:
              visitaServidor.id_local ||
              null,

            fecha_visita_en:
              visitaServidor.hora_entrada ||
              visitaServidor.created_at ||
              null,

            creado_servidor_en:
              visitaServidor.created_at ||
              null,

            creado_localmente_en:
              visitaLocal?.creado_localmente_en ||
              visitaServidor.created_at ||
              ahora,

            sincronizado_en:
              ahora

          };


          store.put(
            visitaActualizada
          );

        };


        request.onerror = () => {

          transaction.abort();

        };

      }


      transaction.oncomplete = () => {

        db.close();

        resolve();

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            'No fue posible actualizar la bitácora local.'
          )
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            'No fue posible guardar las visitas del servidor.'
          )
        );

      };

    }
  );

}

// ==============================================
// OBTENER VISITA LOCAL POR ORDEN Y TÉCNICO
// ==============================================

export async function obtenerVisitaPorOrden(
  ordenId,
  tecnicoId
) {

  const db =
    await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          'visitas',
          'readonly'
        );

      const store =
        transaction.objectStore(
          'visitas'
        );

      const request =
        store.getAll();

      let visitaEncontrada =
        null;


      request.onsuccess = () => {

        const visitas =
          request.result || [];


        visitaEncontrada =
          visitas.find(
            visita =>
              Number(
                visita.orden_id
              ) ===
                Number(
                  ordenId
                ) &&
              String(
                visita.tecnico_id
              ) ===
                String(
                  tecnicoId
                )
          ) || null;

      };


      transaction.oncomplete = () => {

        db.close();

        resolve(
          visitaEncontrada
        );

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            'No fue posible consultar la visita local.'
          )
        );

      };

    }
  );

}

// ==============================================
// ACTUALIZAR VISITA LOCAL EXISTENTE
// ==============================================

export async function actualizarVisitaLocal(
  visitaId,
  cambios
) {

  const db =
    await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          'visitas',
          'readwrite'
        );

      const store =
        transaction.objectStore(
          'visitas'
        );

      const request =
        store.get(
          visitaId
        );

      let visitaActualizada =
        null;

      let errorPropio =
        null;


      request.onsuccess = () => {

        const visita =
          request.result;


        if (!visita) {

          errorPropio =
            new Error(
              'No se encontró la visita local.'
            );

          transaction.abort();

          return;

        }


        const yaSincronizada =
          Boolean(
            visita.visita_servidor_id
          ) ||
          visita.estado_envio ===
            'enviado' ||
          visita.pendiente_envio ===
            false;


        visitaActualizada = {

          ...visita,

          ...cambios,

          // Nunca cambiar el identificador local.
          id:
            visita.id,

          // Conservamos la fecha original
          // de creación.
          creado_localmente_en:
            visita.creado_localmente_en,

          // Toda modificación necesita
          // volver a sincronizarse.
          estado_envio:
            'pendiente',

          pendiente_envio:
            true,

          operacion_pendiente:
            yaSincronizada
              ? 'actualizar'
              : 'insertar',

          actualizado_localmente_en:
            new Date().toISOString()

        };


        store.put(
          visitaActualizada
        );

      };


      request.onerror = () => {

        errorPropio =
          request.error ||
          new Error(
            'No fue posible consultar la visita.'
          );

        transaction.abort();

      };


      transaction.oncomplete = () => {

        db.close();

        resolve(
          visitaActualizada
        );

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            'No fue posible actualizar la visita.'
          )
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          errorPropio ||
          transaction.error ||
          new Error(
            'No fue posible actualizar la visita.'
          )
        );

      };

    }
  );

}




// ==============================================
// MARCAR VISITA COMO ENVIADA
// ==============================================

export async function marcarVisitaComoEnviada(
  visitaId,
  visitaServidorId = null
) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "visitas",
      "readwrite"
    );

    const store =
      transaction.objectStore("visitas");

    const request =
      store.get(visitaId);

    let visitaActualizada = null;
    let errorPropio = null;

    request.onsuccess = () => {

      const visita = request.result;

      if (!visita) {

        errorPropio = new Error(
          "No se encontró la visita local."
        );

        transaction.abort();
        return;
      }

      visitaActualizada = {
        ...visita,

        estado_envio: "enviado",

        pendiente_envio: false,

        operacion_pendiente: null,

        sincronizado_en:
          new Date().toISOString(),

        visita_servidor_id:
          visitaServidorId
      };

      store.put(visitaActualizada);
    };

    request.onerror = () => {

      errorPropio =
        request.error ||
        new Error(
          "No se pudo consultar la visita local."
        );

      transaction.abort();
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(visitaActualizada);
    };

    transaction.onerror = () => {
      db.close();

      reject(
        transaction.error ||
        new Error(
          "No se pudo actualizar la visita local."
        )
      );
    };

    transaction.onabort = () => {
      db.close();

      reject(
        errorPropio ||
        transaction.error ||
        new Error(
          "No se pudo marcar la visita como enviada."
        )
      );
    };

  });

}

// ==============================================
// GUARDAR CONTEXTO DE ORDEN
// ==============================================

export async function guardarContextoOrden(contextoOrden) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "ordenes_contexto",
      "readwrite"
    );

    const store = transaction.objectStore(
      "ordenes_contexto"
    );

    const contexto = {
      ...contextoOrden,

      orden_id: Number(contextoOrden.orden_id),

      actualizado_localmente_en:
        new Date().toISOString()
    };

    store.put(contexto);

    transaction.oncomplete = () => {
      db.close();
      resolve(contexto);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ||
        new Error(
          "No se pudo guardar el contexto de la orden"
        )
      );
    };

  });

}


// ==============================================
// OBTENER CONTEXTO DE ORDEN
// ==============================================

export async function obtenerContextoOrden(ordenId) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "ordenes_contexto",
      "readonly"
    );

    const store = transaction.objectStore(
      "ordenes_contexto"
    );

    const request = store.get(
      Number(ordenId)
    );

    let contexto = null;

    request.onsuccess = () => {
      contexto = request.result || null;
    };

    transaction.oncomplete = () => {
      db.close();
      resolve(contexto);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();

      reject(
        transaction.error ||
        new Error(
          "No se pudo consultar el contexto de la orden"
        )
      );
    };

  });

}

// ==============================================
// REEMPLAZAR ÓRDENES LOCALES DEL TÉCNICO
// ==============================================

export async function reemplazarOrdenesContextoTecnico(
  tecnicoId,
  fechaProgramada,
  ordenes
) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "ordenes_contexto",
      "readwrite"
    );

    const store = transaction.objectStore(
      "ordenes_contexto"
    );

    const request = store.openCursor();

    const contextos = ordenes.map(
      orden => ({
        ...orden,

        orden_id:
          Number(orden.orden_id),

        tecnico_id:
          tecnicoId,

        actualizado_localmente_en:
          new Date().toISOString()
      })
    );


    request.onsuccess = () => {

      const cursor = request.result;

      if (cursor) {

        const contexto = cursor.value;

        if (
          contexto.tecnico_id === tecnicoId &&
          contexto.fecha_programada === fechaProgramada
        ) {
          cursor.delete();
        }

        cursor.continue();
        return;
      }


      for (const contexto of contextos) {
        store.put(contexto);
      }

    };


    transaction.oncomplete = () => {

      db.close();

      resolve(contextos);

    };


    transaction.onerror = () => {

      db.close();

      reject(transaction.error);

    };


    transaction.onabort = () => {

      db.close();

      reject(
        transaction.error ||
        new Error(
          "No se pudieron actualizar las órdenes locales."
        )
      );

    };

  });

}

// ==============================================
// OBTENER ÓRDENES LOCALES DEL TÉCNICO
// ==============================================

export async function obtenerOrdenesContextoTecnico(
  tecnicoId,
  fechaProgramada
) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction(
      "ordenes_contexto",
      "readonly"
    );

    const store = transaction.objectStore(
      "ordenes_contexto"
    );

    const request = store.getAll();

    let ordenes = [];


    request.onsuccess = () => {

      ordenes =
        request.result.filter(
          orden =>
            orden.tecnico_id === tecnicoId &&
            orden.fecha_programada === fechaProgramada
        );

    };


    transaction.oncomplete = () => {

      db.close();

      resolve(ordenes);

    };


    transaction.onerror = () => {

      db.close();

      reject(transaction.error);

    };

  });

}

function normalizarCorreo(
  correo
) {

  return String(
    correo || ''
  )
    .trim()
    .toLowerCase();

}

// ==============================================
// GUARDAR CONTEXTO DEL USUARIO
// ==============================================

export async function guardarUsuarioContexto(
  contexto
) {

  const db =
    await abrirBD();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          "usuario_contexto",
          "readwrite"
        );

      const store =
        transaction.objectStore(
          "usuario_contexto"
        );


      const request =
        store.get(
          contexto.auth_uid
        );


      let contextoGuardado =
        null;


      request.onsuccess = () => {

        const anterior =
          request.result || {};


        contextoGuardado = {

          ...anterior,

          ...contexto,

          auth_uid:
            contexto.auth_uid,

          correo_normalizado:
            normalizarCorreo(
              contexto.correo ||
              anterior.correo
            ),

          actualizado_en:
            new Date().toISOString()

        };


        store.put(
          contextoGuardado
        );

      };


      request.onerror = () => {

        transaction.abort();

      };


      transaction.oncomplete = () => {

        db.close();

        resolve(
          contextoGuardado
        );

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            "No se pudo guardar el contexto del usuario."
          )
        );

      };

    }
  );

}

// ==============================================
// OBTENER CONTEXTO DEL USUARIO
// ==============================================

export async function obtenerUsuarioContexto(
  authUid
) {

  const db = await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          "usuario_contexto",
          "readonly"
        );

      const store =
        transaction.objectStore(
          "usuario_contexto"
        );

      const request =
        store.get(authUid);


      request.onsuccess = () => {

        db.close();

        resolve(
          request.result || null
        );

      };


      request.onerror = () => {

        db.close();

        reject(
          request.error
        );

      };

    }
  );

}

export async function
obtenerUsuarioContextoPorCorreo(
  correo
) {

  const db =
    await abrirBD();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          "usuario_contexto",
          "readonly"
        );

      const store =
        transaction.objectStore(
          "usuario_contexto"
        );

      const indice =
        store.index(
          "correo_normalizado"
        );


      const correoNormalizado =
        normalizarCorreo(
          correo
        );


      const request =
        indice.get(
          correoNormalizado
        );


      request.onsuccess = () => {

        db.close();

        resolve(
          request.result || null
        );

      };


      request.onerror = () => {

        db.close();

        reject(
          request.error
        );

      };

    }
  );

}

export async function guardarCredencialOffline(
  authUid,
  credencial
) {

  const db =
    await abrirBD();


  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          "usuario_contexto",
          "readwrite"
        );

      const store =
        transaction.objectStore(
          "usuario_contexto"
        );

      const request =
        store.get(
          authUid
        );


      request.onsuccess = () => {

        const usuario =
          request.result;


        if (!usuario) {

          transaction.abort();

          return;

        }


        store.put({

          ...usuario,

          credencial_offline: {
            ...credencial,

            actualizado_en:
              new Date().toISOString()
          },

          actualizado_en:
            new Date().toISOString()

        });

      };


      request.onerror = () => {

        transaction.abort();

      };


      transaction.oncomplete = () => {

        db.close();

        resolve();

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error
        );

      };


      transaction.onabort = () => {

        db.close();

        reject(
          transaction.error ||
          new Error(
            "No se pudo guardar la credencial offline."
          )
        );

      };

    }
  );

}

// ==============================================
// ELIMINAR CONTEXTO DEL USUARIO
// ==============================================

export async function eliminarUsuarioContexto(
  authUid
) {

  const db = await abrirBD();

  return new Promise(
    (resolve, reject) => {

      const transaction =
        db.transaction(
          "usuario_contexto",
          "readwrite"
        );

      const store =
        transaction.objectStore(
          "usuario_contexto"
        );

      store.delete(authUid);


      transaction.oncomplete = () => {

        db.close();

        resolve();

      };


      transaction.onerror = () => {

        db.close();

        reject(
          transaction.error
        );

      };

    }
  );

}