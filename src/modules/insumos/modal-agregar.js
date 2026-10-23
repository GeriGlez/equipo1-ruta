// ==============================================
// RUTA - MÓDULO 6 (HU-11)
// Ventana "Agregar Insumo"
//
// Es un script CLÁSICO (no módulo) a propósito:
// funciona aunque la página se abra con doble clic
// (file://) o aunque falle la carga de Supabase.
// La ventana se abre con el botón y SOLO se cierra
// con la X (o cuando el insumo se agrega con éxito).
// ==============================================

(function () {

  var dialogo = document.getElementById('dialogo-agregar');
  var formulario = document.getElementById('form-agregar');
  var botonAbrir = document.getElementById('abrir-agregar');
  var botonCerrar = document.getElementById('cerrar-agregar');
  var errorAgregar = document.getElementById('agregar-error');
  var campoNombre = document.getElementById('nuevo-nombre');

  if (!dialogo || !botonAbrir) {
    console.error('[RUTA] No se encontró la ventana o el botón de agregar.');
    return;
  }

  var cierreAutorizado = false;

  function abrir() {

    if (dialogo.open) {
      return;
    }

    formulario.reset();
    errorAgregar.textContent = '';
    errorAgregar.hidden = true;

    cierreAutorizado = false;

    if (typeof dialogo.showModal === 'function') {
      dialogo.showModal();          // capa superior: queda encima de todo
    } else {
      dialogo.setAttribute('open', '');   // navegadores sin <dialog>
    }

    campoNombre.focus();

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

  // Esc no cierra la ventana
  dialogo.addEventListener('cancel', function (evento) {
    evento.preventDefault();
  });

  // Si el navegador la cierra por otra vía, se vuelve a abrir
  dialogo.addEventListener('close', function () {

    if (!cierreAutorizado && typeof dialogo.showModal === 'function') {
      dialogo.showModal();
    }

  });

  // El envío nunca recarga ni cierra la página
  formulario.addEventListener('submit', function (evento) {
    evento.preventDefault();
  });

  // Para que catalogo-insumos.js pueda cerrarla tras guardar
  window.RUTA_modalAgregar = { abrir: abrir, cerrar: cerrar };

})();
