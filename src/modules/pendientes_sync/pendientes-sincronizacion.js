import {
    obtenerVisitasPendientes,
    marcarVisitaComoEnviada,
    obtenerIncidenciasPendientes, 
    marcarIncidenciaComoEnviada   
  } from './db-local.js';

import {
    getActiveSession
  } from '../auth/authService.js';

  const contador = document.querySelector('#pending-count');
  const mensaje = document.querySelector('#pending-message');
  const lista = document.querySelector('#pending-list');
  const errorMensaje = document.querySelector('#pending-error');
  const estadoConexion =
  document.querySelector('#connection-status');
  const botonSincronizar =
    document.querySelector('#sync-button');
  const avisoSinConexion =
  document.querySelector(
    '#offline-sync-warning'
  );
  const errorSincronizacion =
  document.querySelector('#sync-error');

  // Nombres visibles de las áreas
  const nombresAreas = {
    alberca: 'Alberca',
    jardin: 'Jardín',
    'area-comun': 'Área común',
    equipo: 'Equipo'
  };

  let cantidadPendientes = 0;
  let tecnicoActualId = null;

  async function cargarPendientes() {
  try {
    const visitas = await obtenerVisitasPendientes(tecnicoActualId);
    const incidencias = await obtenerIncidenciasPendientes();

    // Unimos ambos arreglos y les ponemos una etiqueta para diferenciarlos
    const listaPendientes = [
      ...visitas.map(v => ({ ...v, tipo_registro: 'visita' })),
      ...incidencias.map(i => ({ ...i, tipo_registro: 'incidencia' }))
    ];

    cantidadPendientes = listaPendientes.length;

    contador.textContent = cantidadPendientes === 1
      ? '1 registro pendiente'
      : `${cantidadPendientes} registros pendientes`;

    mensaje.textContent = cantidadPendientes > 0
      ? 'Estos registros están pendientes de envío.'
      : 'No hay nada que sincronizar';

    lista.replaceChildren();
    errorMensaje.hidden = true;

    // Generar tarjetas dinámicamente
    listaPendientes.forEach(item => {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'm5-pending-card';

      if (item.tipo_registro === 'visita') {
        // --- TARJETA DE VISITAS (Original de tu compañero) ---
        const fecha = new Date(item.creado_localmente_en);
        const fechaValida = !Number.isNaN(fecha.getTime());

        tarjeta.innerHTML = `
          <div class="m5-pending-card-main">
            <div class="m5-pending-card-icon"><img src="/hoja-de-calculo.png" alt=""></div>
            <div class="m5-pending-card-info">
              <div class="m5-pending-card-header">
                <strong>Visita</strong> <span class="m5-pending-badge">Pendiente</span>
              </div>
              <h3 class="m5-pending-order">${item.orden_referencia || 'Orden sin referencia'}</h3>
              <p class="m5-pending-area">${nombresAreas[item.area_tipo] || item.area_tipo || 'Área no especificada'}</p>
            </div>
          </div>
          <div class="m5-pending-card-footer">
            <span class="m5-pending-date">${fechaValida ? `Registrada: ${fecha.toLocaleDateString('es-MX')}` : 'Fecha no disponible'}</span>
            <span class="m5-pending-hours">${item.hora_entrada}\n${item.hora_salida}</span>
          </div>
        `;
      } 
      else if (item.tipo_registro === 'incidencia') {
        // --- TARJETA DE INCIDENCIAS (Tuya, con borde rojo) ---
        tarjeta.innerHTML = `
          <div class="m5-pending-card-main" style="border-left: 4px solid #f44336;">
            <div class="m5-pending-card-icon"><img src="/advertencia.png" alt=""></div>
            <div class="m5-pending-card-info">
              <div class="m5-pending-card-header">
                <strong>Incidencia</strong> <span class="m5-pending-badge" style="background:#f44336; color:white;">Pendiente</span>
              </div>
              <h3 class="m5-pending-order" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                ${item.descripcion || 'Sin descripción'}
              </h3>
              <p class="m5-pending-area">Visita #${item.visita_id}</p>
            </div>
          </div>
        `;
      }

      lista.appendChild(tarjeta);
    });

    console.log('Registros pendientes cargados:', cantidadPendientes);
    actualizarEstadoConexion();

  } catch (error) {
    console.error('Error consultando IndexedDB:', error);
    contador.textContent = 'No disponible';
    mensaje.textContent = 'No fue posible cargar los registros locales.';
    errorMensaje.hidden = false;
  }
}

  function actualizarEstadoConexion() {

  const enLinea =
    navigator.onLine;

  const mostrarAviso =
    !enLinea;

  avisoSinConexion.hidden =
    !mostrarAviso;

  estadoConexion.classList.toggle(
    'm5-connection--online',
    enLinea
  );

  estadoConexion.classList.toggle(
    'm5-connection--offline',
    !enLinea
  );

  estadoConexion.innerHTML = `
    <span class="m5-connection-dot"></span>
    ${enLinea ? 'Con conexión' : 'Sin conexión'}
  `;

  botonSincronizar.disabled =
    !enLinea ||
    tecnicoActualId === null ||
    cantidadPendientes === 0;
  }

  // ==============================================
  // SUPABASE - CARGA SOLO AL SINCRONIZAR
  // ==============================================

  async function obtenerClienteSupabase() {

    const modulo =
      await import('../../services/supabase.js');

    return modulo.supabase;
  }


  // ==============================================
  // COMBINAR FECHA LOCAL + HORA CAPTURADA
  // ==============================================

  function construirFechaHora(
    creadoLocalmenteEn,
    hora
  ) {

    if (!hora) {
      return null;
    }

    const fechaBase =
      new Date(creadoLocalmenteEn);

    if (Number.isNaN(fechaBase.getTime())) {

      throw new Error(
        'La visita no tiene una fecha local válida.'
      );
    }

    const partes =
      String(hora).split(':');

    const horas =
      Number(partes[0]);

    const minutos =
      Number(partes[1]);

    if (
      !Number.isInteger(horas) ||
      !Number.isInteger(minutos)
    ) {

      throw new Error(
        'La hora de la visita no es válida.'
      );
    }

    const fechaHora =
      new Date(
        fechaBase.getFullYear(),
        fechaBase.getMonth(),
        fechaBase.getDate(),
        horas,
        minutos,
        0,
        0
      );

    return fechaHora.toISOString();
  }

  function esUUID(
  valor
) {

  return (
    typeof valor === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(valor)
  );

}


  // ==============================================
  // ENVIAR UNA VISITA A SUPABASE
  // ==============================================

  async function sincronizarVisita(
    supabase,
    visita
  ) {

    const horaEntrada =
      construirFechaHora(
        visita.fecha_visita_en ||
        visita.creado_localmente_en,
        visita.hora_entrada
      );

    const horaSalida =
      construirFechaHora(
        visita.fecha_visita_en ||
        visita.creado_localmente_en,
        visita.hora_salida
      );


    const datosServidor = {

      orden_id:
        visita.orden_id,

      tecnico_id:
        visita.tecnico_id,

      hora_entrada:
        horaEntrada,

      hora_salida:
        horaSalida,

      ph:
        visita.ph,

      cloro:
        visita.cloro,

      observaciones:
        visita.observaciones || null,

      quien_recibio:
        visita.quien_recibio || null,

      pendiente_envio:
        false

    };

    const candidatoIdLocal =
      visita.id_local_servidor ||
      visita.id;


    if (
      esUUID(
        candidatoIdLocal
      )
    ) {

      datosServidor.id_local =
        candidatoIdLocal;

    }

    const esActualizacion =
      visita.operacion_pendiente ===
        'actualizar' &&
      Boolean(
        visita.visita_servidor_id
      );


    let visitaServidorId = null;


    // ==========================================
    // ACTUALIZAR VISITA EXISTENTE
    // ==========================================

    if (esActualizacion) {

      const {
        data,
        error
      } = await supabase
        .from('visitas')
        .update(
          datosServidor
        )
        .eq(
          'id',
          visita.visita_servidor_id
        )
        .eq(
          'tecnico_id',
          visita.tecnico_id
        )
        .select('id')
        .single();


      if (error) {
        throw error;
      }


      visitaServidorId =
        data.id;


      console.log(
        '[RUTA] Visita actualizada en Supabase:',
        visitaServidorId
      );

    }

    // ==========================================
    // INSERTAR VISITA NUEVA
    // ==========================================

    else {

      const {
        data,
        error
      } = await supabase
        .from('visitas')
        .insert(
          datosServidor
        )
        .select('id')
        .single();


      if (!error) {

        visitaServidorId =
          data.id;

      } else if (
        error.code === '23505'
      ) {

        // El registro ya había llegado
        // previamente al servidor.
        const {
          data: existente,
          error: errorExistente
        } = await supabase
          .from('visitas')
          .select('id')
          .eq(
            'id_local',
            visita.id
          )
          .single();


        if (errorExistente) {
          throw errorExistente;
        }


        visitaServidorId =
          existente.id;

      } else {

        throw error;

      }

    }


    // Solo se marca como enviada después
    // de que Supabase confirmó INSERT o UPDATE.
    const resultadoLocal = await marcarVisitaComoEnviada(
      visita.id,
      visitaServidorId,
      visita.revision_local ?? null
    );


    return {
      id: visitaServidorId,
      pendiente: resultadoLocal.estado_envio === 'pendiente'
    };

  }

