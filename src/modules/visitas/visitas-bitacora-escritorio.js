import {
  supabase
} from '../../services/supabase.js';

import {
  getActiveSession
} from '../auth/authService.js';


// ============================================
// ELEMENTOS DE LA PANTALLA
// ============================================

const cuerpoTabla =
  document.querySelector(
    '#visitas-body'
  );

const buscador =
  document.querySelector(
    '#buscar-visita'
  );

const filtroTipoArea =
  document.querySelector(
    '#tipo-area'
  );

const filtroEstado =
  document.querySelector(
    '#estado'
  );

const filtroCondominio =
  document.querySelector(
    '#condominio'
  );

const filtroFecha =
  document.querySelector(
    '#fecha'
  );

const nombreAdministrador =
  document.querySelector(
    '.visitas-user-info strong'
  );


let visitasCargadas = [];


// ============================================
// UTILIDADES
// ============================================

function normalizarTexto(
  valor
) {

  return String(
    valor ?? ''
  )
    .normalize('NFD')
    .replace(
      /[\u0300-\u036f]/g,
      ''
    )
    .toLowerCase()
    .trim();

}


function formatearFechaHora(
  valor
) {

  if (!valor) {
    return '—';
  }


  const fecha =
    new Date(valor);


  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {
    return '—';
  }


  return fecha.toLocaleString(
    'es-MX',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }
  );

}


function formatearHora(
  valor
) {

  if (!valor) {
    return '--:--';
  }


  const fecha =
    new Date(valor);


  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {
    return '--:--';
  }


  return fecha.toLocaleTimeString(
    'es-MX',
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }
  );

}


function obtenerFechaLocalISO(
  valor
) {

  if (!valor) {
    return '';
  }


  const fecha =
    new Date(valor);


  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {
    return '';
  }


  const year =
    fecha.getFullYear();

  const month =
    String(
      fecha.getMonth() + 1
    ).padStart(2, '0');

  const day =
    String(
      fecha.getDate()
    ).padStart(2, '0');


  return `${year}-${month}-${day}`;

}


async function consultarPorIds(
  tabla,
  columnas,
  ids
) {

  const idsUnicos =
    [
      ...new Set(
        ids.filter(
          id =>
            id !== null &&
            id !== undefined
        )
      )
    ];


  if (
    idsUnicos.length === 0
  ) {
    return [];
  }


  const {
    data,
    error
  } = await supabase
    .from(tabla)
    .select(columnas)
    .in(
      'id',
      idsUnicos
    );


  if (error) {
    throw error;
  }


  return data || [];

}


// ============================================
// ESTADOS DE PANTALLA
// ============================================

function mostrarMensajeTabla(
  mensaje
) {

  cuerpoTabla.innerHTML = '';


  const fila =
    document.createElement(
      'tr'
    );

  const celda =
    document.createElement(
      'td'
    );


  celda.colSpan = 7;
  celda.textContent =
    mensaje;

  celda.style.textAlign =
    'center';

  celda.style.padding =
    '2rem';


  fila.appendChild(
    celda
  );

  cuerpoTabla.appendChild(
    fila
  );

}


// ============================================
// CARGAR DATOS DESDE SUPABASE
// ============================================

