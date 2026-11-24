import {
    obtenerVisitasPendientes,
    marcarVisitaComoEnviada,
    obtenerIncidenciasPendientes, 
    marcarIncidenciaComoEnviada,
    obtenerVisitasLocales   
  } from './db-local.js';


import {
  getActiveSession,
  obtenerSesionRemotaVerificada,
  login
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
  let sesionRemotaDisponible = false;
  let authUidActual = null;


const dialogoAuth = document.querySelector('#auth-dialog');
const formularioAuth = document.querySelector('#auth-form');
const inputPassword = document.querySelector('#auth-password');
const errorAuth = document.querySelector('#auth-error');
const botonConfirmarAuth = document.querySelector('#auth-confirm');
const botonCancelarAuth = document.querySelector('#auth-cancel');

let verificacionCancelada = false;
let verificandoIdentidad = false;

function mostrarVerificacion(forzar = false) {
  if (
    !navigator.onLine ||
    tecnicoActualId === null ||
    !authUidActual ||
    sesionRemotaDisponible ||
    verificandoIdentidad ||
    dialogoAuth.open ||
    (!forzar && (verificacionCancelada || cantidadPendientes === 0))
  ) {
    return;
  }

  inputPassword.value = '';
  errorAuth.hidden = true;
  errorAuth.textContent = '';
  dialogoAuth.showModal();
  inputPassword.focus();
}

botonCancelarAuth.addEventListener('click', () => {
  dialogoAuth.close();
});

dialogoAuth.addEventListener('cancel', evento => {
  if (verificandoIdentidad) evento.preventDefault();
});

dialogoAuth.addEventListener('close', () => {
  inputPassword.value = '';

  if (!sesionRemotaDisponible) {
    verificacionCancelada = true;
  }
});

formularioAuth.addEventListener('submit', async evento => {
  evento.preventDefault();

  if (verificandoIdentidad) return;

  const uidEsperado = authUidActual;
  const tecnicoEsperado = String(tecnicoActualId);
  const password = inputPassword.value;

  verificandoIdentidad = true;
  botonConfirmarAuth.disabled = true;
  botonCancelarAuth.disabled = true;
  errorAuth.hidden = true;
  actualizarEstadoConexion();

  try {
    if (!navigator.onLine) {
      throw new Error('Sin conexión');
    }

    const sesionActual = await getActiveSession();

    if (
      sesionActual?.usuario?.rol !== 'tecnico' ||
      sesionActual?.user?.id !== uidEsperado ||
      String(sesionActual?.usuario?.id) !== tecnicoEsperado
    ) {
      throw new Error('La sesión del técnico cambió.');
    }

    const resultado = await login(
      sesionActual.usuario.correo,
      password
    );

    if (
      resultado?.isOffline !== false ||
      resultado?.user?.id !== uidEsperado ||
      String(resultado?.usuario?.id) !== tecnicoEsperado
    ) {
      throw new Error('No se confirmó la identidad remota.');
    }

    const verificada =
      await obtenerSesionRemotaVerificada(tecnicoEsperado);

    if (
      !verificada ||
      verificada.user.id !== uidEsperado
    ) {
      throw new Error('La sesión remota no está disponible.');
    }

    sesionRemotaDisponible = true;
    verificacionCancelada = false;
    dialogoAuth.close();

  } catch (error) {
    console.warn('[RUTA] Verificación no completada:', error);

    errorAuth.textContent =
      String(error?.message).includes('Invalid login credentials')
        ? 'Contraseña incorrecta. Intenta nuevamente.'
        : 'No fue posible verificar tu identidad. Revisa tu conexión y sesión.';

    errorAuth.hidden = false;
    inputPassword.focus();

  } finally {
    inputPassword.value = '';
    verificandoIdentidad = false;
    botonConfirmarAuth.disabled = false;
    botonCancelarAuth.disabled = false;
    actualizarEstadoConexion();
  }
});


  async function cargarPendientes() {
  try {
    const visitas = await obtenerVisitasPendientes(tecnicoActualId);
    const incidencias = await obtenerIncidenciasPendientes(authUidActual);

    let consumosPendientes = [];
    try {
      const { obtenerConsumosPendientes } =
        await import('../insumos/insumos-local.js');
      consumosPendientes = await obtenerConsumosPendientes();
    } catch (_) {}

    // Unimos todos los arreglos y les ponemos una etiqueta para diferenciarlos
    const listaPendientes = [
      ...visitas.map(v => ({ ...v, tipo_registro: 'visita' })),
      ...incidencias.map(i => ({ ...i, tipo_registro: 'incidencia' })),
      ...consumosPendientes.map(c => ({ ...c, tipo_registro: 'consumo_insumo' }))
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

      // Insertar datos como texto, nunca como HTML.
      const ponerTexto = (selector, valor) => {
        tarjeta.querySelector(selector).textContent = valor;
      };

      if (item.tipo_registro === 'visita') {
        const fecha = new Date(item.creado_localmente_en);
        const fechaValida = !Number.isNaN(fecha.getTime());

        tarjeta.innerHTML = `
          <div class="m5-pending-card-main">
            <div class="m5-pending-card-icon">
              <img src="/hoja-de-calculo.png" alt="">
            </div>
            <div class="m5-pending-card-info">
              <div class="m5-pending-card-header">
                <strong>Visita</strong>
                <span class="m5-pending-badge">Pendiente</span>
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

        ponerTexto(
          '.m5-pending-order',
          item.orden_referencia || 'Orden sin referencia'
        );

        ponerTexto(
          '.m5-pending-area',
          nombresAreas[item.area_tipo] ||
          item.area_tipo ||
          'Área no especificada'
        );

        ponerTexto(
          '.m5-pending-date',
          fechaValida
            ? `Registrada: ${fecha.toLocaleDateString('es-MX')}`
            : 'Fecha no disponible'
        );

        ponerTexto(
          '.m5-pending-hours',
          `${item.hora_entrada}\n${item.hora_salida}`
        );
      }

      else if (item.tipo_registro === 'incidencia') {
        tarjeta.innerHTML = `
          <div class="m5-pending-card-main" style="border-left: 4px solid #f44336;">
            <div class="m5-pending-card-icon">
              <img src="/advertencia.png" alt="">
            </div>
            <div class="m5-pending-card-info">
              <div class="m5-pending-card-header">
                <strong>Incidencia</strong>
                <span class="m5-pending-badge" style="background:#f44336; color:white;">
                  Pendiente
                </span>
              </div>
              <h3 class="m5-pending-order" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;"></h3>
              <p class="m5-pending-area"></p>
            </div>
          </div>
        `;

        ponerTexto(
          '.m5-pending-order',
          item.descripcion || 'Sin descripción'
        );

        ponerTexto(
          '.m5-pending-area',
          item.visita_id ? `Visita #${item.visita_id}` : 'Visita local (pendiente de envío)'
        );
      }

      else if (item.tipo_registro === 'consumo_insumo') {
        const fecha = new Date(item.creado_localmente_en);
        const fechaValida = !Number.isNaN(fecha.getTime());

        tarjeta.innerHTML = `
          <div class="m5-pending-card-main" style="border-left: 4px solid #2196f3;">
            <div class="m5-pending-card-icon">
              <img src="/caja.png" alt="">
            </div>
            <div class="m5-pending-card-info">
              <div class="m5-pending-card-header">
                <strong>Insumo</strong>
                <span class="m5-pending-badge" style="background:#2196f3; color:white;">
                  Pendiente
                </span>
              </div>
              <h3 class="m5-pending-order" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;"></h3>
              <p class="m5-pending-area"></p>
            </div>
          </div>
          <div class="m5-pending-card-footer">
            <span class="m5-pending-date"></span>
            <span class="m5-pending-hours"></span>
          </div>
        `;

        ponerTexto(
          '.m5-pending-order',
          `${item.insumo_nombre || 'Insumo'} (${item.cantidad} ${item.unidad || ''})`
        );

        ponerTexto(
          '.m5-pending-area',
          item.orden_referencia || 'Visita local'
        );

        ponerTexto(
          '.m5-pending-date',
          fechaValida
            ? `Registrado: ${fecha.toLocaleDateString('es-MX')}`
            : 'Fecha no disponible'
        );

        ponerTexto(
          '.m5-pending-hours',
          `Cant: ${item.cantidad} ${item.unidad || ''}`
        );
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
    cantidadPendientes === 0 ||
    verificandoIdentidad;

  const textoSincronizar =
    botonSincronizar.querySelector('span:last-child');

  if (textoSincronizar && textoSincronizar.textContent !== 'Sincronizando...') {
    textoSincronizar.textContent =
      enLinea && cantidadPendientes > 0 && !sesionRemotaDisponible
        ? 'Verificar para sincronizar'
        : 'Sincronizar pendientes';
  }
  }


  
async function revisarAutenticacionRemota() {
  sesionRemotaDisponible = false;
  actualizarEstadoConexion();

  if (!navigator.onLine || tecnicoActualId === null) {
    return;
  }

  try {
    const sesion = await obtenerSesionRemotaVerificada(
      tecnicoActualId
    );

    sesionRemotaDisponible =
      Boolean(sesion && sesion.user.id === authUidActual);

  } catch (error) {
    console.warn(
      '[RUTA] No hay autenticación remota disponible:',
      error
    );
  } finally {
    actualizarEstadoConexion();

    if (!sesionRemotaDisponible) {
      mostrarVerificacion();
    }
  }
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


async function sincronizarIncidencia(supabase, incidencia, authUid) {
  const idLocal = incidencia.id_local || incidencia.id;

  if (!esUUID(idLocal)) {
    throw new Error('La incidencia no tiene un UUID local válido.');
  }

  if (
    !authUid ||
    String(incidencia.reportada_por) !== String(authUid)
  ) {
    throw new Error(
      'La incidencia no corresponde al usuario autenticado.'
    );
  }

  // Si la incidencia se creó apuntando a una visita offline (visita_id === null),
  // buscamos el número oficial que Supabase acaba de asignarle en el paso anterior.
  let visitaIdFinal = incidencia.visita_id;

  if (!visitaIdFinal && incidencia.visita_local_id) {
    const visitasLocales = await obtenerVisitasLocales();
    const visitaPadre = visitasLocales.find(
      v => String(v.id) === String(incidencia.visita_local_id)
    );

    if (!visitaPadre?.visita_servidor_id) {
      throw new Error(
        'La visita asociada aún no tiene un ID confirmado en el servidor.'
      );
    }

    visitaIdFinal = visitaPadre.visita_servidor_id;
  }

  const datosServidor = {
    id_local: idLocal,
    condominio_id: incidencia.condominio_id,
    area_id: incidencia.area_id,
    visita_id: visitaIdFinal,
    descripcion: incidencia.descripcion,
    prioridad: incidencia.prioridad,
    reportada_por: incidencia.reportada_por
  };

  const { data, error } = await supabase
    .from('incidencias')
    .insert(datosServidor)
    .select('id')
    .single();

  let idServidor;

  if (!error) {
    idServidor = data.id;
  } else if (error.code === '23505') {
    const { data: existente, error: errorConsulta } =
      await supabase
        .from('incidencias')
        .select('id')
        .eq('id_local', idLocal)
        .eq('reportada_por', incidencia.reportada_por)
        .maybeSingle();

    if (errorConsulta || !existente) {
      throw errorConsulta || new Error(
        'No se pudo confirmar la incidencia previamente enviada.'
      );
    }

    idServidor = existente.id;
  } else {
    throw error;
  }

  await marcarIncidenciaComoEnviada(
    incidencia.id,
    idServidor
  );

  return { id: idServidor };
}

async function sincronizarPendientes() {
  if (!navigator.onLine) {
    actualizarEstadoConexion();
    return;
  }


if (!sesionRemotaDisponible) {
  mostrarVerificacion(true);
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

    const sesion = await obtenerSesionRemotaVerificada(
      tecnicoActualId
    );

    
    if (!sesion) {
      sesionRemotaDisponible = false;
      mostrarVerificacion(true);
      return;
    }


    const supabase = await obtenerClienteSupabase();


    // --- AQUÍ INICIA LA UNIFICACIÓN ---
    const visitasLocales = await obtenerVisitasPendientes(tecnicoActualId);
    const incidenciasLocales = await obtenerIncidenciasPendientes(sesion.user.id);

    let consumosLocales = [];
    try {
      const { obtenerConsumosPendientes } =
        await import('../insumos/insumos-local.js');
      consumosLocales = await obtenerConsumosPendientes();
    } catch (_) {}

    const pendientes = [
      ...visitasLocales.map(v => ({ ...v, tipo_registro: 'visita' })),
      ...incidenciasLocales.map(i => ({ ...i, tipo_registro: 'incidencia' }))
    ];

    if (pendientes.length === 0 && consumosLocales.length === 0) {
      await cargarPendientes();
      return;
    }

    // Enrutador de sincronización
    for (const item of pendientes) {
      if (item.tipo_registro === 'visita') {
        await sincronizarVisita(supabase, item);
      } else if (item.tipo_registro === 'incidencia') {
        await sincronizarIncidencia(supabase, item, sesion.user.id);
      }
    }

    // Sincronizar consumos de insumos asociados a visitas
    try {
      const { sincronizarConsumosPendientes } =
        await import('../insumos/insumos-service.js');
      await sincronizarConsumosPendientes();
    } catch (errorInsumos) {
      console.warn('[RUTA] Advertencia al sincronizar consumos de insumos:', errorInsumos);
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
    revisarAutenticacionRemota
  );

  window.addEventListener('offline', () => {
    sesionRemotaDisponible = false;
    actualizarEstadoConexion();
  });

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
      !sesion?.user?.id ||
      sesion.usuario.id === null ||
      sesion.usuario.id === undefined
    ) {
      window.location.replace('/');
      return;
    }

    tecnicoActualId = sesion.usuario.id;

    authUidActual = sesion.user.id;

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

    await revisarAutenticacionRemota();

  } catch (error) {
    console.error(
      '[RUTA] No fue posible validar la sesión:',
      error
    );

    
    tecnicoActualId = null;
    authUidActual = null;
    sesionRemotaDisponible = false;
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
