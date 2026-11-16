import { supabase } from '../../services/supabase.js';

// Elementos del DOM
const listaIncidenciasEl = document.getElementById('listaIncidencias');
const inputBuscar = document.getElementById('buscarIncidencia');
const formEditar = document.getElementById('formEditarIncidencia');

// Campos del formulario
const selectCondominio = document.getElementById('condominio');
const selectArea = document.getElementById('area');
const selectVisita = document.getElementById('visita');
const selectReportadoPor = document.getElementById('reportado_por');
const selectPrioridad = document.getElementById('prioridad'); // <-- Referencia al select de prioridad
const textDescripcion = document.getElementById('descripcion');
const selectEstado = document.getElementById('estado');
const selectResueltoPor = document.getElementById('resuelto_por');
const inputNota = document.getElementById('nota_resolucion');
const btnGuardar = document.getElementById('btnGuardar');

let incidenciasGlobales = [];
let incidenciaActualId = null;

// Inicializar vista al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  await cargarDatosSelects();
  await cargarIncidencias();
});

// 1. Obtener catálogos para poblar los selects estáticos del formulario
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

// 2. Cargar lista de incidencias desde Supabase asegurando traer la prioridad
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
    renderizarLista(incidenciasGlobales);

  } catch (error) {
    console.error('Error al cargar incidencias:', error);
    alert('No se pudieron cargar las incidencias.');
  }
}

// 3. Renderizar las tarjetas en el panel izquierdo
function renderizarLista(incidencias) {
  listaIncidenciasEl.innerHTML = '';

  if (incidencias.length === 0) {
    listaIncidenciasEl.innerHTML = '<p style="padding: 15px; font-size: 13px; color: #666;">No hay incidencias registradas.</p>';
    return;
  }

  incidencias.forEach((inc, index) => {
    const nombreCondominio = inc.condominios?.nombre || 'Condominio desconocido';
    const nombreReporta = inc.usuarios?.nombre || 'Técnico';
    const numeroIncidencia = String(index + 1).padStart(3, '0');

    const tarjeta = document.createElement('div');
    tarjeta.className = `tarjeta-incidencia ${inc.id === incidenciaActualId ? 'activa' : ''}`;
    tarjeta.innerHTML = `
      <h4>Incidencia ${numeroIncidencia}</h4>
      <p>Condominio: ${nombreCondominio}</p>
      <p>Reportado por: ${nombreReporta}</p>
      <span style="font-size: 10px; padding: 2px 6px; background: #e0e0e0; border-radius: 4px; text-transform: uppercase;">
      ${inc.estado.replace('_', ' ')}</span>
    `;

    tarjeta.addEventListener('click', (e) => seleccionarIncidencia(inc, e));
    listaIncidenciasEl.appendChild(tarjeta);
  });
}

// 4. Mostrar detalles de la incidencia seleccionada
function seleccionarIncidencia(inc, event) {
  incidenciaActualId = inc.id;

  document.querySelectorAll('.tarjeta-incidencia').forEach(el => el.classList.remove('activa'));
  if (event?.currentTarget) {
    event.currentTarget.classList.add('activa');
  }

  selectCondominio.value = inc.condominio_id || '';
  selectArea.value = inc.area_id || '';
  selectVisita.value = inc.visita_id || '';
  selectReportadoPor.value = inc.reportada_por || '';
  
  // Formateamos la primera letra en mayúscula para que se vea limpio (ej. "alta" -> "Alta")
  const prioridadTexto = inc.prioridad 
    ? inc.prioridad.charAt(0).toUpperCase() + inc.prioridad.slice(1).toLowerCase() 
    : 'Sin prioridad';

  // Inyectamos directamente la opción que viene de la base de datos
  selectPrioridad.innerHTML = `<option value="${inc.prioridad || ''}" selected>${prioridadTexto}</option>`;
  
  textDescripcion.value = inc.descripcion || '';
  selectEstado.value = inc.estado || 'reportada';
  selectResueltoPor.value = inc.resuelta_por || '';
  inputNota.value = inc.nota_resolucion || '';

  if (inc.estado === 'resuelta' || inc.estado === 'descartada') {
    bloquearFormularioCerrado();
  } else {
    desbloquearFormulario();
  }
}

// 5. Filtrar incidencias en tiempo real
inputBuscar.addEventListener('input', (e) => {
  const texto = e.target.value.toLowerCase();
  const filtradas = incidenciasGlobales.filter(inc => {
    const condominio = (inc.condominios?.nombre || '').toLowerCase();
    const reporta = (inc.usuarios?.nombre || '').toLowerCase();
    const desc = (inc.descripcion || '').toLowerCase();
    return condominio.includes(texto) || reporta.includes(texto) || desc.includes(texto);
  });
  renderizarLista(filtradas);
});

// 6. Manejar la actualización del estado y guardado de cambios
formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!incidenciaActualId) return;

  const estadoNuevo = selectEstado.value;
  const nota = inputNota.value.trim();

  // CORRECCIÓN: La nota solo es obligatoria si pasa a "resuelta" o "descartada"[cite: 35]
  if ((estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') && nota === '') {
    alert('Es obligatorio ingresar una nota de resolución para cerrar la incidencia.');
    inputNota.focus();
    return;
  }

  try {
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    const { data: { session } } = await supabase.auth.getSession();
    const adminId = session?.user?.id || null;

    const datosActualizacion = {
      estado: estadoNuevo,
      nota_resolucion: nota,
      resuelta_por: (estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') ? adminId : null
    };

    const { error } = await supabase
      .from('incidencias')
      .update(datosActualizacion)
      .eq('id', incidenciaActualId);

    if (error) throw error;

    alert('Incidencia actualizada exitosamente.');
    await cargarIncidencias(); 

    if (estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') {
      bloquearFormularioCerrado();
    }

  } catch (error) {
    console.error('Error al actualizar:', error);
    alert('Hubo un error al guardar los cambios en el servidor.');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar cambios';
  }
});

function bloquearFormularioCerrado() {
  selectEstado.disabled = true;
  inputNota.readOnly = true;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Incidencia cerrada (Estado final)';
}

function desbloquearFormulario() {
  selectEstado.disabled = false;
  inputNota.readOnly = false;
  btnGuardar.disabled = false;
  btnGuardar.textContent = 'Guardar cambios';
}