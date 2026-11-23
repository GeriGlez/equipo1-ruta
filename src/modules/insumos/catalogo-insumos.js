// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Catálogo de insumos (administrador)
// ==============================================

// Los módulos que usan Supabase se cargan bajo demanda:
// así el botón "Agregar Insumo" y la ventana siempre responden,
// aunque la conexión o la sesión tarden o fallen.

// ---------- Elementos ----------
const cuerpo = document.querySelector('#insumos-body');
const buscador = document.querySelector('#buscar-insumo');
const errorCatalogo = document.querySelector('#catalogo-error');

const formulario = document.querySelector('#form-agregar');
const botonGuardar = document.querySelector('#guardar-insumo');
const errorAgregar = document.querySelector('#agregar-error');

const campoNombre = document.querySelector('#nuevo-nombre');
const campoUnidad = document.querySelector('#nueva-unidad');
const campoExistencia = document.querySelector('#nueva-existencia');

let catalogo = [];
let guardando = false;

// ---------- Utilidades ----------
function formatearNumero(valor) {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(valor) || 0);
}

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mostrarMensaje(elemento, texto) {
  elemento.textContent = texto || '';
  elemento.hidden = !texto;
}

// ---------- Tabla ----------
function crearFila(insumo) {
  const fila = document.createElement('tr');

  const valores = [
    insumo.id,
    insumo.nombre,
    formatearNumero(insumo.existencia),
    insumo.unidad
  ];

  valores.forEach(valor => {
    const celda = document.createElement('td');
    celda.textContent = valor;
    fila.append(celda);
  });

  const celdaAcciones = document.createElement('td');
  const botonEditar = document.createElement('button');
  botonEditar.type = 'button';
  botonEditar.className = 'ins-edit-button';
  botonEditar.dataset.editar = String(insumo.id);
  botonEditar.textContent = 'Editar';
  botonEditar.setAttribute('aria-label', `Editar insumo ${insumo.nombre}`);
  celdaAcciones.append(botonEditar);
  fila.append(celdaAcciones);

  return fila;
}

function renderizar() {
  const texto = normalizar(buscador.value);

  const visibles = catalogo.filter(insumo => {
    if (!texto) {
      return true;
    }
    return normalizar(`${insumo.id} ${insumo.nombre}`).includes(texto);
  });

  cuerpo.replaceChildren();

  if (!visibles.length) {
    const fila = document.createElement('tr');
    const celda = document.createElement('td');
    celda.colSpan = 5;
    celda.className = 'ins-empty';
    celda.textContent = catalogo.length
      ? 'Ningún insumo coincide con la búsqueda.'
      : 'Aún no hay insumos registrados.';
    fila.append(celda);
    cuerpo.append(fila);
    return;
  }

  cuerpo.append(...visibles.map(crearFila));
}

// ---------- Modal ----------
function cerrarModal() {
  window.RUTA_modalAgregar?.cerrar();
}

// Botón "Editar": se delega en el cuerpo de la tabla
cuerpo.addEventListener('click', evento => {
  const boton = evento.target.closest('[data-editar]');
  if (!boton) {
    return;
  }

  const insumo = catalogo.find(i => String(i.id) === boton.dataset.editar);
  if (insumo) {
    window.RUTA_modalAgregar?.abrirEdicion(insumo);
  }
});

// Único manejador de envío: crea o edita según el modo del modal
formulario.addEventListener('submit', async evento => {
  evento.preventDefault();

  if (guardando) {
    return;
  }

  const { modo, id } = window.RUTA_modalAgregar?.obtenerEstado() ?? { modo: 'crear', id: null };
  const editando = modo === 'editar';

  const nombre = campoNombre.value.trim();
  const unidad = campoUnidad.value.trim();
  const existencia = Number(campoExistencia.value);

  if (!nombre || !unidad) {
    mostrarMensaje(errorAgregar, 'Escribe el nombre y la unidad del insumo.');
    return;
  }

  if (
    campoExistencia.value === '' ||
    !Number.isFinite(existencia) ||
    existencia < 0
  ) {
    mostrarMensaje(errorAgregar, 'La existencia debe ser un número igual o mayor a 0.');
    return;
  }

  // Al editar se ignora el propio registro para poder guardar sin cambiar el nombre
  const duplicado = catalogo.some(i =>
    (!editando || String(i.id) !== String(id)) &&
    normalizar(i.nombre) === normalizar(nombre)
  );

  if (duplicado) {
    mostrarMensaje(errorAgregar, 'Ya existe un insumo con ese nombre.');
    return;
  }

  if (!navigator.onLine) {
    mostrarMensaje(
      errorAgregar,
      editando
        ? 'Necesitas conexión para editar insumos del catálogo.'
        : 'Necesitas conexión para agregar insumos al catálogo.'
    );
    return;
  }

  guardando = true;
  botonGuardar.disabled = true;
  mostrarMensaje(errorAgregar, '');

  try {
    if (editando) {
      const { actualizarInsumo } = await import('./insumos-service.js');
      const actualizado = await actualizarInsumo({ id, nombre, unidad, existencia });
      catalogo = catalogo.map(i => String(i.id) === String(id) ? actualizado : i);
    } else {
      const { crearInsumo } = await import('./insumos-service.js');
      const nuevo = await crearInsumo({ nombre, unidad, existencia });
      catalogo.push(nuevo);
    }

    renderizar();
    cerrarModal();
  } catch (error) {
    console.error(`[RUTA] Error al ${editando ? 'editar' : 'agregar'} insumo:`, error);
    mostrarMensaje(
      errorAgregar,
      error?.code === '23505'
        ? 'Ya existe un insumo con ese nombre.'
        : `No fue posible ${editando ? 'guardar los cambios del' : 'agregar el'} insumo. Intenta de nuevo.`
    );
  } finally {
    guardando = false;
    botonGuardar.disabled = false;
  }
});

// ---------- Inicio ----------
buscador.addEventListener('input', renderizar);

async function iniciar() {
  const { getActiveSession } = await import('../auth/authService.js');
  const sesion = await getActiveSession();

  if (!sesion || sesion.usuario?.rol !== 'administrador') {
    mostrarMensaje(errorCatalogo, 'Inicia sesión como administrador para ver y editar el catálogo.');
    renderizar();
    return;
  }

  document.querySelector('#admin-name').textContent = sesion.usuario.nombre || 'Usuario';

  if (!navigator.onLine) {
    mostrarMensaje(errorCatalogo, 'Sin conexión: el catálogo del administrador requiere internet.');
    renderizar();
    return;
  }

  try {
    const { listarCatalogoServidor } = await import('./insumos-service.js');
    catalogo = await listarCatalogoServidor();
  } catch (error) {
    console.error('[RUTA] Error al cargar el catálogo:', error);
    mostrarMensaje(errorCatalogo, 'No fue posible cargar el catálogo de insumos.');
  }

  renderizar();
}

iniciar().catch(error => {
  console.error('[RUTA] Error al iniciar el catálogo:', error);
  mostrarMensaje(errorCatalogo, 'No fue posible cargar el catálogo de insumos.');
  renderizar();
});
