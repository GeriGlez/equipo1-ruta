import { supabase } from '../../services/supabase.js';

// Elementos del DOM
const listaIncidenciasEl = document.getElementById('listaIncidencias');
const inputBuscar = document.getElementById('buscarIncidencia');
const selectFiltroEstado = document.getElementById('filtroEstado');
const formEditar = document.getElementById('formEditarIncidencia');
const adminUserNameEl = document.getElementById('admin-user-name');
const btnLogout = document.getElementById('btn-logout');

// Campos del formulario
const selectCondominio = document.getElementById('condominio');
const selectArea = document.getElementById('area');
const selectVisita = document.getElementById('visita');
const selectReportadoPor = document.getElementById('reportado_por');
const selectPrioridad = document.getElementById('prioridad');
const textDescripcion = document.getElementById('descripcion');
const selectEstado = document.getElementById('estado');
const selectResueltoPor = document.getElementById('resuelto_por');
const inputNota = document.getElementById('nota_resolucion');
const btnGuardar = document.getElementById('btnGuardar');

let incidenciasGlobales = [];
let incidenciaActualId = null;
let estadoOriginalIncidencia = null;
let notaOriginalIncidencia = '';

// Colores de etiqueta por estado (gris, amarillo, verde, rojo)
const ESTILOS_ESTADO = {
  reportada: {
    texto: 'Reportada',
    bg: '#e5e7eb',
    color: '#374151'
  },
  en_revision: {
    texto: 'En revisión',
    bg: '#fef08a',
    color: '#854d0e'
  },
  resuelta: {
    texto: 'Resuelta',
    bg: '#dcfce7',
    color: '#166534'
  },
  descartada: {
    texto: 'Descartada',
    bg: '#fee2e2',
    color: '#991b1b'
  }
};

// Inicializar vista al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  bloquearFormularioInicial();
  await cargarPerfilAdmin();
  await cargarDatosSelects();
  await cargarIncidencias();
});

// Cargar nombre del administrador y configurar cierre de sesión
async function cargarPerfilAdmin() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      window.location.replace('/');
      return;
    }

    const { data: usuario } = await supabase
      .from('usuarios')
      .select('nombre, rol')
      .eq('id', session.user.id)
      .maybeSingle();

    if (adminUserNameEl && usuario?.nombre) {
      adminUserNameEl.textContent = usuario.nombre;
    }
  } catch (err) {
    console.warn('No se pudo cargar el perfil del administrador:', err);
  }
}

btnLogout?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.replace('/');
});

// 1. Obtener catálogos para poblar los selects del formulario
async function cargarDatosSelects() {
  try {
    const { data: condominios } = await supabase.from('condominios').select('id, nombre');
    if (condominios) {
      selectCondominio.innerHTML = '<option value="">Selecciona un condominio</option>' +
        condominios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
    }

    const { data: areas } = await supabase.from('areas').select('id, nombre');
    if (areas) {
      selectArea.innerHTML = '<option value="">Selecciona un área</option>' +
        areas.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');
    }

    const { data: visitas } = await supabase.from('visitas').select('id');
    if (visitas) {
      selectVisita.innerHTML = '<option value="">Selecciona una visita</option>' +
        visitas.map(v => `<option value="${v.id}">Visita #${v.id}</option>`).join('');
    }

    const { data: usuarios } = await supabase.from('usuarios').select('id, nombre, rol');
    if (usuarios) {
      const opcionesUsuarios = '<option value="">Selecciona un usuario</option>' +
        usuarios.map(u => `<option value="${u.id}">${u.nombre} (${u.rol})</option>`).join('');
      selectReportadoPor.innerHTML = opcionesUsuarios;
      selectResueltoPor.innerHTML = opcionesUsuarios;
    }
  } catch (err) {
    console.error('Error al cargar catálogos:', err);
  }
}

