// ==============================================
// RUTA - MÓDULO 6 (HU-11) – Ventana "Agregar / Editar Insumo"
//
// Este archivo solo controla la ventana: abrirla, cerrarla y
// cambiar entre modo "crear" y modo "editar". El envío del
// formulario (validar, crear o actualizar en Supabase) lo
// resuelve un único manejador en catalogo-insumos.js.
// ==============================================
(function () {
  if (document.readyState === 'loading' || document.readyState === 'interactive') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }


  function init() {
    const dialogo      = document.getElementById('dialogo-agregar');
    const formulario   = document.getElementById('form-agregar');
    const botonAbrir   = document.getElementById('abrir-agregar');
    const botonCerrar  = document.getElementById('cerrar-agregar');
    const titulo       = document.getElementById('titulo-agregar');
    const botonEnviar  = document.getElementById('guardar-insumo');
    const errorAgregar = document.getElementById('agregar-error');
    const campoNombre  = document.getElementById('nuevo-nombre');
    const campoUnidad  = document.getElementById('nueva-unidad');
    const campoExist   = document.getElementById('nueva-existencia');

    if (!dialogo || !botonAbrir) {
      console.error('[RUTA] No se encontró la ventana o el botón de agregar.');
      return;
    }

    const TEXTOS = {
      crear:  { titulo: 'Agregar Insumo', boton: 'AGREGAR INSUMO' },
      editar: { titulo: 'Editar Insumo',  boton: 'GUARDAR CAMBIOS' }
    };

    /** Estado del formulario: ¿se crea uno nuevo o se edita uno existente? */
    const estado = { modo: 'crear', id: null };

    /** Flag para distinguir cierre por usuario vs. cierre automático */
    let cierreAutorizado = false;

    // -----------------------------------------------------------------
    //   Apertura / Cierre del dialog
    // -----------------------------------------------------------------
    function preparar(modo, insumo) {
      estado.modo = modo;
      estado.id = modo === 'editar' ? insumo.id : null;

      titulo.textContent = TEXTOS[modo].titulo;
      botonEnviar.textContent = TEXTOS[modo].boton;
      botonEnviar.disabled = false;

      formulario.reset();
      errorAgregar.textContent = '';
      errorAgregar.hidden = true;

      if (modo === 'editar') {
        campoNombre.value = insumo.nombre ?? '';
        campoUnidad.value = insumo.unidad ?? '';
        campoExist.value = insumo.existencia ?? '';
      }
    }

    function mostrar() {
      cierreAutorizado = false;

      if (typeof dialogo.showModal === 'function') {
        dialogo.showModal();          // capa superior: queda encima de todo
      } else {
        dialogo.setAttribute('open', '');   // navegadores sin <dialog>
      }

      campoNombre.focus();
    }

    function abrir() {
      if (dialogo.open) return;
      preparar('crear');
      mostrar();
    }

    function abrirEdicion(insumo) {
      if (dialogo.open || !insumo) return;
      preparar('editar', insumo);
      mostrar();
    }

    function cerrar() {
      cierreAutorizado = true;
      if (typeof dialogo.close === 'function') {
        dialogo.close();
      } else {
        dialogo.removeAttribute('open');
      }
    }

    botonAbrir.addEventListener('click', abrir);
    botonCerrar.addEventListener('click', cerrar);

    // -----------------------------------------------------------------
    //   Evitar que ESC cierre el dialog sin que lo autoricemos
    // -----------------------------------------------------------------
    dialogo.addEventListener('cancel', function (evento) {
      evento.preventDefault();   // no cerrar con Esc
    });

    // Si el navegador cierra el dialog por otra vía, lo reabrimos
    dialogo.addEventListener('close', function () {
      if (!cierreAutorizado && typeof dialogo.showModal === 'function') {
        dialogo.showModal();
      }
    });

    // Exportar la API para que catalogo-insumos.js la use
    window.RUTA_modalAgregar = {
      abrir,
      abrirEdicion,
      cerrar,
      obtenerEstado: () => ({ ...estado })
    };
  }
})();
