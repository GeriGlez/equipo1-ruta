import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js'; // <- Importar servicio de autenticación

// ... Mantener todas las referencias DOM y variables globales ...

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Validar sesión y rol
    const sesion = await getActiveSession();

    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    // Mostrar el nombre real del administrador en el header
    const nombreUser = document.querySelector('.visitas-user-info strong');
    if (nombreUser && sesion.usuario.nombre) {
      nombreUser.textContent = sesion.usuario.nombre;
    }

    // Inicializar módulo de Servicios
    await cargarServicios();
    initEventListeners();
  } catch (error) {
    console.error('Error al verificar sesión:', error);
    window.location.href = '/';
  }
});

import { supabase } from '../../services/supabase.js';

// Referencias DOM
const gridServicios = document.getElementById('grid-servicios');
const paginacionContainer = document.getElementById('paginacion-servicios');
const busquedaInput = document.getElementById('busqueda-servicio');

// Modal Crear/Editar
const fabNuevo = document.getElementById('btn-fab-nuevo');
const modalServicio = document.getElementById('modal-servicio');
const modalTitle = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const formModal = document.getElementById('form-modal-servicio');

const inputId = document.getElementById('input-servicio-id');
const inputNombre = document.getElementById('input-nombre');
const inputDescripcion = document.getElementById('input-descripcion');
const inputTiempo = document.getElementById('input-tiempo');

// Modal Eliminar
const modalEliminar = document.getElementById('modal-confirmar-eliminar');
const btnCloseModalEliminar = document.getElementById('btn-close-modal-eliminar');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminar');
const btnConfirmarEliminar = document.getElementById('btn-confirmar-eliminar');
const textoConfirmarEliminar = document.getElementById('texto-confirmar-eliminar');

// Estado Global
let serviciosCache = [];
let serviciosFiltrados = [];
let paginaActual = 1;
const ITEMS_POR_PAGINA = 12;
let servicioAEliminarId = null;

document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  initEventListeners();
});

function initEventListeners() {
  // Buscador
  busquedaInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    serviciosFiltrados = serviciosCache.filter(s => 
      s.nombre.toLowerCase().includes(query) || 
      (s.descripcion && s.descripcion.toLowerCase().includes(query))
    );
    paginaActual = 1;
    renderTarjetas();
  });

  // Abrir Modal Crear
  fabNuevo.addEventListener('click', () => {
    formModal.reset();
    inputId.value = '';
    modalTitle.textContent = 'Crear nuevo servicio';
    modalServicio.classList.remove('hidden');
  });

  // Cerrar Modales
  const cerrarModal = () => modalServicio.classList.add('hidden');
  btnCloseModal.addEventListener('click', cerrarModal);
  btnCancelarModal.addEventListener('click', cerrarModal);

  const cerrarModalEliminar = () => {
    modalEliminar.classList.add('hidden');
    servicioAEliminarId = null;
  };
  btnCloseModalEliminar.addEventListener('click', cerrarModalEliminar);
  btnCancelarEliminar.addEventListener('click', cerrarModalEliminar);

  // Confirmar Eliminación
  btnConfirmarEliminar.addEventListener('click', async () => {
    if (servicioAEliminarId) {
      await eliminarServicio(servicioAEliminarId);
      cerrarModalEliminar();
    }
  });

  // Guardar (Crear o Editar)
  formModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarServicio();
  });
}

// ------------------------------------------------------------------
// 1. CONSULTAR SERVICIOS (READ)
// ------------------------------------------------------------------
async function cargarServicios() {
  gridServicios.innerHTML = '<p style="text-align:center; width:100%; color:#64748b; padding: 2rem;">Cargando servicios desde Supabase...</p>';
  paginacionContainer.innerHTML = '';
  paginacionContainer.style.display = 'none';

  try {
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre, descripcion, duracion_estimada_min, created_at')
      .order('nombre', { ascending: true });

    if (error) throw error;

    serviciosCache = data || [];
    serviciosFiltrados = [...serviciosCache];

    const totalPaginas = Math.ceil(serviciosFiltrados.length / ITEMS_POR_PAGINA) || 1;
    if (paginaActual > totalPaginas) {
      paginaActual = totalPaginas;
    }

    renderTarjetas();
  } catch (err) {
    console.error('Error al consultar Supabase:', err.message);
    gridServicios.innerHTML = `<p style="text-align:center; width:100%; color:#ef4444; padding: 2rem;">Error al cargar datos: ${err.message}</p>`;
  }
}

