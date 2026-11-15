// ==============================================
// RUTA - MÓDULO 6 (HU-11) – Ventana "Agregar Insumo"
// ==============================================
(function () {
  // Ejecutar init tan pronto como el documento esté listo. Si la página ya está cargada, llamarlo de inmediato.
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
    const errorAgregar = document.getElementById('agregar-error');
    const campoNombre  = document.getElementById('nuevo-nombre');
    const campoUnidad  = document.getElementById('nueva-unidad');
    const campoExist   = document.getElementById('nueva-existencia');

    if (!dialogo || !botonAbrir) {
      console.error('[RUTA] No se encontró la ventana o el botón de agregar.');
      return;
    }

    /** Flag para distinguir cierre por usuario vs. cierre automático */
    let cierreAutorizado = false;

    // -----------------------------------------------------------------
    //   Apertura / Cierre del dialog
    // -----------------------------------------------------------------
    function abrir() {
      if (dialogo.open) return;

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

    // -----------------------------------------------------------------
    //   Guardar insumo
    // -----------------------------------------------------------------
    async function guardar() {
      // Validar campos mínimos
      const nombre = campoNombre.value.trim();
      const unidad = campoUnidad.value.trim();
      const existencia = campoExist.value.trim();

      if (!nombre || !unidad || !existencia) {
        errorAgregar.textContent = 'Completa todos los campos.';
        errorAgregar.hidden = false;
        return;
      }

      // Cargar el servicio bajo demanda (funciona offline)
      let crearInsumo;
      try {
        const srv = await import('./insumos-service.js');
        crearInsumo = srv.crearInsumo;
      } catch (e) {
        console.warn('[RUTA] No se pudo cargar supabase; se usará el catálogo local.');
        errorAgregar.textContent = 'No hay conexión con el servidor.';
        errorAgregar.hidden = false;
        return;
      }

      try {
        await crearInsumo({
          nombre,
          unidad,
          existencia: Number(existencia)
        });

        // Éxito: limpiar, cerrar y notificar al catálogo
        formulario.reset();
        cerrar();
        // Notificar al catálogo‑insumos.js para que recargue la tabla
        window.dispatchEvent(new CustomEvent('insumo-guardado'));
      } catch (err) {
        console.error('[RUTA] Error al crear insumo', err);
        const mensaje = err?.message || 'Error inesperado al guardar.';
        errorAgregar.textContent = mensaje;
        errorAgregar.hidden = false;
      }
    }

    // Interceptar el envío del formulario (evita recarga)
    formulario.addEventListener('submit', function (evento) {
      evento.preventDefault();
      guardar();
    });

    // Exportar la API para que otros scripts la usen
    window.RUTA_modalAgregar = {
      abrir,
      cerrar,
      guardar // opcional: invocable desde fuera
    };
  }
})();