// 2. Cargar lista de incidencias desde Supabase
async function cargarIncidencias() {
  try {
    const { data, error } = await supabase
      .from('incidencias')
      .select(`
        id,
        descripcion,
        prioridad,
        estado,
        nota_resolucion,
        condominio_id,
        area_id,
        visita_id,
        reportada_por,
        resuelta_por,
        condominios(nombre),
        usuarios:reportada_por(nombre)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    incidenciasGlobales = data || [];
    aplicarFiltros();

  } catch (error) {
    console.error('Error al cargar incidencias:', error);
    alert('No se pudieron cargar las incidencias.');
  }
}

// 3. Renderizar las tarjetas en el panel izquierdo con ID real y color de estado
function renderizarLista(incidencias) {
  listaIncidenciasEl.innerHTML = '';

  if (incidencias.length === 0) {
    listaIncidenciasEl.innerHTML = '<p style="padding: 15px; font-size: 13px; color: #666;">No se encontraron incidencias.</p>';
    return;
  }

  incidencias.forEach((inc) => {
    const nombreCondominio = inc.condominios?.nombre || 'Condominio desconocido';
    const nombreReporta = inc.usuarios?.nombre || 'Técnico';
    const estilo = ESTILOS_ESTADO[inc.estado] || {
      texto: inc.estado.replace('_', ' '),
      bg: '#e5e7eb',
      color: '#374151'
    };

    const tarjeta = document.createElement('div');
    tarjeta.className = `tarjeta-incidencia ${inc.id === incidenciaActualId ? 'activa' : ''}`;
    tarjeta.innerHTML = `
      <h4>Incidencia #${inc.id}</h4>
      <p>Condominio: ${nombreCondominio}</p>
      <p>Reportado por: ${nombreReporta}</p>
      <span style="display: inline-block; margin-top: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; background: ${estilo.bg}; color: ${estilo.color}; border-radius: 999px; text-transform: uppercase;">
        ${estilo.texto}
      </span>
    `;

    tarjeta.addEventListener('click', (e) => seleccionarIncidencia(inc, e));
    listaIncidenciasEl.appendChild(tarjeta);
  });
}

// Habilitar solo las transiciones de estado permitidas por el flujo
function configurarOpcionesEstado(estadoActual) {
  const opciones = Array.from(selectEstado.options);

  opciones.forEach(opt => {
    if (estadoActual === 'reportada') {
      opt.disabled = !['reportada', 'en_revision'].includes(opt.value);
    } else if (estadoActual === 'en_revision') {
      opt.disabled = opt.value === 'reportada';
    } else {
      opt.disabled = true;
    }
  });
}

// Evaluar si hubo cambios reales para habilitar el botón de guardar
function evaluarCambiosFormulario() {
  if (!incidenciaActualId) return;
  if (estadoOriginalIncidencia === 'resuelta' || estadoOriginalIncidencia === 'descartada') {
    return;
  }

  const estadoCambio = selectEstado.value !== estadoOriginalIncidencia;
  const notaCambio = inputNota.value.trim() !== notaOriginalIncidencia.trim();

  btnGuardar.disabled = !(estadoCambio || notaCambio);
}

selectEstado.addEventListener('change', evaluarCambiosFormulario);
inputNota.addEventListener('input', evaluarCambiosFormulario);

// 4. Mostrar detalles de la incidencia seleccionada
function seleccionarIncidencia(inc, event) {
  incidenciaActualId = inc.id;
  estadoOriginalIncidencia = inc.estado || 'reportada';
  notaOriginalIncidencia = inc.nota_resolucion || '';

  document.querySelectorAll('.tarjeta-incidencia').forEach(el => el.classList.remove('activa'));
  if (event?.currentTarget) {
    event.currentTarget.classList.add('activa');
  }

  selectCondominio.value = inc.condominio_id || '';
  selectArea.value = inc.area_id || '';
  selectVisita.value = inc.visita_id || '';
  selectReportadoPor.value = inc.reportada_por || '';

  const prioridadTexto = inc.prioridad
    ? inc.prioridad.charAt(0).toUpperCase() + inc.prioridad.slice(1).toLowerCase()
    : 'Sin prioridad';

  selectPrioridad.innerHTML = `<option value="${inc.prioridad || ''}" selected>${prioridadTexto}</option>`;

  textDescripcion.value = inc.descripcion || '';
  selectEstado.value = estadoOriginalIncidencia;
  selectResueltoPor.value = inc.resuelta_por || '';
  inputNota.value = notaOriginalIncidencia;

  if (inc.estado === 'resuelta' || inc.estado === 'descartada') {
    bloquearFormularioCerrado();
  } else {
    desbloquearFormulario();
    configurarOpcionesEstado(inc.estado);
    // Inicia deshabilitado hasta que el administrador modifique estado o notas
    btnGuardar.disabled = true;
  }
}

// 5. Filtrar incidencias por búsqueda (incluyendo #ID) y por estado
function aplicarFiltros() {
  const texto = inputBuscar.value.toLowerCase().trim();
  const textoSinGato = texto.replace(/^#/, '');
  const estadoFiltro = selectFiltroEstado ? selectFiltroEstado.value : 'todos';

  const filtradas = incidenciasGlobales.filter(inc => {
    const coincideEstado = estadoFiltro === 'todos' || inc.estado === estadoFiltro;
    if (!coincideEstado) return false;

    if (!texto) return true;

    const idStr = String(inc.id);
    const condominio = (inc.condominios?.nombre || '').toLowerCase();
    const reporta = (inc.usuarios?.nombre || '').toLowerCase();
    const desc = (inc.descripcion || '').toLowerCase();

    return (
      idStr.includes(textoSinGato) ||
      `#${idStr}`.includes(texto) ||
      condominio.includes(texto) ||
      reporta.includes(texto) ||
      desc.includes(texto)
    );
  });

  renderizarLista(filtradas);
}

