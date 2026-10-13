import {
  guardarVisita,
  guardarContextoOrden,
  obtenerContextoOrden,
  obtenerVisitaPorOrden,
  actualizarVisitaLocal
} from './db-local.js';


// ============================================
// ELEMENTOS DE LA PANTALLA
// ============================================

const formulario =
  document.querySelector('#visit-form');

const botonGuardar =
  document.querySelector('#save-visit');

const selectorArea =
  document.querySelector('#visit-area');

const mensajeLecturas =
  document.querySelector('#readings-info');

const lecturasAlberca =
  document.querySelector('#pool-readings');

const campoPh =
  document.querySelector('#ph-reading');

const campoCloro =
  document.querySelector('#chlorine-reading');

const numeroOrden =
  document.querySelector('#order-number');

const condominioOrden =
  document.querySelector('#order-condominium');

const servicioOrden =
  document.querySelector('#order-service');

const fechaOrden =
  document.querySelector('#order-date');

  const campoEntrada =
  document.querySelector('#entry-time');

const campoSalida =
  document.querySelector('#exit-time');

const campoObservaciones =
  document.querySelector(
    '#observations'
  );

const campoQuienRecibio =
  document.querySelector(
    '#received-by'
  );

const contadorObservaciones =
  document.querySelector(
    '#observations-counter'
  );

const tituloPantalla =
  document.querySelector(
    '.m5-screen-title h1'
  );

const textoBotonGuardar =
  document.querySelector(
    '#save-visit-label'
  );

const botonLimpiarEntrada =
  document.querySelector('#clear-entry-time');

const botonLimpiarSalida =
  document.querySelector('#clear-exit-time');

const estadoConexion =
  document.querySelector('#connection-status');

  const errorContexto =
  document.querySelector(
    '#register-context-error'
  );

const tarjetaOrden =
  document.querySelector(
    '.m5-order-card'
  );


// Contexto de la orden actualmente abierta
let contextoOrdenActual = null;

// Visita existente asociada a la orden,
// si ya fue registrada anteriormente.
let visitaLocalActual = null;


// Mientras carga la orden no permitimos guardar.
botonGuardar.disabled = true;
selectorArea.disabled = true;

// ============================================
// CAMPOS DE HORARIO
// ============================================

function configurarCampoHora(
  campo,
  botonLimpiar
) {

  campo.addEventListener(
    'input',
    () => {

      const digitos =
        campo.value
          .replace(/\D/g, '')
          .slice(0, 4);

      if (digitos.length > 2) {

        campo.value =
          `${digitos.slice(0, 2)}:${digitos.slice(2)}`;

      } else {

        campo.value = digitos;

      }

    }
  );


  botonLimpiar.addEventListener(
    'click',
    () => {

      campo.value = '';
      campo.focus();

    }
  );

}


configurarCampoHora(
  campoEntrada,
  botonLimpiarEntrada
);

configurarCampoHora(
  campoSalida,
  botonLimpiarSalida
);


// ============================================
// UTILIDADES
// ============================================

function normalizarTipoArea(tipo) {

  const valor = String(tipo || '')
    .trim()
    .toLowerCase();

  if (
    valor === 'area_comun' ||
    valor === 'área_común' ||
    valor === 'area-comun'
  ) {
    return 'area-comun';
  }

  return valor;
}


function formatearFecha(fecha) {

  if (!fecha) {
    return '';
  }

  const partes = fecha
    .split('-')
    .map(Number);

  if (partes.length !== 3) {
    return fecha;
  }

  const [anio, mes, dia] = partes;

  const fechaUTC = new Date(
    Date.UTC(anio, mes - 1, dia)
  );

  return new Intl.DateTimeFormat(
    'es-MX',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    }
  ).format(fechaUTC);
}


// ============================================
// HU-10 - LECTURAS SEGÚN EL ÁREA REAL
// ============================================

function actualizarLecturas(
  requiereLecturas
) {

  lecturasAlberca.hidden =
    !requiereLecturas;

  mensajeLecturas.hidden =
    requiereLecturas;

  campoPh.disabled =
    !requiereLecturas;

  campoCloro.disabled =
    !requiereLecturas;

  if (!requiereLecturas) {

    campoPh.value = '';
    campoCloro.value = '';

  }

}


