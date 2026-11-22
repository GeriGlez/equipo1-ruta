import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js';

// Referencias DOM
const gridContratos = document.getElementById('grid-contratos');
const paginacionContainer = document.getElementById('paginacion-contratos');
const busquedaInput = document.getElementById('busqueda-contrato');

// Modal Crear/Editar
const fabNuevo = document.getElementById('btn-fab-nuevo');
const modalContrato = document.getElementById('modal-contrato');
const modalTitle = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const formModal = document.getElementById('form-modal-contrato');

const inputId = document.getElementById('input-contrato-id');
const selectCondominio = document.getElementById('select-condominio');
const selectServicio = document.getElementById('select-servicio');
const inputTarifa = document.getElementById('input-tarifa');
const selectFrecuencia = document.getElementById('select-frecuencia');
const inputDias = document.getElementById('input-dias');
const formError = document.getElementById('form-error');

// Modal Eliminar
const modalEliminar = document.getElementById('modal-confirmar-eliminar');
const btnCloseModalEliminar = document.getElementById('btn-close-modal-eliminar');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminar');
const btnConfirmarEliminar = document.getElementById('btn-confirmar-eliminar');
const textoConfirmarEliminar = document.getElementById('texto-confirmar-eliminar');
const eliminarError = document.getElementById('eliminar-error');

// Estado Global
let contratosCache = [];
let contratosFiltrados = [];
let paginaActual = 1;
const ITEMS_POR_PAGINA = 12;
let contratoAEliminarId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app');

  try {
    const sesion = await getActiveSession();

    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    const nombreUser = document.querySelector('.visitas-user-info strong');
    if (nombreUser && sesion.usuario.nombre) {
      nombreUser.textContent = sesion.usuario.nombre;
    }

    if (appContainer) {
      appContainer.style.display = 'block';
    }

    await cargarSelectsModal();
    await cargarContratos();
    initEventListeners();
  } catch (error) {
    console.error('Error al verificar la sesión:', error);
    window.location.href = '/';
  }
});

// Aviso de error dentro del modal (textContent: nunca se interpreta como HTML)
function mostrarError(mensaje) {
  formError.textContent = mensaje;
  formError.hidden = false;
}

function limpiarError() {
  formError.textContent = '';
  formError.hidden = true;
  eliminarError.textContent = '';
  eliminarError.hidden = true;
}

// Mismo aviso, pero dentro del modal de eliminar
function mostrarErrorEliminar(mensaje) {
  eliminarError.textContent = mensaje;
  eliminarError.hidden = false;
}

// Al editar un contrato no se puede cambiar el condominio ni el servicio (solo tarifa, frecuencia y día)
function bloquearCondominioYServicio(bloquear) {
  selectCondominio.disabled = bloquear;
  selectServicio.disabled = bloquear;
}

// Traduce los errores de Supabase/PostgreSQL a mensajes en español para el usuario.
// El mensaje original (en inglés) solo se manda a la consola, para depurar.
const MENSAJES_POR_CODIGO = {
  '23505': 'Ese registro ya existe. Revisa que no esté duplicado.',
  '23503': 'No se puede completar porque el registro está en uso por otros datos (contratos u órdenes).',
  '23502': 'Falta llenar un campo obligatorio.',
  '23514': 'Uno de los valores no cumple las reglas permitidas.',
  '42501': 'No tienes permiso para realizar esta acción.',
  'PGRST301': 'Tu sesión expiró. Vuelve a iniciar sesión.'
};

function traducirError(err) {
  console.error('[RUTA] Error de Supabase:', err);

  if (err?.code && MENSAJES_POR_CODIGO[err.code]) {
    return MENSAJES_POR_CODIGO[err.code];
  }

  // Sin red: supabase-js NO lanza la excepción, la devuelve como
  // { message: "TypeError: Failed to fetch" } (o "NetworkError..." en Firefox)
  const textoRed = /Failed to fetch|NetworkError|Load failed|FetchError/i;
  if (!navigator.onLine || err?.name === 'TypeError' || textoRed.test(err?.message || '')) {
    return 'Sin conexión a internet. Revisa tu red e inténtalo de nuevo.';
  }

  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}

