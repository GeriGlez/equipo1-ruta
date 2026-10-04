import { guardarVisita } from './db-local.js';

  const formulario = document.querySelector('#visit-form');
  const botonGuardar = document.querySelector('#save-visit');

  formulario.addEventListener('submit', async (event) => {

    // Evita que la página se recargue
    event.preventDefault();

    // Valida los campos HTML
    if (!formulario.reportValidity()) {
      return;
    }

    const entrada = document.querySelector('#entry-time').value;
    const salida = document.querySelector('#exit-time').value;

    // Ambos horarios deben estar presentes
    if (!entrada || !salida) {
      alert('Ingresa las horas de entrada y salida.');
      return;
    }

    // Datos capturados en el formulario
    const datosVisita = {

      orden_referencia: document
        .querySelector('#order-number')
        .textContent.trim(),

      area_tipo: document.querySelector('#visit-area').value,

      hora_entrada: entrada,

      hora_salida: salida,

      observaciones: document
        .querySelector('#observations').value.trim(),

      quien_recibio: document
        .querySelector('#received-by').value.trim(),

      ph: null,

      cloro: null

    };

    // Evita envíos repetidos mientras se guarda
    botonGuardar.disabled = true;

    try {

      const visita = await guardarVisita(datosVisita);

      console.log('Visita guardada:', visita);

      alert(
        'Visita guardada en este dispositivo. ' +
        'Pendiente de sincronización.'
      );

      // Evita guardar nuevamente el mismo formulario
      botonGuardar.textContent = 'Visita guardada';

    } catch (error) {

      console.error('Error al guardar visita:', error);

      alert('No se pudo guardar la visita.');

      botonGuardar.disabled = false;

    }

  });
