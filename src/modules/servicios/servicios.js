import { supabase } from '../../services/supabase.js';
import { getActiveSession } from '../auth/authService.js';

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
const DURACION_MAX_MIN = 480; // 8 horas: límite máximo de un servicio
const formError = document.getElementById('form-error');

// Modal Eliminar
const modalEliminar = document.getElementById('modal-confirmar-eliminar');
const btnCloseModalEliminar = document.getElementById('btn-close-modal-eliminar');
const btnCancelarEliminar = document.getElementById('btn-cancelar-eliminar');
const btnConfirmarEliminar = document.getElementById('btn-confirmar-eliminar');
const textoConfirmarEliminar = document.getElementById('texto-confirmar-eliminar');
const eliminarError = document.getElementById('eliminar-error');

// Estado Global
let serviciosCache = [];
let serviciosFiltrados = [];
let paginaActual = 1;
const ITEMS_POR_PAGINA = 12;
let servicioAEliminarId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app'); // 1. Obtener referencia

  try {
    const sesion = await getActiveSession();

    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    const nombreUser = document.querySelector('#nombre-admin');
    if (nombreUser && sesion.usuario.nombre) {
      nombreUser.textContent = sesion.usuario.nombre;
    }

    // 2. Mostrar interfaz
    if (appContainer) {
      appContainer.style.display = 'block';
    }

    await cargarServicios();
    initEventListeners();
  } catch (error) {
    console.error('Error al verificar sesión:', error);
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
    limpiarError();
    modalTitle.textContent = 'Crear nuevo servicio';
    modalServicio.classList.remove('hidden');
  });

  // Cerrar Modales
  const cerrarModal = () => {
    modalServicio.classList.add('hidden');
    limpiarError();
  };
  btnCloseModal.addEventListener('click', cerrarModal);
  btnCancelarModal.addEventListener('click', cerrarModal);

  const cerrarModalEliminar = () => {
    modalEliminar.classList.add('hidden');
    servicioAEliminarId = null;
    limpiarError();
  };
  btnCloseModalEliminar.addEventListener('click', cerrarModalEliminar);
  btnCancelarEliminar.addEventListener('click', cerrarModalEliminar);

  // Confirmar Eliminación: si falla, el modal sigue abierto mostrando el aviso
  btnConfirmarEliminar.addEventListener('click', async () => {
    if (servicioAEliminarId) {
      const ok = await eliminarServicio(servicioAEliminarId);
      if (ok) cerrarModalEliminar();
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
  gridServicios.innerHTML = '<p class="estado-vacio">Cargando servicios desde Supabase...</p>';
  paginacionContainer.innerHTML = '';
  paginacionContainer.style.display = 'none';

  try {
    const { data, error } = await supabase
      .from('servicios')
      .select('id, nombre, descripcion, duracion_estimada_min, created_at')
      .eq('activo', true) // borrado lógico: los desactivados no se muestran
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
    const pError = document.createElement('p');
    pError.className = 'estado-vacio estado-error';
    pError.textContent = `No se pudieron cargar los servicios. ${traducirError(err)}`;
    gridServicios.replaceChildren(pError);
  }
}

// ------------------------------------------------------------------
// 2. RENDERIZAR TARJETAS Y PAGINACIÓN
// ------------------------------------------------------------------
function renderTarjetas() {
  gridServicios.innerHTML = '';

  if (serviciosFiltrados.length === 0) {
    gridServicios.innerHTML = '<p class="estado-vacio">No se encontraron servicios.</p>';
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
            <span class="servicio-nombre"></span>
          </div>
          <div class="card-acciones">
            <button class="btn-edit-circle btn-editar-card" title="Editar servicio">✏️</button>
            <button class="btn-delete-circle btn-eliminar-card" title="Eliminar servicio">🗑️</button>
          </div>
        </div>
        <div class="desc-box-ruta">
          <strong>Descripción:</strong><br>
          <span class="servicio-descripcion"></span>
        </div>
      </div>
      <div class="card-ruta-footer">
        <div>🕒 Tiempo estimado en minutos: <strong class="servicio-duracion"></strong></div>
      </div>
    `;

    // Los datos de la BD se asignan con textContent: el navegador los trata como texto, nunca como HTML (evita XSS almacenado)
    card.querySelector('.servicio-nombre').textContent = s.nombre;
    card.querySelector('.servicio-descripcion').textContent = s.descripcion || 'Sin descripción disponible.';
    card.querySelector('.servicio-duracion').textContent = `${s.duracion_estimada_min || 0} min`;

    // aria-label con el nombre del servicio (dato de la BD, por eso se asigna aquí y no en la plantilla)
    card.querySelector('.btn-editar-card').setAttribute('aria-label', `Editar servicio ${s.nombre}`);
    card.querySelector('.btn-eliminar-card').setAttribute('aria-label', `Eliminar servicio ${s.nombre}`);

    // Clic Editar
    card.querySelector('.btn-editar-card').addEventListener('click', () => {
      inputId.value = s.id;
      inputNombre.value = s.nombre;
      inputDescripcion.value = s.descripcion || '';
      inputTiempo.value = s.duracion_estimada_min || 0;

      limpiarError();
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
  limpiarError();

  // El formulario usa "novalidate": todas las validaciones se hacen aquí y se avisan en el modal, en español
  if (!inputNombre.value.trim()) {
    mostrarError('El nombre del servicio es obligatorio.');
    return;
  }

  // La descripción es obligatoria (trim: solo espacios cuenta como vacía)
  const descripcion = inputDescripcion.value.trim();
  if (!descripcion) {
    mostrarError('La descripción del servicio es obligatoria.');
    return;
  }

  // Number() (no parseInt) para que 1.5 NO se trunque a 1 en silencio: se rechaza
  const duracion = Number(inputTiempo.value);
  if (!Number.isInteger(duracion) || duracion < 1 || duracion > DURACION_MAX_MIN) {
    mostrarError(`El tiempo estimado debe ser un número entero de minutos, entre 1 y ${DURACION_MAX_MIN}.`);
    return;
  }

  const payload = {
    nombre: inputNombre.value.trim(),
    descripcion,
    duracion_estimada_min: duracion
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
    mostrarError('No se pudo guardar el servicio. ' + traducirError(err));
  }
}

// BORRADO LÓGICO: no se borra la fila, solo se marca activo = false.
// Devuelve true si se eliminó; si falla, muestra el aviso en el modal y devuelve false
async function eliminarServicio(id) {
  try {
    // 1. No se permite si el servicio tiene contratos activos
    const { count, error: errorConteo } = await supabase
      .from('condominio_servicio')
      .select('id', { count: 'exact', head: true })
      .eq('servicio_id', id)
      .eq('activo', true);

    if (errorConteo) throw errorConteo;

    if (count > 0) {
      const texto = count === 1 ? '1 contrato activo' : `${count} contratos activos`;
      mostrarErrorEliminar(`No se puede eliminar: este servicio tiene ${texto}. Primero elimina sus contratos.`);
      return false;
    }

    // 2. Desactivar. select('id') confirma que sí se actualizó una fila
    //    (si RLS lo bloquea, Supabase no da error, solo devuelve 0 filas)
    const { data, error } = await supabase
      .from('servicios')
      .update({ activo: false })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data?.length) throw { code: '42501' };

    await cargarServicios();
    return true;
  } catch (err) {
    mostrarErrorEliminar('No se pudo eliminar el servicio. ' + traducirError(err));
    return false;
  }
}