// Estado inicial
actualizarLecturas(false);


// ============================================
// SUPABASE - CARGA SOLO CUANDO HAY RED
// ============================================

async function obtenerClienteSupabase() {

  const modulo =
    await import('../../services/supabase.js');

  return modulo.supabase;
}

// ============================================
// OBTENER USUARIO RUTA AUTENTICADO
// ============================================

async function obtenerTecnicoActual(supabase) {

  const {
    data: datosAuth,
    error: errorAuth
  } = await supabase.auth.getUser();

  if (errorAuth) {
    throw errorAuth;
  }

  const usuarioAuth =
    datosAuth?.user;

  if (!usuarioAuth?.email) {

    throw new Error(
      'No existe una sesión autenticada.'
    );

  }


  const {
    data: usuarioRuta,
    error: errorUsuario
  } = await supabase
    .from('usuarios')
    .select(
      'id, nombre, correo, rol, activo'
    )
    .eq(
      'correo',
      usuarioAuth.email
    )
    .eq(
      'activo',
      true
    )
    .single();


  if (errorUsuario) {
    throw errorUsuario;
  }

  if (!usuarioRuta) {

    throw new Error(
      'El usuario autenticado no existe en RUTA.'
    );

  }

  return usuarioRuta;
}


// ============================================
// CARGAR ORDEN DESDE SUPABASE
// ============================================

async function cargarContextoDesdeSupabase(
  ordenId
) {

    const supabase =
    await obtenerClienteSupabase();

    const tecnico =
    await obtenerTecnicoActual(
        supabase
    );


  // RLS decide si este técnico
  // puede consultar esta orden.
  const {
    data: orden,
    error: errorOrden
  } = await supabase
    .from('ordenes_servicio')
    .select(`
      id,
      condominio_id,
      area_id,
      servicio_id,
      cuadrilla_id,
      fecha_programada,
      estado
    `)
    .eq(
      'id',
      ordenId
    )
    .single();


  if (errorOrden) {
    throw errorOrden;
  }


  // Cargar por separado para que cada
  // relación sea fácil de identificar
  // y depurar.
  const [
    respuestaCondominio,
    respuestaArea,
    respuestaServicio
  ] = await Promise.all([

    supabase
      .from('condominios')
      .select('id, nombre')
      .eq(
        'id',
        orden.condominio_id
      )
      .single(),

    supabase
      .from('areas')
      .select(`
        id,
        nombre,
        tipo,
        requiere_lecturas
      `)
      .eq(
        'id',
        orden.area_id
      )
      .single(),

    supabase
      .from('servicios')
      .select('id, nombre')
      .eq(
        'id',
        orden.servicio_id
      )
      .single()

  ]);


  if (respuestaCondominio.error) {
    throw respuestaCondominio.error;
  }

  if (respuestaArea.error) {
    throw respuestaArea.error;
  }

  if (respuestaServicio.error) {
    throw respuestaServicio.error;
  }


  const contexto = {

    orden_id:
      orden.id,

    tecnico_id:
      tecnico.id,

    tecnico_nombre:
      tecnico.nombre,

    cuadrilla_id:
      orden.cuadrilla_id,

    fecha_programada:
      orden.fecha_programada,

    estado:
      orden.estado,

    condominio: {
      id:
        respuestaCondominio.data.id,

      nombre:
        respuestaCondominio.data.nombre
    },

    area: {
      id:
        respuestaArea.data.id,

      nombre:
        respuestaArea.data.nombre,

      tipo:
        respuestaArea.data.tipo,

      requiere_lecturas:
        respuestaArea.data
          .requiere_lecturas
    },

    servicio: {
      id:
        respuestaServicio.data.id,

      nombre:
        respuestaServicio.data.nombre
    }

  };


  // Guardar una copia que podrá
  // utilizarse posteriormente sin red.
  await guardarContextoOrden(
    contexto
  );


  return contexto;
}


// ============================================
// OBTENER CONTEXTO ONLINE / OFFLINE
// ============================================

