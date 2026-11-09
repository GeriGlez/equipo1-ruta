import {
  getActiveSession,
  obtenerSesionRemotaVerificada
} from '../auth/authService.js';

import {
  obtenerVisitasLocales,
  obtenerContextoOrden
} from '../pendientes_sync/db-local.js';

// import {
//   supabase
// } from '../../services/supabase.js'

import {
  completarContextosFaltantes,
  precargarBitacoraTecnico
} from '../../services/precarga-bitacora.js';



// ============================================
// ELEMENTOS DE LA PANTALLA
// ============================================

const botonVolver =
  document.querySelector(
    '.m5-back-button'
  )

const estadoConexion =
  document.querySelector(
    '#connection-status'
  )

const nombreUsuario =
  document.querySelector(
    '.m5-user strong'
  )

  const contadorVisitas =
  document.querySelector(
    '#visit-count'
  )

const estadoVacio =
  document.querySelector(
    '#visit-log-empty'
  )

const errorBitacora =
  document.querySelector(
    '#visit-log-error'
  )

  const listaVisitas =
  document.querySelector(
    '#visit-log-list'
  )

const plantillaVisita =
  document.querySelector(
    '#visit-log-card-template'
  )


let usuarioActual =  null;

let authUidActual = null;

let sincronizacionEnCurso =  false;

// ============================================
// FORMATEAR FECHA
// ============================================

function formatearFecha(
  fechaIso
) {

  if (!fechaIso) {
    return 'Fecha no disponible'
  }


  const fecha =
    new Date(fechaIso)


  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {
    return 'Fecha no disponible'
  }


  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }
  ).format(fecha)

}


// ============================================
// TEXTO DE RESPALDO PARA ÁREA
// ============================================

function formatearTipoArea(
  tipoArea
) {

  if (!tipoArea) {
    return 'Área no disponible'
  }


  return tipoArea
    .replaceAll('-', ' ')
    .replace(
      /^./,
      letra =>
        letra.toUpperCase()
    )

}


// ============================================
// RENDERIZAR VISITAS
// ============================================

async function renderizarVisitas(
  visitas
) {

  listaVisitas.replaceChildren()


  for (const visita of visitas) {

    const fragmento =
      plantillaVisita
        .content
        .cloneNode(true)


    let contextoOrden = null


    try {

      contextoOrden =
        await obtenerContextoOrden(
          visita.orden_id
        )

    } catch (error) {

      console.warn(
        '[RUTA] No se encontró contexto local ' +
        `para la orden ${visita.orden_id}:`,
        error
      )

    }


    const orden =
      fragmento.querySelector(
        '.m5-log-order'
      )

    const condominio =
      fragmento.querySelector(
        '.m5-log-condominium'
      )

    const area =
      fragmento.querySelector(
        '.m5-log-area'
      )

    const servicio =
      fragmento.querySelector(
        '.m5-log-service'
      )

    const fecha =
      fragmento.querySelector(
        '.m5-log-date'
      )

    const horario =
      fragmento.querySelector(
        '.m5-log-hours'
      )

    const badge =
      fragmento.querySelector(
        '.m5-log-badge'
      )


    orden.textContent =
      visita.orden_referencia ||
      `Orden #${visita.orden_id}`


    condominio.textContent =
      contextoOrden?.condominio?.nombre ||
      'Condominio no disponible'


    area.textContent =
      contextoOrden?.area?.nombre ||
      formatearTipoArea(
        visita.area_tipo
      )


    servicio.textContent =
      contextoOrden?.servicio?.nombre ||
      'Servicio no disponible'


    fecha.textContent =
    formatearFecha(
        visita.fecha_visita_en ||
        visita.creado_localmente_en
    )


    horario.textContent =
      `${
        visita.hora_entrada ||
        '--:--'
      } - ${
        visita.hora_salida ||
        '--:--'
      }`


    const sincronizada =
      visita.estado_envio === 'enviado' ||
      visita.pendiente_envio === false


    if (sincronizada) {

      badge.textContent =
        'Sincronizada'

      badge.classList.add(
        'm5-log-badge--synced'
      )

    } else {

      badge.textContent =
        'Pendiente'

      badge.classList.add(
        'm5-log-badge--pending'
      )

    }


    listaVisitas.appendChild(
      fragmento
    )

  }

}


// ============================================
// CARGAR VISITAS LOCALES
// ============================================

