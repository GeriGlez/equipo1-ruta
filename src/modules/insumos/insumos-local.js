// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Almacenamiento local de insumos (IndexedDB)
// ==============================================

import { abrirBD } from '../pendientes_sync/db-local.js';


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
// Cada insumo tiene como máximo UN registro por visita, así que
// guardar varias veces nunca duplica:
//
// - Insumo nuevo        -> se inserta (operación "insertar")
// - Insumo existente    -> se actualiza si cambió la cantidad
// - Insumo que ya no está-> se elimina (localmente si nunca
//                          llegó al servidor; si ya llegó,
//                          queda marcado para borrarse allá)
// - Insumo que estaba marcado para eliminarse y se vuelve a
//   capturar            -> se reactiva como "actualizar" (conserva
//                          su id y evita un borrado posterior
//                          que se llevaría el registro nuevo)
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

      // Un registro por insumo. Si por datos antiguos hubiera
      // más de uno, se conserva el vigente y los sobrantes se
      // quitan solo del dispositivo (en el servidor es la misma fila).
      const porInsumo = new Map();

      for (const registro of (lectura.result || [])) {

        const actual = porInsumo.get(registro.insumo_id);

        if (!actual) {
          porInsumo.set(registro.insumo_id, registro);
          continue;
        }

        const reemplaza =
          actual.operacion_pendiente === 'eliminar' &&
          registro.operacion_pendiente !== 'eliminar';

        store.delete((reemplaza ? actual : registro).id);

        if (reemplaza) {
          porInsumo.set(registro.insumo_id, registro);
        }

      }

      const deseados = new Map();

      for (const linea of lineas) {
        deseados.set(linea.insumo_id, linea);
      }

      // Insumos que el técnico quitó
      for (const [insumoId, registro] of porInsumo) {

        if (
          deseados.has(insumoId) ||
          registro.operacion_pendiente === 'eliminar'
        ) {
          continue;
        }

        if (!registro.sincronizado_en) {

          store.delete(registro.id);

        } else {

          store.put({
            ...registro,
            estado_envio: 'pendiente',
            operacion_pendiente: 'eliminar',
            actualizado_localmente_en: ahora
          });

        }

      }

      // Insumos nuevos o modificados
      for (const [insumoId, linea] of deseados) {

        const previo = porInsumo.get(insumoId);

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

        const estabaPorEliminar = previo.operacion_pendiente === 'eliminar';

        const sinCambios =
          !estabaPorEliminar &&
          Number(previo.cantidad) === Number(linea.cantidad);

        if (sinCambios) {
          continue;
        }

        store.put({
          ...previo,
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

// Confirma un consumo como enviado SOLO si no cambió mientras
// se enviaba (revisionEnviada = actualizado_localmente_en que se
// mandó). Si cambió, sigue pendiente para el siguiente envío.
export function marcarConsumoEnviado(id, revisionEnviada) {

  return ejecutar('consumos_insumo', 'readwrite', store => {

    const lectura = store.get(id);

    lectura.onsuccess = () => {

      const actual = lectura.result;

      if (!actual) {
        return;
      }

      const cambioDespues =
        revisionEnviada !== undefined &&
        actual.actualizado_localmente_en !== revisionEnviada;

      if (cambioDespues) {

        // La fila ya existe en el servidor: lo que falte es
        // actualizarla (o borrarla, si se marcó para eliminar).
        store.put({
          ...actual,
          estado_envio: 'pendiente',
          operacion_pendiente:
            actual.operacion_pendiente === 'insertar'
              ? 'actualizar'
              : actual.operacion_pendiente,
          sincronizado_en: new Date().toISOString()
        });

        return;

      }

      store.put({
        ...actual,
        estado_envio: 'enviado',
        operacion_pendiente: null,
        sincronizado_en: new Date().toISOString()
      });

    };

    return lectura;

  });

}


// Quita el registro local después de confirmar el borrado en el
// servidor, salvo que el técnico lo haya reactivado mientras tanto.
export function eliminarConsumoLocal(id, revisionEnviada) {

  return ejecutar('consumos_insumo', 'readwrite', store => {

    const lectura = store.get(id);

    lectura.onsuccess = () => {

      const actual = lectura.result;

      if (!actual) {
        return;
      }

      const reactivado =
        revisionEnviada !== undefined &&
        actual.actualizado_localmente_en !== revisionEnviada;

      if (!reactivado) {
        store.delete(id);
      }

    };

    return lectura;

  });

}