async function cargarContextoOrden(
  ordenId
) {

  // Primero intentamos obtener información
  // actualizada si hay conexión.
  if (navigator.onLine) {

    try {

      const contextoRemoto =
        await cargarContextoDesdeSupabase(
          ordenId
        );

      console.log(
        '[RUTA] Orden cargada desde Supabase:',
        contextoRemoto
      );

      return contextoRemoto;

    } catch (error) {

      console.warn(
        '[RUTA] No se pudo obtener la orden desde Supabase:',
        error
      );

    }

  }


  // Si no hay red o falló la consulta,
  // intentar utilizar la copia local.
  const contextoLocal =
    await obtenerContextoOrden(
      ordenId
    );


  if (contextoLocal) {

    console.log(
      '[RUTA] Orden cargada desde IndexedDB:',
      contextoLocal
    );

    return contextoLocal;

  }


  throw new Error(
    'No fue posible obtener la información de la orden.'
  );
}


// ============================================
// MOSTRAR ORDEN EN LA PANTALLA
// ============================================

function aplicarContextoOrden(
  contexto
) {

  const tipoArea =
    normalizarTipoArea(
      contexto.area.tipo
    );

  const requiereLecturas =
    tipoArea === 'alberca' &&
    contexto.area.requiere_lecturas === true;


  numeroOrden.textContent =
    `Orden #${contexto.orden_id}`;

  condominioOrden.textContent =
    contexto.condominio.nombre;

  servicioOrden.textContent =
    contexto.servicio.nombre;

  fechaOrden.textContent =
    formatearFecha(
      contexto.fecha_programada
    );


  // El área ya viene determinada
  // por la orden. El técnico no la elige.
  const opcionArea =
    new Option(
      contexto.area.nombre,
      tipoArea,
      true,
      true
    );

  selectorArea.replaceChildren(
    opcionArea
  );

  selectorArea.disabled = true;


  actualizarLecturas(
    requiereLecturas
  );


  // Mostrar el técnico autenticado
  // utilizando el encabezado existente.
  const nombreUsuario =
    document.querySelector(
      '.m5-user strong'
    );

  if (nombreUsuario) {

    nombreUsuario.textContent =
      contexto.tecnico_nombre;

  }


  botonGuardar.disabled = false;
}

// ============================================
// CARGAR VISITA EXISTENTE EN EL FORMULARIO
// ============================================

function aplicarVisitaExistente(
  visita
) {

  campoEntrada.value =
    visita.hora_entrada || '';

  campoSalida.value =
    visita.hora_salida || '';

  campoObservaciones.value =
    visita.observaciones || '';

  campoQuienRecibio.value =
    visita.quien_recibio || '';

  campoPh.value =
    visita.ph ?? '';

  campoCloro.value =
    visita.cloro ?? '';

  contadorObservaciones.textContent =
    `${campoObservaciones.value.length}/500`;

  tituloPantalla.textContent =
    'Editar visita';

  textoBotonGuardar.textContent =
    'Guardar cambios';

  console.log(
    '[RUTA] Visita existente cargada:',
    visita
  );

}

// ============================================
// ESTADO DE CONEXIÓN
// ============================================

function actualizarEstadoConexion() {

  const enLinea =
    navigator.onLine;

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

}

window.addEventListener(
  'online',
  actualizarEstadoConexion
);

window.addEventListener(
  'offline',
  actualizarEstadoConexion
);

actualizarEstadoConexion();

function mostrarErrorContexto() {

  contextoOrdenActual = null;

  tarjetaOrden.hidden = true;
  formulario.hidden = true;

  errorContexto.hidden = false;
}


function ocultarErrorContexto() {

  errorContexto.hidden = true;

  tarjetaOrden.hidden = false;
  formulario.hidden = false;
}

// ============================================
// INICIALIZAR PANTALLA
// ============================================