function initEventListeners() {
  busquedaInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    contratosFiltrados = contratosCache.filter(c => 
      c.condominios?.nombre?.toLowerCase().includes(query) || 
      c.servicios?.nombre?.toLowerCase().includes(query)
    );
    paginaActual = 1;
    renderTarjetas();
  });

  fabNuevo.addEventListener('click', () => {
    formModal.reset();
    inputId.value = '';
    bloquearCondominioYServicio(false);
    limpiarError();
    modalTitle.textContent = 'Nuevo contrato';
    modalContrato.classList.remove('hidden');
  });

  const cerrarModal = () => {
    modalContrato.classList.add('hidden');
    limpiarError();
  };
  btnCloseModal.addEventListener('click', cerrarModal);
  btnCancelarModal.addEventListener('click', cerrarModal);

  const cerrarModalEliminar = () => {
    modalEliminar.classList.add('hidden');
    contratoAEliminarId = null;
    limpiarError();
  };
  btnCloseModalEliminar.addEventListener('click', cerrarModalEliminar);
  btnCancelarEliminar.addEventListener('click', cerrarModalEliminar);

  // Si falla, el modal sigue abierto mostrando el aviso
  btnConfirmarEliminar.addEventListener('click', async () => {
    if (contratoAEliminarId) {
      const ok = await eliminarContrato(contratoAEliminarId);
      if (ok) cerrarModalEliminar();
    }
  });

  formModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarContrato();
  });
}

// Cargar catálogos de Condominios y Servicios para los Selects del Modal
async function cargarSelectsModal() {
  try {
    const [{ data: condominios }, { data: servicios }] = await Promise.all([
      supabase.from('condominios').select('id, nombre').order('nombre', { ascending: true }),
      // Solo servicios activos: no se pueden contratar servicios desactivados
      supabase.from('servicios').select('id, nombre').eq('activo', true).order('nombre', { ascending: true })
    ]);

    selectCondominio.innerHTML = '<option value="" disabled selected>Selecciona un condominio...</option>';
    (condominios || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      selectCondominio.appendChild(opt);
    });

    selectServicio.innerHTML = '<option value="" disabled selected>Selecciona un servicio...</option>';
    (servicios || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.nombre;
      selectServicio.appendChild(opt);
    });
  } catch (err) {
    console.warn('Error al cargar catálogos para el modal:', err);
  }
}

// CONSULTAR DESDE TABLA RELACIONAL `condominio_servicio`
async function cargarContratos() {
  gridContratos.innerHTML = '<p class="estado-vacio">Cargando contratos desde Supabase...</p>';
  paginacionContainer.innerHTML = '';
  paginacionContainer.style.display = 'none';

  try {
    const { data, error } = await supabase
      .from('condominio_servicio')
      .select(`
        id,
        condominio_id,
        servicio_id,
        tarifa,
        frecuencia,
        dia_preferente,
        created_at,
        condominios ( id, nombre ),
        servicios ( id, nombre )
      `)
      .eq('activo', true) // borrado lógico: los contratos desactivados no se muestran
      .order('created_at', { ascending: false });

    if (error) throw error;

    contratosCache = data || [];
    contratosFiltrados = [...contratosCache];

    const totalPaginas = Math.ceil(contratosFiltrados.length / ITEMS_POR_PAGINA) || 1;
    if (paginaActual > totalPaginas) {
      paginaActual = totalPaginas;
    }

    renderTarjetas();
  } catch (err) {
    const pError = document.createElement('p');
    pError.className = 'estado-vacio estado-error';
    pError.textContent = `No se pudieron cargar los contratos. ${traducirError(err)}`;
    gridContratos.replaceChildren(pError);
  }
}

