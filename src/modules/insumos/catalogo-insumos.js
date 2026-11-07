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
const filtroTipo = document.querySelector('#filtro-tipo');
const filtroEstado = document.querySelector('#filtro-estado');
const filtroUnidad = document.querySelector('#filtro-unidad');
const errorCatalogo = document.querySelector('#catalogo-error');

const formulario = document.querySelector('#form-agregar');
const botonGuardar = document.querySelector('#guardar-insumo');
const errorAgregar = document.querySelector('#agregar-error');

const campoNombre = document.querySelector('#nuevo-nombre');
const campoUnidad = document.querySelector('#nueva-unidad');
const campoExistencia = document.querySelector('#nueva-existencia');

let catalogo = [];


// ---------- Utilidades ----------
const ETIQUETAS_ESTADO = {
  disponible: 'Disponible',
  agotado: 'Agotado',
  inactivo: 'Inactivo'
};

function estadoDe(insumo) {

  if (insumo.activo === false) {
    return 'inactivo';
  }

  return Number(insumo.stock) > 0 ? 'disponible' : 'agotado';

}

function formatearNumero(valor) {

  return new Intl.NumberFormat('es-MX', {
    maximumFractionDigits: 2
  }).format(Number(valor) || 0);

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


// ---------- Filtros dinámicos ----------
function llenarSelect(select, valores) {

  const seleccionado = select.value;
  const primera = select.options[0];

  select.replaceChildren(primera);

  [...new Set(valores.filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .forEach(valor => select.append(new Option(valor, valor)));

  select.value = [...select.options].some(o => o.value === seleccionado)
    ? seleccionado
    : '';

}

function actualizarFiltros() {

  llenarSelect(filtroTipo, catalogo.map(i => i.tipo));
  llenarSelect(filtroUnidad, catalogo.map(i => i.unidad));

}


// ---------- Tabla ----------
function crearFila(insumo) {

  const fila = document.createElement('tr');
  const estado = estadoDe(insumo);

  const valores = [
    insumo.id,
    insumo.nombre,
    formatearNumero(insumo.stock),
    formatearNumero(insumo.cantidad),
    insumo.unidad,
    null,
    insumo.descripcion || '—'
  ];

  valores.forEach((valor, indice) => {

    const celda = document.createElement('td');

    if (indice === 5) {

      const etiqueta = document.createElement('span');
      etiqueta.className = `ins-badge ins-badge--${estado}`;
      etiqueta.textContent = ETIQUETAS_ESTADO[estado];
      celda.append(etiqueta);

    } else {

      celda.textContent = valor;

    }

    fila.append(celda);

  });

  return fila;

}

function renderizar() {

  const texto = normalizar(buscador.value);

  const visibles = catalogo.filter(insumo => {

    if (filtroTipo.value && insumo.tipo !== filtroTipo.value) {
      return false;
    }

    if (filtroUnidad.value && insumo.unidad !== filtroUnidad.value) {
      return false;
    }

    if (filtroEstado.value && estadoDe(insumo) !== filtroEstado.value) {
      return false;
    }

    if (!texto) {
      return true;
    }

    return normalizar(
      `${insumo.id} ${insumo.nombre} ${insumo.descripcion || ''}`
    ).includes(texto);

  });

  cuerpo.replaceChildren();

  if (!visibles.length) {

    const fila = document.createElement('tr');
    const celda = document.createElement('td');

    celda.colSpan = 7;
    celda.className = 'ins-empty';
    celda.textContent = catalogo.length
      ? 'Ningún insumo coincide con los filtros.'
      : 'Aún no hay insumos registrados.';

    fila.append(celda);
    cuerpo.append(fila);
    return;

  }

  cuerpo.append(...visibles.map(crearFila));

}


// ---------- Modal ----------
// Abrir/cerrar vive en modal-agregar.js (script clásico).
function cerrarModal() {

  window.RUTA_modalAgregar?.cerrar();

}

formulario.addEventListener('submit', async evento => {

  evento.preventDefault();

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

  if (catalogo.some(i => normalizar(i.nombre) === normalizar(nombre))) {
    mostrarMensaje(errorAgregar, 'Ya existe un insumo con ese nombre.');
    return;
  }

  if (!navigator.onLine) {
    mostrarMensaje(errorAgregar, 'Necesitas conexión para agregar insumos al catálogo.');
    return;
  }

  botonGuardar.disabled = true;
  mostrarMensaje(errorAgregar, '');

  try {

    const { crearInsumo } = await import('./insumos-service.js');

    const nuevo = await crearInsumo({
      nombre,
      unidad,
      existencia
    });

    catalogo.push(nuevo);
    actualizarFiltros();
    renderizar();
    cerrarModal();

  } catch (error) {

    console.error('[RUTA] Error al agregar insumo:', error);

    mostrarMensaje(
      errorAgregar,
      error?.code === '23505'
        ? 'Ya existe un insumo con ese nombre.'
        : 'No fue posible agregar el insumo. Intenta de nuevo.'
    );

  } finally {

    botonGuardar.disabled = false;

  }

});


// ---------- Inicio ----------
[buscador, filtroTipo, filtroEstado, filtroUnidad].forEach(control => {
  control.addEventListener('input', renderizar);
});

async function iniciar() {

  const { getActiveSession } =
    await import('../auth/authService.js');

  const sesion = await getActiveSession();

  if (!sesion || sesion.usuario?.rol !== 'administrador') {

    mostrarMensaje(
      errorCatalogo,
      'Inicia sesión como administrador para ver y editar el catálogo.'
    );

    renderizar();
    return;

  }

  document.querySelector('#admin-name').textContent =
    sesion.usuario.nombre || 'Usuario';

  if (!navigator.onLine) {

    mostrarMensaje(
      errorCatalogo,
      'Sin conexión: el catálogo del administrador requiere internet.'
    );

    renderizar();
    return;

  }

  try {

    const { listarCatalogoServidor } =
      await import('./insumos-service.js');

    catalogo = await listarCatalogoServidor();

  } catch (error) {

    console.error('[RUTA] Error al cargar el catálogo:', error);

    mostrarMensaje(
      errorCatalogo,
      'No fue posible cargar el catálogo de insumos.'
    );

  }

  actualizarFiltros();
  renderizar();

}

iniciar().catch(error => {

  console.error('[RUTA] Error al iniciar el catálogo:', error);

  mostrarMensaje(
    errorCatalogo,
    'No fue posible cargar el catálogo de insumos.'
  );

  renderizar();

});
