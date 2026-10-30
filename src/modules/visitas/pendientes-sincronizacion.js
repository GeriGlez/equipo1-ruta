import {
    obtenerVisitasPendientes,
    marcarVisitaComoEnviada
  } from './db-local.js';

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

  async function cargarPendientes() {

    try {

      const visitas = await obtenerVisitasPendientes();

      // Actualizar contador
      const cantidad = visitas.length;
      cantidadPendientes = cantidad;

      contador.textContent = cantidad === 1
        ? '1 registro pendiente'
        : `${cantidad} registros pendientes`;

      mensaje.textContent = cantidad > 0
        ? 'Estos registros están pendientes de envío.'
        : 'No hay nada que sincronizar';

      // Limpiar contenido anterior
      lista.replaceChildren();
      errorMensaje.hidden = true;

      // Generar tarjetas
      visitas.forEach(visita => {

        const tarjeta = document.createElement('article');

        tarjeta.className = 'm5-pending-card';

        tarjeta.innerHTML = `
          <div class="m5-pending-card-main">

            <div class="m5-pending-card-icon">
              <img
                src="/hoja-de-calculo.png"
                alt=""
              >
            </div>

            <div class="m5-pending-card-info">

              <div class="m5-pending-card-header">
                <strong>Visita</strong>
                <span class="m5-pending-badge">
                  Pendiente
                </span>
              </div>

              <h3 class="m5-pending-order"></h3>

              <p class="m5-pending-area"></p>

            </div>

          </div>

          <div class="m5-pending-card-footer">
            <span class="m5-pending-date"></span>
            <span class="m5-pending-hours"></span>
          </div>
        `;

        // Insertar los datos almacenados
        tarjeta.querySelector('.m5-pending-order')
          .textContent = visita.orden_referencia
            || 'Orden sin referencia';

        tarjeta.querySelector('.m5-pending-area')
          .textContent = nombresAreas[visita.area_tipo]
            || visita.area_tipo
            || 'Área no especificada';

        tarjeta.querySelector('.m5-pending-hours')
          .textContent =
            `${visita.hora_entrada} - ${visita.hora_salida}`;

        // Fecha de creación local
        const fecha = new Date(visita.creado_localmente_en);

        const fechaValida = !Number.isNaN(fecha.getTime());

        tarjeta.querySelector('.m5-pending-date')
          .textContent = fechaValida
            ? `Registrada: ${fecha.toLocaleDateString('es-MX')}`
            : 'Fecha no disponible';

        lista.appendChild(tarjeta);

      });

      console.log('Visitas pendientes cargadas:', cantidad);

      actualizarEstadoConexion();

    } catch (error) {

      console.error('Error consultando IndexedDB:', error);

      contador.textContent = 'No disponible';

      mensaje.textContent =
        'No fue posible cargar los registros locales.';

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
    !enLinea || cantidadPendientes === 0;
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
    await marcarVisitaComoEnviada(
      visita.id,
      visitaServidorId
    );


    return {
      id: visitaServidorId
    };

  }

  async function sincronizarPendientes() {

  if (!navigator.onLine) {

    actualizarEstadoConexion();
    return;
  }


  const pendientes =
    await obtenerVisitasPendientes();

  if (pendientes.length === 0) {

    await cargarPendientes();
    return;
  }


  botonSincronizar.disabled = true;

  const textoBoton =
    botonSincronizar.querySelector('span');

  const textoOriginal =
    textoBoton.textContent;

  textoBoton.textContent =
    'Sincronizando...';

  errorSincronizacion.hidden = true;


  try {
    
    const supabase =
      await obtenerClienteSupabase();


    for (const visita of pendientes) {

      await sincronizarVisita(
        supabase,
        visita
      );

    }


    await cargarPendientes();


    alert(
      'Los registros pendientes se sincronizaron correctamente.'
    );

  } catch (error) {

    console.error(
      'Error sincronizando visitas:',
      error
    );

    errorSincronizacion.hidden = false;

    alert(
      'No fue posible enviar algunos registros. ' +
      'Tus datos permanecen guardados en este dispositivo.'
    );

    await cargarPendientes();

  } finally {

    textoBoton.textContent =
      textoOriginal;

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

  actualizarEstadoConexion();
  cargarPendientes();