async function sincronizarIncidencia(supabase, incidencia) {
  // Nos aseguramos de incluir reportada_por explícitamente si viniera separada, 
  // o dejamos que el objeto la mande completa si ya la trae dentro.
  const datosServidor = {
    condominio_id: incidencia.condominio_id,
    area_id: incidencia.area_id,
    visita_id: incidencia.visita_id,
    descripcion: incidencia.descripcion,
    prioridad: incidencia.prioridad,
    reportada_por: incidencia.reportada_por || tecnicoActualId // <--- ¡Vital para superar la política RLS!
  };

  const { data, error } = await supabase
    .from('incidencias')
    .insert([datosServidor])
    .select('id')
    .single();

  if (error) throw error;

  await marcarIncidenciaComoEnviada(incidencia.id, data.id);
  return { id: data.id };
}

async function sincronizarPendientes() {
  if (!navigator.onLine) {
    actualizarEstadoConexion();
    return;
  }

  botonSincronizar.disabled = true;

  const textoBoton = botonSincronizar.querySelector('span:last-child') || botonSincronizar;
  const textoOriginal = textoBoton.textContent;

  textoBoton.textContent = 'Sincronizando...';
  errorSincronizacion.hidden = true;

  try {
    if (tecnicoActualId === null) {
      throw new Error('No hay una sesión técnica activa.');
    }

    const sesion = await getActiveSession();

    const sesionValida =
      sesion?.usuario?.rol === 'tecnico' &&
      String(sesion.usuario.id) === String(tecnicoActualId) &&
      Boolean(sesion.user?.id);

    if (!sesionValida) {
      tecnicoActualId = null;
      cantidadPendientes = 0;
      lista.replaceChildren();
      throw new Error('La sesión del técnico cambió o dejó de estar disponible.');
    }

    const supabase = await obtenerClienteSupabase();

    const { data: datosAuth, error: errorAuth } = await supabase.auth.getUser();

    if (errorAuth || !datosAuth?.user || datosAuth.user.id !== sesion.user.id) {
      tecnicoActualId = null;
      cantidadPendientes = 0;
      lista.replaceChildren();
      throw new Error('No se pudo confirmar la identidad en Supabase.');
    }

    // --- AQUÍ INICIA LA UNIFICACIÓN ---
    const visitasLocales = await obtenerVisitasPendientes(tecnicoActualId);
    const incidenciasLocales = await obtenerIncidenciasPendientes();

    const pendientes = [
      ...visitasLocales.map(v => ({ ...v, tipo_registro: 'visita' })),
      ...incidenciasLocales.map(i => ({ ...i, tipo_registro: 'incidencia' }))
    ];

    if (pendientes.length === 0) {
      await cargarPendientes();
      return;
    }

    // Enrutador de sincronización
    for (const item of pendientes) {
      if (item.tipo_registro === 'visita') {
        await sincronizarVisita(supabase, item);
      } else if (item.tipo_registro === 'incidencia') {
        await sincronizarIncidencia(supabase, item);
      }
    }
    // --- FIN DE LA UNIFICACIÓN ---

    await cargarPendientes();

    if (cantidadPendientes > 0) {
      alert('Se enviaron los registros disponibles, pero todavía quedan cambios pendientes de sincronización.');
    } else {
      alert('Los registros pendientes se sincronizaron correctamente.');
    }

  } catch (error) {
    console.error('[RUTA] Error sincronizando registros:', error);
    errorSincronizacion.hidden = false;
    alert('No fue posible completar la sincronización. Verifica tu sesión y conexión. Los registros locales no se eliminaron.');
    await cargarPendientes();
  } finally {
    textoBoton.textContent = textoOriginal;
    actualizarEstadoConexion();
  }
}


  window.addEventListener(
    'online',
    actualizarEstadoConexion
  );

  window.addEventListener(
    'offline',
    actualizarEstadoConexion
  );

  botonSincronizar.addEventListener(
    'click',
    sincronizarPendientes
  );

  const botonVolver =
  document.querySelector(
    '.m5-back-button'
  );

botonVolver?.addEventListener(
  'click',
  () => {

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '/';

  }
);


async function inicializarPendientes() {
  try {
    const sesion = await getActiveSession();

    if (
      sesion?.usuario?.rol !== 'tecnico' ||
      sesion.usuario.id === null ||
      sesion.usuario.id === undefined
    ) {
      window.location.replace('/');
      return;
    }

    tecnicoActualId = sesion.usuario.id;

    // Mostrar el nombre del técnico autenticado.
    const nombreTecnico = document.querySelector(
      '#tecnico-profile-name'
    );

    if (nombreTecnico) {
      nombreTecnico.textContent =
        String(sesion.usuario.nombre || '').trim() ||
        'Técnico';
    }

    await cargarPendientes();

  } catch (error) {
    console.error(
      '[RUTA] No fue posible validar la sesión:',
      error
    );

    tecnicoActualId = null;
    cantidadPendientes = 0;

    lista.replaceChildren();

    contador.textContent = 'No disponible';
    mensaje.textContent =
      'No fue posible verificar la sesión.';

    errorMensaje.hidden = false;

  } finally {
    actualizarEstadoConexion();
  }
}

inicializarPendientes();