// ------------------------------------------------------------------
// 2. RENDERIZAR TARJETAS Y PAGINACIÓN
// ------------------------------------------------------------------
function renderTarjetas() {
  gridServicios.innerHTML = '';

  if (serviciosFiltrados.length === 0) {
    gridServicios.innerHTML = '<p style="text-align:center; width:100%; color:#64748b; padding: 2rem;">No se encontraron servicios.</p>';
    paginacionContainer.innerHTML = '';
    paginacionContainer.style.display = 'none';
    return;
  }

  const inicio = (paginaActual - 1) * ITEMS_POR_PAGINA;
  const fin = inicio + ITEMS_POR_PAGINA;
  const paginaItems = serviciosFiltrados.slice(inicio, fin);

  paginaItems.forEach(s => {
    const card = document.createElement('div');
    card.className = 'card-ruta';
    card.innerHTML = `
      <div>
        <div class="card-ruta-header">
          <div class="card-ruta-title">
            <span>📄</span>
            <span>${s.nombre}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 0.4rem; align-items: center;">
            <button class="btn-edit-circle btn-editar-card" title="Editar servicio">✏️</button>
            <button class="btn-delete-circle btn-eliminar-card" title="Eliminar servicio" style="background: #FEE2E2; border: 1px solid #FCA5A5; color: #DC2626; border-radius: 50%; width: 32px; height: 32px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.9rem;">🗑️</button>
          </div>
        </div>
        <div class="desc-box-ruta">
          <strong>Descripción:</strong><br>
          ${s.descripcion || 'Sin descripción disponible.'}
        </div>
      </div>
      <div class="card-ruta-footer">
        <div>🕒 Tiempo estimado en minutos: <strong>${s.duracion_estimada_min || 0} min</strong></div>
      </div>
    `;

    // Clic Editar
    card.querySelector('.btn-editar-card').addEventListener('click', () => {
      inputId.value = s.id;
      inputNombre.value = s.nombre;
      inputDescripcion.value = s.descripcion || '';
      inputTiempo.value = s.duracion_estimada_min || 0;

      modalTitle.textContent = 'Editar servicio';
      modalServicio.classList.remove('hidden');
    });

    // Clic Eliminar
    card.querySelector('.btn-eliminar-card').addEventListener('click', () => {
      servicioAEliminarId = s.id;
      textoConfirmarEliminar.textContent = `¿Estás seguro de que deseas eliminar el servicio "${s.nombre}"? Esta acción no se puede deshacer.`;
      modalEliminar.classList.remove('hidden');
    });

    gridServicios.appendChild(card);
  });

  renderPaginacion();
}

function renderPaginacion() {
  const totalPaginas = Math.ceil(serviciosFiltrados.length / ITEMS_POR_PAGINA);

  if (totalPaginas <= 1) {
    paginacionContainer.innerHTML = '';
    paginacionContainer.style.display = 'none';
    return;
  }

  paginacionContainer.style.display = 'flex';
  paginacionContainer.innerHTML = '';

  // Botón Anterior
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

  // Botones Numéricos
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

  // Botón Siguiente
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

// ------------------------------------------------------------------
// 3. GUARDAR / ACTUALIZAR / ELIMINAR EN SUPABASE
// ------------------------------------------------------------------
async function guardarServicio() {
  const id = inputId.value;

  const payload = {
    nombre: inputNombre.value.trim(),
    descripcion: inputDescripcion.value.trim(),
    duracion_estimada_min: parseInt(inputTiempo.value, 10)
  };

  try {
    if (id) {
      const { error } = await supabase
        .from('servicios')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('servicios')
        .insert([payload]);

      if (error) throw error;
    }

    modalServicio.classList.add('hidden');
    await cargarServicios();
  } catch (err) {
    alert('Error al guardar en Supabase: ' + err.message);
  }
}

async function eliminarServicio(id) {
  try {
    const { error } = await supabase
      .from('servicios')
      .delete()
      .eq('id', id);

    if (error) throw error;

    await cargarServicios();
  } catch (err) {
    alert('Error al eliminar en Supabase: ' + err.message);
  }
}