function renderTarjetas() {
  gridContratos.innerHTML = '';

  if (contratosFiltrados.length === 0) {
    gridContratos.innerHTML = '<p class="estado-vacio">No se encontraron contratos.</p>';
    paginacionContainer.innerHTML = '';
    paginacionContainer.style.display = 'none';
    return;
  }

  const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
  const fin = inicio + ITEMS_POR_PAGINA;
  const paginaItems = contratosFiltrados.slice(inicio, fin);

  paginaItems.forEach(c => {
    const nombreCondominio = c.condominios?.nombre || 'Condominio no especificado';
    const nombreServicio = c.servicios?.nombre || 'Servicio no especificado';

    const card = document.createElement('div');
    card.className = 'card-ruta';
    card.innerHTML = `
      <div>
        <div class="card-contrato-header">
          <div class="condominio-title">
            <span>🏠</span>
            <span class="contrato-condominio"></span>
          </div>
          <div class="card-acciones">
            <button class="btn-edit-circle btn-editar-card" title="Editar contrato">✏️</button>
            <button class="btn-delete-circle btn-eliminar-card" title="Eliminar contrato">🗑️</button>
          </div>
        </div>

        <div class="contrato-servicio-box">
          <div class="servicio-nombre-badge"></div>
          <div class="contrato-detalle-row"><strong>Tarifa mensual:</strong> <span class="contrato-tarifa"></span></div>
          <div class="contrato-detalle-row"><strong>Frecuencia:</strong> <span class="contrato-frecuencia"></span></div>
          <div class="contrato-detalle-row"><strong>Días preferenciales:</strong> <span class="contrato-dia"></span></div>
        </div>
      </div>
    `;

    // Los datos de la BD se asignan con textContent: el navegador los trata como texto, nunca como HTML (evita XSS almacenado)
    card.querySelector('.contrato-condominio').textContent = nombreCondominio;
    card.querySelector('.servicio-nombre-badge').textContent = nombreServicio;
    card.querySelector('.contrato-tarifa').textContent = `$${Number(c.tarifa || 0).toLocaleString('es-MX')}`;
    card.querySelector('.contrato-frecuencia').textContent = c.frecuencia || 'N/A';
    card.querySelector('.contrato-dia').textContent = c.dia_preferente || 'N/A';

    // aria-label con datos de la BD, asignado aquí y no en la plantilla
    card.querySelector('.btn-editar-card').setAttribute('aria-label', `Editar contrato de ${nombreCondominio}: ${nombreServicio}`);
    card.querySelector('.btn-eliminar-card').setAttribute('aria-label', `Eliminar contrato de ${nombreCondominio}: ${nombreServicio}`);

    card.querySelector('.btn-editar-card').addEventListener('click', () => {
      inputId.value = c.id;
      selectCondominio.value = c.condominio_id;
      selectServicio.value = c.servicio_id;
      inputTarifa.value = c.tarifa;
      selectFrecuencia.value = c.frecuencia;
      inputDias.value = c.dia_preferente;

      bloquearCondominioYServicio(true);
      limpiarError();
      modalTitle.textContent = 'Editar contrato';
      modalContrato.classList.remove('hidden');
    });

    card.querySelector('.btn-eliminar-card').addEventListener('click', () => {
      contratoAEliminarId = c.id;
      textoConfirmarEliminar.textContent = `¿Estás seguro de que deseas eliminar el contrato de "${nombreCondominio}"? Esta acción no se puede deshacer.`;
      modalEliminar.classList.remove('hidden');
    });

    gridContratos.appendChild(card);
  });

  renderPaginacion();
}

