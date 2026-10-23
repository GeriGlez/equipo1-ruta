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

// Modal Eliminar
const modalEliminar = document.getElementById('modal-confirmar-eliminar');
const btnCloseModalEliminar = document.getElementById('btn-close-modal-eliminar');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminar');
const btnConfirmarEliminar = document.getElementById('btn-confirmar-eliminar');
const textoConfirmarEliminar = document.getElementById('texto-confirmar-eliminar');

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
    modalTitle.textContent = 'Nuevo contrato';
    modalContrato.classList.remove('hidden');
  });

  const cerrarModal = () => modalContrato.classList.add('hidden');
  btnCloseModal.addEventListener('click', cerrarModal);
  btnCancelarModal.addEventListener('click', cerrarModal);

  const cerrarModalEliminar = () => {
    modalEliminar.classList.add('hidden');
    contratoAEliminarId = null;
  };
  btnCloseModalEliminar.addEventListener('click', cerrarModalEliminar);
  btnCancelarEliminar.addEventListener('click', cerrarModalEliminar);

  btnConfirmarEliminar.addEventListener('click', async () => {
    if (contratoAEliminarId) {
      await eliminarContrato(contratoAEliminarId);
      cerrarModalEliminar();
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
      supabase.from('servicios').select('id, nombre').order('nombre', { ascending: true })
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
  gridContratos.innerHTML = '<p style="text-align:center; width:100%; color:#64748b; padding: 2rem;">Cargando contratos desde Supabase...</p>';
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
    console.error('Error al consultar Supabase:', err.message);
    gridContratos.innerHTML = `<p style="text-align:center; width:100%; color:#ef4444; padding: 2rem;">Error al cargar datos: ${err.message}</p>`;
  }
}

function renderTarjetas() {
  gridContratos.innerHTML = '';

  if (contratosFiltrados.length === 0) {
    gridContratos.innerHTML = '<p style="text-align:center; width:100%; color:#64748b; padding: 2rem;">No se encontraron contratos.</p>';
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
            <span>${nombreCondominio}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem; align-items: center;">
            <button class="btn-edit-circle btn-editar-card" title="Editar contrato">✏️</button>
            <button class="btn-delete-circle btn-eliminar-card" title="Eliminar contrato" style="background: #FEE2E2; border: 1px solid #FCA5A5; color: #DC2626; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">🗑️</button>
          </div>
        </div>

        <div class="contrato-servicio-box">
          <div class="servicio-nombre-badge">${nombreServicio}</div>
          <div class="contrato-detalle-row"><strong>Tarifa mensual:</strong> $${Number(c.tarifa || 0).toLocaleString('es-MX')}</div>
          <div class="contrato-detalle-row"><strong>Frecuencia:</strong> ${c.frecuencia || 'N/A'}</div>
          <div class="contrato-detalle-row"><strong>Días preferenciales:</strong> ${c.dia_preferente || 'N/A'}</div>
        </div>
      </div>
    `;

    card.querySelector('.btn-editar-card').addEventListener('click', () => {
      inputId.value = c.id;
      selectCondominio.value = c.condominio_id;
      selectServicio.value = c.servicio_id;
      inputTarifa.value = c.tarifa;
      selectFrecuencia.value = c.frecuencia;
      inputDias.value = c.dia_preferente;

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

  const payload = {
    condominio_id: selectCondominio.value,
    servicio_id: selectServicio.value,
    tarifa: parseFloat(inputTarifa.value) || 0,
    frecuencia: selectFrecuencia.value,
    dia_preferente: inputDias.value.trim()
  };

  try {
    if (id) {
      const { error } = await supabase
        .from('condominio_servicio')
        .update(payload)
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
    alert('Error al guardar en Supabase: ' + err.message);
  }
}

// ELIMINAR REGISTRO DE `condominio_servicio`
async function eliminarContrato(id) {
  try {
    const { error } = await supabase
      .from('condominio_servicio')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await cargarContratos();
  } catch (err) {
    alert('Error al eliminar en Supabase: ' + err.message);
  }
}