async function cargarVisitas() {

  mostrarMensajeTabla(
    'Consultando visitas...'
  );


  const {
    data: visitas,
    error: errorVisitas
  } = await supabase
    .from('visitas')
    .select(`
      id,
      orden_id,
      tecnico_id,
      hora_entrada,
      hora_salida,
      ph,
      cloro,
      observaciones,
      quien_recibio,
      pendiente_envio,
      created_at
    `)
    .order(
      'hora_entrada',
      {
        ascending: false
      }
    );


  if (errorVisitas) {
    throw errorVisitas;
  }


  const listaVisitas =
    visitas || [];


  const ordenes =
    await consultarPorIds(
      'ordenes_servicio',
      `
        id,
        condominio_id,
        area_id,
        servicio_id,
        estado,
        fecha_programada
      `,
      listaVisitas.map(
        visita =>
          visita.orden_id
      )
    );


  const tecnicos =
    await consultarPorIds(
      'usuarios',
      `
        id,
        nombre,
        correo
      `,
      listaVisitas.map(
        visita =>
          visita.tecnico_id
      )
    );


  const condominios =
    await consultarPorIds(
      'condominios',
      `
        id,
        nombre
      `,
      ordenes.map(
        orden =>
          orden.condominio_id
      )
    );


  const areas =
    await consultarPorIds(
      'areas',
      `
        id,
        nombre,
        tipo
      `,
      ordenes.map(
        orden =>
          orden.area_id
      )
    );


  const servicios =
    await consultarPorIds(
      'servicios',
      `
        id,
        nombre
      `,
      ordenes.map(
        orden =>
          orden.servicio_id
      )
    );


  const mapaOrdenes =
    new Map(
      ordenes.map(
        item => [
          item.id,
          item
        ]
      )
    );

  const mapaTecnicos =
    new Map(
      tecnicos.map(
        item => [
          item.id,
          item
        ]
      )
    );

  const mapaCondominios =
    new Map(
      condominios.map(
        item => [
          item.id,
          item
        ]
      )
    );

  const mapaAreas =
    new Map(
      areas.map(
        item => [
          item.id,
          item
        ]
      )
    );

  const mapaServicios =
    new Map(
      servicios.map(
        item => [
          item.id,
          item
        ]
      )
    );


  visitasCargadas =
    listaVisitas.map(
      visita => {

        const orden =
          mapaOrdenes.get(
            visita.orden_id
          );

        const tecnico =
          mapaTecnicos.get(
            visita.tecnico_id
          );

        const condominio =
          mapaCondominios.get(
            orden?.condominio_id
          );

        const area =
          mapaAreas.get(
            orden?.area_id
          );

        const servicio =
          mapaServicios.get(
            orden?.servicio_id
          );


        return {

          ...visita,

          orden_estado:
            orden?.estado ||
            'sin estado',

          fecha_programada:
            orden?.fecha_programada ||
            null,

          tecnico_nombre:
            tecnico?.nombre ||
            'Técnico no disponible',

          tecnico_correo:
            tecnico?.correo ||
            '',

          condominio_id:
            condominio?.id ||
            null,

          condominio_nombre:
            condominio?.nombre ||
            'Condominio no disponible',

          area_nombre:
            area?.nombre ||
            'Área no disponible',

          area_tipo:
            area?.tipo ||
            '',

          servicio_nombre:
            servicio?.nombre ||
            'Servicio no disponible'

        };

      }
    );


  cargarOpcionesFiltros();

  aplicarFiltros();


  console.log(
    '[RUTA] Bitácora administrativa cargada:',
    visitasCargadas.length
  );

}


// ============================================
// FILTROS
// ============================================

function cargarOpcionesFiltros() {

  const estados =
    [
      ...new Set(
        visitasCargadas
          .map(
            visita =>
              visita.orden_estado
          )
          .filter(Boolean)
      )
    ].sort();


  filtroEstado.innerHTML =
    '<option value="">Todos</option>';


  for (
    const estado
    of estados
  ) {

    const option =
      document.createElement(
        'option'
      );

    option.value =
      estado;

    option.textContent =
      estado;

    filtroEstado.appendChild(
      option
    );

  }


  const condominios =
    [
      ...new Map(
        visitasCargadas
          .filter(
            visita =>
              visita.condominio_id
          )
          .map(
            visita => [
              visita.condominio_id,
              visita.condominio_nombre
            ]
          )
      )
    ];


  filtroCondominio.innerHTML =
    '<option value="">Todos</option>';


  for (
    const [
      id,
      nombre
    ]
    of condominios
  ) {

    const option =
      document.createElement(
        'option'
      );

    option.value =
      String(id);

    option.textContent =
      nombre;

    filtroCondominio.appendChild(
      option
    );

  }

}


function aplicarFiltros() {

  const termino =
    normalizarTexto(
      buscador.value
    );

  const tipoArea =
    filtroTipoArea.value;

  const estado =
    filtroEstado.value;

  const condominio =
    filtroCondominio.value;

  const fecha =
    filtroFecha.value;


  const filtradas =
    visitasCargadas.filter(
      visita => {

        const coincideBusqueda =
          !termino ||
          [
            visita.id,
            visita.orden_id,
            visita.tecnico_nombre,
            visita.tecnico_correo,
            visita.condominio_nombre,
            visita.area_nombre,
            visita.servicio_nombre,
            visita.observaciones
          ].some(
            valor =>
              normalizarTexto(
                valor
              ).includes(
                termino
              )
          );


        const coincideTipo =
          !tipoArea ||
          visita.area_tipo ===
            tipoArea;


        const coincideEstado =
          !estado ||
          visita.orden_estado ===
            estado;


        const coincideCondominio =
          !condominio ||
          String(
            visita.condominio_id
          ) ===
            condominio;


        const coincideFecha =
          !fecha ||
          obtenerFechaLocalISO(
            visita.hora_entrada
          ) ===
            fecha;


        return (
          coincideBusqueda &&
          coincideTipo &&
          coincideEstado &&
          coincideCondominio &&
          coincideFecha
        );

      }
    );


  renderizarVisitas(
    filtradas
  );

}


