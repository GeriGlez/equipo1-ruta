import {
    obtenerVisitasPendientes
  } from './db-local.js';

  const contador = document.querySelector('#pending-count');
  const mensaje = document.querySelector('#pending-message');
  const lista = document.querySelector('#pending-list');
  const errorMensaje = document.querySelector('#pending-error');

  // Nombres visibles de las áreas
  const nombresAreas = {
    alberca: 'Alberca',
    jardin: 'Jardín',
    'area-comun': 'Área común',
    equipo: 'Equipo'
  };

  async function cargarPendientes() {

    try {

      const visitas = await obtenerVisitasPendientes();

      // Actualizar contador
      const cantidad = visitas.length;

      contador.textContent = cantidad === 1
        ? '1 registro pendiente'
        : `${cantidad} registros pendientes`;

      mensaje.textContent = cantidad > 0
        ? 'Estos registros están pendientes de envío.'
        : 'No hay nada que sincronizar';

      // Limpiar contenido anterior
      lista.replaceChildren();
      errorMensaje.hidden = true;

      // Generar tarjetas
      visitas.forEach(visita => {

        const tarjeta = document.createElement('article');

        tarjeta.className = 'm5-pending-card';

        tarjeta.innerHTML = `
          <div class="m5-pending-card-main">

            <div class="m5-pending-card-icon">
              <img
                src="/hoja-de-calculo.png"
                alt=""
              >
            </div>

            <div class="m5-pending-card-info">

              <div class="m5-pending-card-header">
                <strong>Visita</strong>
                <span class="m5-pending-badge">
                  Pendiente
                </span>
              </div>

              <h3 class="m5-pending-order"></h3>

              <p class="m5-pending-area"></p>

            </div>

          </div>

          <div class="m5-pending-card-footer">
            <span class="m5-pending-date"></span>
            <span class="m5-pending-hours"></span>
          </div>
        `;

        // Insertar los datos almacenados
        tarjeta.querySelector('.m5-pending-order')
          .textContent = visita.orden_referencia
            || 'Orden sin referencia';

        tarjeta.querySelector('.m5-pending-area')
          .textContent = nombresAreas[visita.area_tipo]
            || visita.area_tipo
            || 'Área no especificada';

        tarjeta.querySelector('.m5-pending-hours')
          .textContent =
            `${visita.hora_entrada} - ${visita.hora_salida}`;

        // Fecha de creación local
        const fecha = new Date(visita.creado_localmente_en);

        const fechaValida = !Number.isNaN(fecha.getTime());

        tarjeta.querySelector('.m5-pending-date')
          .textContent = fechaValida
            ? `Registrada: ${fecha.toLocaleDateString('es-MX')}`
            : 'Fecha no disponible';

        lista.appendChild(tarjeta);

      });

      console.log('Visitas pendientes cargadas:', cantidad);

    } catch (error) {

      console.error('Error consultando IndexedDB:', error);

      contador.textContent = 'No disponible';

      mensaje.textContent =
        'No fue posible cargar los registros locales.';

      errorMensaje.hidden = false;

    }

  }

  cargarPendientes();