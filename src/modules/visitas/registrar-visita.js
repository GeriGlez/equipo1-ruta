import { guardarVisita } from './db-local.js';

  const formulario = document.querySelector('#visit-form');
  const botonGuardar = document.querySelector('#save-visit');

  // ============================================
// HU-10 - Lecturas según el área
// ============================================

const selectorArea = document.querySelector('#visit-area');
const mensajeLecturas = document.querySelector('#readings-info');
const lecturasAlberca = document.querySelector('#pool-readings');

const campoPh = document.querySelector('#ph-reading');
const campoCloro = document.querySelector('#chlorine-reading');

function actualizarLecturasPorArea() {

  const esAlberca = selectorArea.value === 'alberca';

  // Alberca: mostrar campos de lectura
  lecturasAlberca.hidden = !esAlberca;

  // Otras áreas: mostrar mensaje informativo
  mensajeLecturas.hidden = esAlberca;

  campoPh.disabled = !esAlberca;
  campoCloro.disabled = !esAlberca;

  // Evitar conservar lecturas si el técnico
  // cambia de Alberca a otra área
  if (!esAlberca) {
    campoPh.value = '';
    campoCloro.value = '';
  }
}

selectorArea.addEventListener(
  'change',
  actualizarLecturasPorArea
);

// Aplicar el estado correcto al cargar la pantalla
actualizarLecturasPorArea();

  formulario.addEventListener('submit', async (event) => {

    // Evita que la página se recargue
    event.preventDefault();

    const areaSeleccionada = selectorArea.value;
    const esAlberca = areaSeleccionada === 'alberca';

    const valorPh = campoPh.value.trim();
    const valorCloro = campoCloro.value.trim();

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

      area_tipo: areaSeleccionada,

      hora_entrada: entrada,

      hora_salida: salida,

      observaciones: document
        .querySelector('#observations').value.trim(),

      quien_recibio: document
        .querySelector('#received-by').value.trim(),

      ph:
        esAlberca && valorPh !== ''
          ? Number(valorPh)
          : null,

      cloro:
        esAlberca && valorCloro !== ''
          ? Number(valorCloro)
          : null

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

      // Restablecer el formulario después de guardar
      formulario.reset();

      // Regresar la sección de lecturas a su estado inicial
      actualizarLecturasPorArea();

      // Restablecer el contador de observaciones
      const contadorObservaciones =
        document.querySelector('#observations-counter');

      if (contadorObservaciones) {
        contadorObservaciones.textContent = '0/500';
      }

      // Permitir capturar una nueva visita
      botonGuardar.disabled = false;

    } catch (error) {

      console.error('Error al guardar visita:', error);

      alert('No se pudo guardar la visita.');

      botonGuardar.disabled = false;

    }

  });