async function inicializarPantalla() {

  const parametros =
    new URLSearchParams(
      window.location.search
    );

  const ordenId =
    Number(
      parametros.get('orden_id')
    );


  if (
    !Number.isInteger(ordenId) ||
    ordenId <= 0
  ) {

    console.error(
      '[RUTA] Falta orden_id en la URL.'
    );

    mostrarErrorContexto();
    
    return;
  }


  try {

    contextoOrdenActual =
      await cargarContextoOrden(
        ordenId
      );

    ocultarErrorContexto();

    aplicarContextoOrden(
      contextoOrdenActual
    );

    visitaLocalActual =
      await obtenerVisitaPorOrden(
        contextoOrdenActual.orden_id,
        contextoOrdenActual.tecnico_id
      );


    if (visitaLocalActual) {

      aplicarVisitaExistente(
        visitaLocalActual
      );

    }

  } catch (error) {

    console.error(
      '[RUTA] Error al cargar la orden:',
      error
    );

    mostrarErrorContexto();
  }

}


// ============================================
// GUARDAR VISITA EN INDEXEDDB
// ============================================

formulario.addEventListener(
  'submit',
  async (event) => {

    event.preventDefault();


    if (!contextoOrdenActual) {

      alert(
        'La información de la orden aún no está disponible.'
      );

      return;

    }


    if (!formulario.reportValidity()) {
      return;
    }


    const entrada =
      document.querySelector(
        '#entry-time'
      ).value;

    const salida =
      document.querySelector(
        '#exit-time'
      ).value;


    if (!entrada) {

      alert(
        'Ingresa las horas de entrada y salida.'
      );

      return;

    }


    const tipoArea =
      normalizarTipoArea(
        contextoOrdenActual.area.tipo
      );

    const requiereLecturas =
      tipoArea === 'alberca' &&
      contextoOrdenActual.area
        .requiere_lecturas === true;


    const valorPh =
      campoPh.value.trim();

    const valorCloro =
      campoCloro.value.trim();


    const datosVisita = {

      // Relaciones reales
      orden_id:
        contextoOrdenActual.orden_id,

      tecnico_id:
        contextoOrdenActual.tecnico_id,

      // Datos auxiliares locales
      area_id:
        contextoOrdenActual.area.id,

      area_tipo:
        tipoArea,

      orden_referencia:
        `Orden #${contextoOrdenActual.orden_id}`,

      observaciones:
        document
          .querySelector('#observations')
          .value
          .trim(),

      quien_recibio:
        document
          .querySelector('#received-by')
          .value
          .trim(),

      ph:
        requiereLecturas &&
        valorPh !== ''
          ? Number(valorPh)
          : null,

      cloro:
        requiereLecturas &&
        valorCloro !== ''
          ? Number(valorCloro)
          : null,

      hora_entrada:
        entrada,

      hora_salida:
        salida || null,

    };


    botonGuardar.disabled = true;


    try {

      const estabaEditando = Boolean(visitaLocalActual);

      let visita;
      if (visitaLocalActual) {

        visita =
          await actualizarVisitaLocal(
            visitaLocalActual.id,
            datosVisita
          );

      } else {

        visita =
          await guardarVisita(
            datosVisita
          );

      }

      visitaLocalActual = visita;


      console.log(
        visitaLocalActual
          ? '[RUTA] Visita guardada/actualizada:'
          : '[RUTA] Visita guardada:',
        visita
      );


      // Mantener en pantalla la versión
      // realmente almacenada.
      aplicarVisitaExistente(
        visita
      );


      alert(
        'Los datos de la visita se guardaron ' +
        'en este dispositivo. ' +
        'Pendiente de sincronización.'
      );


      // formulario.reset();


      // // El reset no debe perder
      // // el contexto de la orden.
      // aplicarContextoOrden(
      //   contextoOrdenActual
      // );


      // const contadorObservaciones =
      //   document.querySelector(
      //     '#observations-counter'
      //   );

      // if (contadorObservaciones) {

      //   contadorObservaciones.textContent =
      //     '0/500';

      // }

    } catch (error) {

      console.error(
        'Error al guardar visita:',
        error
      );

      alert(
        'No se pudo guardar la visita. ' +
        'Los datos permanecen en el formulario; ' +
        'intenta guardarla nuevamente.'
      );

    } finally {

      botonGuardar.disabled = false;

    }

  }
);

const botonVolver =
  document.querySelector('.m5-back-button');

botonVolver?.addEventListener(
  'click',
  () => {
    window.location.href = '/';
  }
);


// Iniciar carga de la orden.
inicializarPantalla();