// ============================================
// RENDER TABLA
// ============================================

function renderizarVisitas(
  visitas
) {

  cuerpoTabla.innerHTML = '';


  if (
    visitas.length === 0
  ) {

    mostrarMensajeTabla(
      'No hay visitas que coincidan con los filtros.'
    );

    return;

  }


  for (
    const visita
    of visitas
  ) {

    const fila =
      document.createElement(
        'tr'
      );


    const celdaVisita =
      document.createElement(
        'td'
      );

    const tituloVisita =
      document.createElement(
        'strong'
      );

    tituloVisita.textContent =
      `Visita #${visita.id}`;

    const detalleOrden =
      document.createElement(
        'div'
      );

    detalleOrden.textContent =
      `Orden #${visita.orden_id}`;

    celdaVisita.append(
      tituloVisita,
      detalleOrden
    );


    const celdaCondominio =
      document.createElement(
        'td'
      );

    celdaCondominio.textContent =
      visita.condominio_nombre;


    const celdaArea =
      document.createElement(
        'td'
      );

    celdaArea.textContent =
      visita.area_nombre;


    const celdaTecnico =
      document.createElement(
        'td'
      );

    celdaTecnico.textContent =
      visita.tecnico_nombre;


    const celdaHorario =
      document.createElement(
        'td'
      );

    celdaHorario.textContent =
      `${formatearHora(
        visita.hora_entrada
      )} - ${formatearHora(
        visita.hora_salida
      )}`;


    const celdaActualizacion =
      document.createElement(
        'td'
      );

    celdaActualizacion.textContent =
      formatearFechaHora(
        visita.created_at
      );


    const celdaObservaciones =
      document.createElement(
        'td'
      );

    const observaciones =
      document.createElement(
        'div'
      );

    observaciones.textContent =
      visita.observaciones ||
      'Sin observaciones';


    const recibio =
      document.createElement(
        'small'
      );

    recibio.style.display =
      'block';

    recibio.textContent =
      visita.quien_recibio
        ? `Recibió: ${visita.quien_recibio}`
        : 'Sin receptor registrado';


    celdaObservaciones.append(
      observaciones,
      recibio
    );


    if (
      visita.ph !== null ||
      visita.cloro !== null
    ) {

      const lecturas =
        document.createElement(
          'small'
        );

      lecturas.style.display =
        'block';

      lecturas.textContent =
        `pH: ${
          visita.ph ?? '—'
        } · Cloro: ${
          visita.cloro ?? '—'
        } ppm`;


      celdaObservaciones.appendChild(
        lecturas
      );

    }


    fila.append(
      celdaVisita,
      celdaCondominio,
      celdaArea,
      celdaTecnico,
      celdaHorario,
      celdaActualizacion,
      celdaObservaciones
    );


    cuerpoTabla.appendChild(
      fila
    );

  }

}


// ============================================
// EVENTOS
// ============================================

[
  buscador,
  filtroTipoArea,
  filtroEstado,
  filtroCondominio,
  filtroFecha
].forEach(
  elemento => {

    elemento.addEventListener(
      elemento === buscador
        ? 'input'
        : 'change',
      aplicarFiltros
    );

  }
);


// ============================================
// INICIALIZACIÓN
// ============================================

async function inicializarBitacoraAdmin() {

  try {

    const sesion =
      await getActiveSession();


    if (
      !sesion?.usuario ||
      sesion.usuario.rol !==
        'administrador'
    ) {

      window.location.href =
        '/';

      return;

    }


    nombreAdministrador.textContent =
      sesion.usuario.nombre ||
      'Administrador';


    await cargarVisitas();

  } catch (error) {

    console.error(
      '[RUTA] Error al cargar bitácora administrativa:',
      error
    );


    mostrarMensajeTabla(
      'No fue posible cargar la bitácora de visitas.'
    );

  }

}


inicializarBitacoraAdmin();