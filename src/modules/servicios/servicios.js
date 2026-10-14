// Importamos la instancia global de Supabase desde la carpeta services
import { supabase } from '../../services/supabase.js';

// Referencias a los elementos del HTML
const gridServicios = document.getElementById('grid-servicios');
const busquedaInput = document.getElementById('busqueda-servicio');

const fabNuevo = document.getElementById('btn-fab-nuevo');
const modalServicio = document.getElementById('modal-servicio');
const modalTitle = document.getElementById('modal-title');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelarModal = document.getElementById('btn-cancelar-modal');
const formModal = document.getElementById('form-modal-servicio');

const inputId = document.getElementById('input-servicio-id');
const inputNombre = document.getElementById('input-nombre');
const inputDescripcion = document.getElementById('input-descripcion');
const inputCosto = document.getElementById('input-costo');
const inputTiempo = document.getElementById('input-tiempo');

let serviciosCache = [];

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  cargarServicios();
  initEventListeners();
});

function initEventListeners() {
  // Buscador en tiempo real
  busquedaInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const filtrados = serviciosCache.filter(s => 
      s.nombre.toLowerCase().includes(query) || 
      (s.descripcion && s.descripcion.toLowerCase().includes(query))
    );
    renderTarjetas(filtrados);
  });

  // Abrir Modal para Crear Nuevo Servicio
  fabNuevo.addEventListener('click', () => {
    formModal.reset();
    inputId.value = '';
    modalTitle.textContent = 'Crear nuevo servicio';
    modalServicio.classList.remove('hidden');
  });

  // Cerrar Modal
  const cerrarModal = () => modalServicio.classList.add('hidden');
  btnCloseModal.addEventListener('click', cerrarModal);
  btnCancelarModal.addEventListener('click', cerrarModal);

  // Evento de Submit del Formulario (Crear / Editar)
  formModal.addEventListener('submit', async (e) => {
    e.preventDefault();
    await guardarServicio();
  });
}

// ------------------------------------------------------------------
// CONSULTAR SERVICIOS (READ)
// ------------------------------------------------------------------
async function cargarServicios() {
  gridServicios.innerHTML = '<p style="text-align:center; width:100%; color:#64748b;">Cargando servicios desde Supabase...</p>';

  try {
    const { data, error } = await supabase
      .from('servicios')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;

    serviciosCache = data || [];

    if (serviciosCache.length === 0) {
      gridServicios.innerHTML = '<p style="text-align:center; width:100%; color:#64748b;">No hay servicios registrados aún. Haz clic en + para agregar el primero.</p>';
    } else {
      renderTarjetas(serviciosCache);
    }
  } catch (err) {
    console.error('Error al consultar Supabase:', err.message);
    gridServicios.innerHTML = `<p style="text-align:center; width:100%; color:#ef4444;">Error al cargar datos: ${err.message}</p>`;
  }
}

// ------------------------------------------------------------------
// RENDERIZAR TARJETAS EN PANTALLA
// ------------------------------------------------------------------
function renderTarjetas(lista) {
  gridServicios.innerHTML = '';

  lista.forEach(s => {
    const card = document.createElement('div');
    card.className = 'card-ruta';
    card.innerHTML = `
      <div>
        <div class="card-ruta-header">
          <div class="card-ruta-title">
            <span>📄</span>
            <span>${s.nombre}</span>
          </div>
          <button class="btn-edit-circle btn-editar-card" title="Editar servicio">✏️</button>
        </div>
        <div class="desc-box-ruta">
          <strong>Descripción:</strong><br>
          ${s.descripcion || 'Sin descripción disponible.'}
        </div>
      </div>
      <div class="card-ruta-footer">
        <div>💲 Costo por visita MXN: $${parseFloat(s.costo_visita || 0).toFixed(2)}</div>
        <div>🕒 Tiempo estimado en minutos: ${s.duracion_estimada_min || 0}</div>
      </div>
    `;

    // Asignar evento al botón de editar de la tarjeta
    card.querySelector('.btn-editar-card').addEventListener('click', () => {
      inputId.value = s.id;
      inputNombre.value = s.nombre;
      inputDescripcion.value = s.descripcion || '';
      inputCosto.value = s.costo_visita || 0;
      inputTiempo.value = s.duracion_estimada_min || 0;

      modalTitle.textContent = 'Editar servicio';
      modalServicio.classList.remove('hidden');
    });

    gridServicios.appendChild(card);
  });
}

// ------------------------------------------------------------------
// GUARDAR / ACTUALIZAR EN SUPABASE (CREATE / UPDATE)
// ------------------------------------------------------------------
async function guardarServicio() {
  const id = inputId.value;
  const payload = {
    nombre: inputNombre.value.trim(),
    descripcion: inputDescripcion.value.trim(),
    costo_visita: parseFloat(inputCosto.value),
    duracion_estimada_min: parseInt(inputTiempo.value)
  };

  try {
    if (id) {
      // Editar registro existente
      const { error } = await supabase
        .from('servicios')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
    } else {
      // Insertar nuevo registro
      const { error } = await supabase
        .from('servicios')
        .insert([payload]);

      if (error) throw error;
    }

    // Ocultar modal y refrescar la grilla
    modalServicio.classList.add('hidden');
    cargarServicios();
  } catch (err) {
    alert('Error al guardar el servicio en Supabase: ' + err.message);
  }
}