async function cargarVisitasLocales(
  usuario
) {

  try {

    const visitas =
      await obtenerVisitasLocales();


    const visitasTecnico =
      visitas
        .filter(
          visita =>
            String(
              visita.tecnico_id
            ) ===
            String(
              usuario.id
            )
        )
        .sort(
        (a, b) =>
            new Date(
            b.fecha_visita_en ||
            b.creado_localmente_en
            ) -
            new Date(
            a.fecha_visita_en ||
            a.creado_localmente_en
            )
        );


    const cantidad =
      visitasTecnico.length;


    contadorVisitas.textContent =
      cantidad === 1
        ? '1 visita registrada'
        : `${cantidad} visitas registradas`;


    estadoVacio.hidden =
      cantidad > 0;


    errorBitacora.hidden =
      true;

    
    // Mostrar primero las visitas locales.
    await renderizarVisitas(
      visitasTecnico
    );

    // Recuperar automáticamente los datos de sus órdenes.
    if (navigator.onLine && visitasTecnico.length > 0) {
      try {
        const sesionRemota =
          await obtenerSesionRemotaVerificada(usuario.id);

        const recuperados = sesionRemota
          ? await completarContextosFaltantes(
              visitasTecnico,
              usuario,
              sesionRemota.user.id
            )
          : 0;

        if (recuperados > 0) {
          // Mostrar los nombres recién almacenados.
          await renderizarVisitas(visitasTecnico);

          console.log(
            '[RUTA] Contextos recuperados:',
            recuperados
          );
        }

      } catch (errorContexto) {
        console.warn(
          '[RUTA] No fue posible recuperar el contexto de las órdenes:',
          errorContexto
        );
      }
    }



    console.log(
      '[RUTA] Visitas locales del técnico:',
      visitasTecnico
    );


    return visitasTecnico;

  } catch (error) {

    console.error(
      '[RUTA] Error al consultar ' +
      'la bitácora local:',
      error
    );


    contadorVisitas.textContent =
      'Visitas no disponibles';


    estadoVacio.hidden =
      true;

    errorBitacora.hidden =
      false;


    return [];

  }

}



// ============================================
// ACTUALIZAR BITÁCORA DESDE SUPABASE
// ============================================


async function actualizarDesdeSupabase(usuario) {
  if (!navigator.onLine || sincronizacionEnCurso) {
    return;
  }

  sincronizacionEnCurso = true;

  try {
    // Obtener únicamente una sesión remota confirmada
    // que corresponda al técnico de esta bitácora.
    const sesionRemota =
      await obtenerSesionRemotaVerificada(usuario.id);

    if (!sesionRemota) {
      console.info(
        '[RUTA] Sin autenticación remota; ' +
        'se conservan las visitas locales.'
      );
      return;
    }

    // Servicio compartido: descarga las visitas y
    // sus contextos sin sobrescribir cambios pendientes.
    await precargarBitacoraTecnico(sesionRemota);

    // Actualizar la interfaz desde IndexedDB.
    await cargarVisitasLocales(usuario);

    console.log(
      '[RUTA] Bitácora actualizada con sesión verificada.'
    );

  } catch (error) {
    // Nunca borrar las visitas locales por un error remoto.
    console.error(
      '[RUTA] No fue posible actualizar la bitácora:',
      error
    );

  } finally {
    sincronizacionEnCurso = false;
  }
}



// ============================================
// VOLVER
// ============================================

botonVolver?.addEventListener(
  'click',
  () => {

    if (window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.href = '/'

  }
)


// ============================================
// ESTADO DE CONEXIÓN
// ============================================

function actualizarEstadoConexion() {

  const enLinea =
    navigator.onLine


  estadoConexion.classList.toggle(
    'm5-connection--online',
    enLinea
  )

  estadoConexion.classList.toggle(
    'm5-connection--offline',
    !enLinea
  )


  estadoConexion.innerHTML = `
    <span class="m5-connection-dot"></span>
    ${enLinea ? 'Con conexión' : 'Sin conexión'}
  `

}


window.addEventListener(
  'online',
  async () => {

    actualizarEstadoConexion();


    if (usuarioActual) {

      await actualizarDesdeSupabase(
        usuarioActual
      );

    }

  }
);


window.addEventListener(
  'offline',
  actualizarEstadoConexion
);


// ============================================
// INICIALIZAR PANTALLA
// ============================================

async function inicializarBitacora() {

  actualizarEstadoConexion();


  const sesion =
    await getActiveSession();


  if (!sesion?.usuario) {

    nombreUsuario.textContent =
      'Usuario';

    contadorVisitas.textContent =
      'Visitas no disponibles';

    return;

  }


  usuarioActual =
    sesion.usuario;

  authUidActual = sesion.user?.id ?? null;


  nombreUsuario.textContent =
    usuarioActual.nombre;


  // Primero mostramos lo local.
  // No esperamos a Supabase.
  await cargarVisitasLocales(
    usuarioActual
  );


  // Si hay conexión, refrescamos
  // en segundo paso.
  if (navigator.onLine) {

    await actualizarDesdeSupabase(
      usuarioActual
    );

  }

}


inicializarBitacora()