function renderPaginacion() {
  const totalPaginas = Math.ceil(contratosFiltrados.length / ITEMS_POR_PAGINA);

  if (totalPaginas <= 1) {
    paginacionContainer.innerHTML = '';
    paginacionContainer.style.display = 'none';
    return;
  }

  paginacionContainer.style.display = 'flex';
  paginacionContainer.innerHTML = '';

  const btnPrev = document.createElement('button');
  btnPrev.textContent = '◄ Anterior';
  btnPrev.disabled = paginaActual === 1;
  btnPrev.style.cssText = `padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #CBD5E1; background: ${paginaActual === 1 ? '#F1F5F9' : '#FFF'}; cursor: ${paginaActual === 1 ? 'not-allowed' : 'pointer'}; color: #0F172A; font-weight: 500;`;
  btnPrev.addEventListener('click', () => {
    if (paginaActual > 1) {
      paginaActual--;
      renderTarjetas();
    }
  });
  paginacionContainer.appendChild(btnPrev);

  for (let i = 1; i <= totalPaginas; i++) {
    const btnPage = document.createElement('button');
    btnPage.textContent = i;
    const esActiva = i === paginaActual;
    btnPage.style.cssText = `padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid ${esActiva ? '#005C7A' : '#CBD5E1'}; background: ${esActiva ? '#005C7A' : '#FFF'}; color: ${esActiva ? '#FFF' : '#0F172A'}; font-weight: ${esActiva ? 'bold' : 'normal'}; cursor: pointer;`;
    btnPage.addEventListener('click', () => {
      paginaActual = i;
      renderTarjetas();
    });
    paginacionContainer.appendChild(btnPage);
  }

  const btnNext = document.createElement('button');
  btnNext.textContent = 'Siguiente ►';
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.style.cssText = `padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid #CBD5E1; background: ${paginaActual === totalPaginas ? '#F1F5F9' : '#FFF'}; cursor: ${paginaActual === totalPaginas ? 'not-allowed' : 'pointer'}; color: #0F172A; font-weight: 500;`;
  btnNext.addEventListener('click', () => {
    if (paginaActual < totalPaginas) {
      paginaActual++;
      renderTarjetas();
    }
  });
  paginacionContainer.appendChild(btnNext);
}

// GUARDAR / ACTUALIZAR EN `condominio_servicio`
async function guardarContrato() {
  const id = inputId.value;
  limpiarError();

  // El formulario usa "novalidate": todas las validaciones se hacen aquí y se avisan en el modal, en español.
  // Condominio y servicio solo se validan al crear (al editar están bloqueados y no se envían).
  if (!id && !selectCondominio.value) {
    mostrarError('Selecciona un condominio.');
    return;
  }
  if (!id && !selectServicio.value) {
    mostrarError('Selecciona un servicio.');
    return;
  }

  // Number() en lugar de parseFloat(...) || 0: un valor vacío o inválido ya no se convierte en 0 en silencio
  const tarifa = Number(inputTarifa.value);
  if (!Number.isFinite(tarifa) || tarifa <= 0) {
    mostrarError('La tarifa debe ser un número mayor a 0.');
    return;
  }
  if (!selectFrecuencia.value) {
    mostrarError('Selecciona la frecuencia del servicio.');
    return;
  }
  if (!inputDias.value.trim()) {
    mostrarError('Escribe los días de la semana preferenciales.');
    return;
  }

  const payload = {
    condominio_id: selectCondominio.value,
    servicio_id: selectServicio.value,
    tarifa,
    frecuencia: selectFrecuencia.value,
    dia_preferente: inputDias.value.trim()
  };

  try {
    if (id) {
      // Al editar NO se envían condominio_id ni servicio_id: aunque alguien quite el
      // "disabled" desde la consola, esos dos campos no se modifican en la base.
      const { condominio_id, servicio_id, ...cambios } = payload;
      const { error } = await supabase
        .from('condominio_servicio')
        .update(cambios)
        .eq('id', id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('condominio_servicio')
        .insert([payload]);

      if (error) throw error;
    }

    modalContrato.classList.add('hidden');
    await cargarContratos();
  } catch (err) {
    // 23505 = violación de UNIQUE (condominio_id, servicio_id): ese condominio ya tiene ese servicio
    if (err.code === '23505') {
      mostrarError('Este condominio ya tiene contratado ese servicio. Edita el contrato existente en lugar de crear otro.');
    } else {
      mostrarError('No se pudo guardar el contrato. ' + traducirError(err));
    }
  }
}

// ELIMINAR CONTRATO (BORRADO LÓGICO): no se borra la fila, solo se marca activo = false.
// Devuelve true si se eliminó; si falla, muestra el aviso en el modal y devuelve false
async function eliminarContrato(id) {
  try {
    // select('id') confirma que sí se actualizó una fila
    // (si RLS lo bloquea, Supabase no da error, solo devuelve 0 filas)
    const { data, error } = await supabase
      .from('condominio_servicio')
      .update({ activo: false })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw { code: '42501' };

    await cargarContratos();
    return true;
  } catch (err) {
    mostrarErrorEliminar('No se pudo eliminar el contrato. ' + traducirError(err));
    return false;
  }
}