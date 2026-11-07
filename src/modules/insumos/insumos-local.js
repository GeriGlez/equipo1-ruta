// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Almacenamiento local de insumos (IndexedDB)
// ==============================================

import { abrirBD } from '../visitas/db-local.js';


// Ejecuta una operación sobre un store y espera
// a que la transacción termine realmente.
function ejecutar(nombreStore, modo, operacion) {

  return abrirBD().then(db => new Promise((resolve, reject) => {

    let transaction;
    let peticion;

    try {

      transaction = db.transaction(nombreStore, modo);
      peticion = operacion(transaction.objectStore(nombreStore));

    } catch (error) {

      db.close();
      reject(error);
      return;

    }

    transaction.oncomplete = () => {
      db.close();
      resolve(peticion?.result ?? null);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(
        transaction.error ||
        new Error('No fue posible completar la operación local.')
      );
    };

  }));

}


// ==============================================
// CATÁLOGO
// ==============================================

// Reemplaza la copia local por la lista del servidor.
export function guardarCatalogoLocal(insumos) {

  return ejecutar('insumos_catalogo', 'readwrite', store => {

    store.clear();
    insumos.forEach(insumo => store.put(insumo));

  });

}


export async function obtenerCatalogoLocal() {

  const todos = await ejecutar(
    'insumos_catalogo',
    'readonly',
    store => store.getAll()
  );

  return (todos || [])
    .filter(insumo => insumo.activo !== false)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

}


// ==============================================
// CONSUMOS POR VISITA
// ==============================================

// Líneas vigentes de una visita (sin las marcadas
// para eliminarse en la próxima sincronización).
export async function obtenerConsumosVisita(visitaLocalId) {

  const registros = await ejecutar(
    'consumos_insumo',
    'readonly',
    store => store.index('visita_local_id').getAll(visitaLocalId)
  );

  return (registros || [])
    .filter(r => r.operacion_pendiente !== 'eliminar')
    .sort((a, b) =>
      String(a.creado_localmente_en)
        .localeCompare(String(b.creado_localmente_en))
    );

}


export async function obtenerConsumosPendientes() {

  const registros = await ejecutar(
    'consumos_insumo',
    'readonly',
    store => store.index('estado_envio').getAll('pendiente')
  );

  return registros || [];

}


// Guarda el estado completo del formulario de una visita.
//
// lineas: [{ id|null, insumo_id, insumo_nombre,
//            unidad, cantidad }]
//
// - Línea nueva         -> se inserta (operación "insertar")
// - Línea existente     -> se actualiza si cambió
// - Línea que ya no está-> se elimina (localmente si nunca
//                          llegó al servidor; si ya llegó,
//                          queda marcada para borrarse allá)
export async function guardarConsumosVisita(
  visita,
  lineas
) {

  const db = await abrirBD();

  return new Promise((resolve, reject) => {

    const transaction = db.transaction('consumos_insumo', 'readwrite');
    const store = transaction.objectStore('consumos_insumo');

    const lectura = store
      .index('visita_local_id')
      .getAll(visita.id);

    lectura.onsuccess = () => {

      const ahora = new Date().toISOString();

      const existentes = (lectura.result || [])
        .filter(r => r.operacion_pendiente !== 'eliminar');

      const idsEnFormulario = new Set(
        lineas.filter(l => l.id).map(l => l.id)
      );

      // Líneas que el técnico quitó
      for (const existente of existentes) {

        if (idsEnFormulario.has(existente.id)) {
          continue;
        }

        if (!existente.sincronizado_en) {

          store.delete(existente.id);

        } else {

          store.put({
            ...existente,
            estado_envio: 'pendiente',
            operacion_pendiente: 'eliminar',
            actualizado_localmente_en: ahora
          });

        }

      }

      // Líneas nuevas o modificadas
      for (const linea of lineas) {

        const previo = existentes.find(r => r.id === linea.id);

        if (!previo) {

          store.put({
            id: crypto.randomUUID(),
            visita_local_id: visita.id,
            orden_id: visita.orden_id,
            tecnico_id: visita.tecnico_id,
            insumo_id: linea.insumo_id,
            insumo_nombre: linea.insumo_nombre,
            unidad: linea.unidad,
            cantidad: linea.cantidad,
            estado_envio: 'pendiente',
            operacion_pendiente: 'insertar',
            sincronizado_en: null,
            creado_localmente_en: ahora,
            actualizado_localmente_en: ahora
          });

          continue;

        }

        const sinCambios =
          previo.insumo_id === linea.insumo_id &&
          Number(previo.cantidad) === Number(linea.cantidad);

        if (sinCambios) {
          continue;
        }

        store.put({
          ...previo,
          insumo_id: linea.insumo_id,
          insumo_nombre: linea.insumo_nombre,
          unidad: linea.unidad,
          cantidad: linea.cantidad,
          estado_envio: 'pendiente',
          operacion_pendiente: previo.sincronizado_en
            ? 'actualizar'
            : 'insertar',
          actualizado_localmente_en: ahora
        });

      }

    };

    lectura.onerror = () => transaction.abort();

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = () => {
      db.close();
      reject(
        transaction.error ||
        new Error('No fue posible guardar los insumos.')
      );
    };

  });

}


// ==============================================
// MARCAS DE SINCRONIZACIÓN
// ==============================================

export function marcarConsumoEnviado(id) {

  return ejecutar('consumos_insumo', 'readwrite', store => {

    const lectura = store.get(id);

    lectura.onsuccess = () => {

      if (!lectura.result) {
        return;
      }

      store.put({
        ...lectura.result,
        estado_envio: 'enviado',
        operacion_pendiente: null,
        sincronizado_en: new Date().toISOString()
      });

    };

    return lectura;

  });

}


export function eliminarConsumoLocal(id) {

  return ejecutar(
    'consumos_insumo',
    'readwrite',
    store => store.delete(id)
  );

}