inputBuscar.addEventListener('input', aplicarFiltros);
selectFiltroEstado?.addEventListener('change', aplicarFiltros);

// 6. Manejar la actualización del estado y guardado de cambios
formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!incidenciaActualId) return;

  const estadoNuevo = selectEstado.value;
  const nota = inputNota.value.trim();
  const esEstadoFinal = estadoNuevo === 'resuelta' || estadoNuevo === 'descartada';

  if (esEstadoFinal && nota === '') {
    alert('Es obligatorio ingresar una nota de resolución para cerrar la incidencia.');
    inputNota.focus();
    return;
  }

  let cerradaExitosamente = false;
  let guardadaExitosamente = false;

  try {
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    const { data: { session } } = await supabase.auth.getSession();
    const adminId = session?.user?.id || null;

    const datosActualizacion = {
      estado: estadoNuevo,
      nota_resolucion: nota,
      resuelta_por: esEstadoFinal ? adminId : null
    };

    const { error } = await supabase
      .from('incidencias')
      .update(datosActualizacion)
      .eq('id', incidenciaActualId);

    if (error) throw error;

    estadoOriginalIncidencia = estadoNuevo;
    notaOriginalIncidencia = nota;
    guardadaExitosamente = true;

    if (esEstadoFinal) {
      selectResueltoPor.value = adminId || '';
      cerradaExitosamente = true;
    } else {
      configurarOpcionesEstado(estadoNuevo);
    }

    alert('Incidencia actualizada exitosamente.');
    await cargarIncidencias();

  } catch (error) {
    console.error('Error al actualizar:', error);
    alert(error?.message || 'Hubo un error al guardar los cambios en el servidor.');
  } finally {
    if (cerradaExitosamente) {
      bloquearFormularioCerrado();
    } else {
      btnGuardar.textContent = 'Guardar cambios';
      // Si se guardó bien, queda deshabilitado hasta un nuevo cambio; si falló, se rehabilita
      btnGuardar.disabled = guardadaExitosamente;
    }
  }
});

function bloquearFormularioInicial() {
  selectEstado.disabled = true;
  inputNota.readOnly = true;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Selecciona una incidencia';
}

function bloquearFormularioCerrado() {
  selectEstado.disabled = true;
  inputNota.readOnly = true;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Incidencia cerrada (Estado final)';
}

function desbloquearFormulario() {
  selectEstado.disabled = false;
  inputNota.readOnly = false;
  btnGuardar.textContent = 'Guardar cambios';
}