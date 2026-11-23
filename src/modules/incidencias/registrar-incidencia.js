
import {
  guardarIncidenciaLocal,
  marcarIncidenciaComoEnviada,
  obtenerCatalogoM7
} from '../pendientes_sync/db-local.js';

import { supabase } from '../../services/supabase.js';

import { getActiveSession, obtenerSesionRemotaVerificada } from '../auth/authService.js';


const form = document.getElementById('formIncidencia');
const statusText = document.getElementById('connection-status');
const selectVisita = document.getElementById('visita_id');

// Nuevas referencias a los inputs ocultos y visibles
const inputCondominioId = document.getElementById('condominio_id');
const inputCondominioNombre = document.getElementById('condominio_nombre');
const inputAreaId = document.getElementById('area_id');
const inputAreaNombre = document.getElementById('area_nombre');

// 1. Interceptor de conexión a red
const actualizarEstadoRed = () => {
  if (navigator.onLine) {
    statusText.innerHTML = '<span class="m7-connection-dot" style="background-color: #4caf50;"></span> Conectado';
  } else {
    statusText.innerHTML = '<span class="m7-connection-dot" style="background-color: #f44336;"></span> Guardado local (Offline)';
  }
};

window.addEventListener('online', actualizarEstadoRed);
window.addEventListener('offline', actualizarEstadoRed);


let guardandoIncidencia = false;

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Evitar envíos simultáneos por doble clic.
  if (guardandoIncidencia) return;

  guardandoIncidencia = true;

  const botonGuardar = document.getElementById('save-incidencia');
  if (botonGuardar) botonGuardar.disabled = true;

  let incidenciaLocal = null;

  try {
    const sesion = await getActiveSession();

    if (
      sesion?.usuario?.rol !== 'tecnico' ||
      !sesion?.user?.id
    ) {
      throw new Error('No hay una sesión técnica válida.');
    }

    const visitaId = Number(selectVisita.value);
    const condominioId = Number(inputCondominioId.value);
    const areaId = Number(inputAreaId.value);
    const descripcion = document
      .getElementById('descripcion')
      .value.trim();

    if (
      !Number.isSafeInteger(visitaId) || visitaId <= 0 ||
      !Number.isSafeInteger(condominioId) || condominioId <= 0 ||
      !Number.isSafeInteger(areaId) || areaId <= 0 ||
      !descripcion
    ) {
      alert('Completa correctamente los datos de la incidencia.');
      return;
    }

    const datosIncidencia = {
      visita_id: visitaId,
      condominio_id: condominioId,
      area_id: areaId,
      descripcion,
      prioridad: document.getElementById('prioridad').value,
      reportada_por: sesion.user.id
    };

    // Primera operación: persistencia local.
    incidenciaLocal = await guardarIncidenciaLocal(datosIncidencia);

    // Una vez guardada, podemos limpiar el formulario.
    form.reset();
    document.getElementById('descripcion-counter').textContent = '0/500';

    if (!navigator.onLine) {
      alert('Incidencia guardada localmente. Pendiente de sincronización.');
      return;
    }

    // Nunca enviar sin una sesión remota verificada.
    const sesionRemota = await obtenerSesionRemotaVerificada(
      sesion.usuario.id
    );

    if (
      !sesionRemota ||
      String(sesionRemota.user.id) !==
        String(incidenciaLocal.reportada_por)
    ) {
      alert(
        'Incidencia guardada en el dispositivo. ' +
        'Podrás sincronizarla cuando exista una sesión remota válida.'
      );
      return;
    }

    const datosServidor = {
      id_local: incidenciaLocal.id_local,
      visita_id: incidenciaLocal.visita_id,
      condominio_id: incidenciaLocal.condominio_id,
      area_id: incidenciaLocal.area_id,
      descripcion: incidenciaLocal.descripcion,
      prioridad: incidenciaLocal.prioridad,
      reportada_por: incidenciaLocal.reportada_por
    };

    // Envío inmediato usando el UUID ya guardado.
    const { data, error } = await supabase
      .from('incidencias')
      .insert(datosServidor)
      .select('id')
      .single();

    if (error) throw error;

    if (!data?.id) {
      throw new Error('Supabase no confirmó el ID de la incidencia.');
    }

    // Marcar como enviada solo después de confirmar el servidor.
    await marcarIncidenciaComoEnviada(
      incidenciaLocal.id,
      data.id
    );

    alert('Incidencia registrada y sincronizada correctamente.');

  } catch (error) {
    console.error('[RUTA] Error al registrar incidencia:', error);

    if (incidenciaLocal) {
      alert(
        'La incidencia permanece guardada en el dispositivo. ' +
        'No la registres nuevamente; utiliza Pendientes de sincronización.'
      );
    } else {
      alert(
        'No fue posible guardar la incidencia. ' +
        'Los datos permanecen en el formulario.'
      );
    }

  } finally {
    guardandoIncidencia = false;
    if (botonGuardar) botonGuardar.disabled = false;
  }
});


// 3. Cargar Visitas (Lectura 100% Offline)
const cargarVisitas = async () => {
  try {
    const sesion = await getActiveSession();

    if (sesion?.usuario?.rol !== 'tecnico') {
      throw new Error('No hay una sesión técnica activa.');
    }

    const catalogo = await obtenerCatalogoM7();

    const visitas = catalogo.filter(
      visita =>
        String(visita.tecnico_id) ===
        String(sesion.usuario.id)
    );

    selectVisita.innerHTML = '<option value="" selected disabled>Selecciona el número de visita</option>';
    
    visitas.forEach(visita => {
      const option = document.createElement('option');
      option.value = visita.id;
      option.textContent = `Visita #${visita.id}`;
      
      const orden = visita.ordenes_servicio;
      if (orden) {
        option.dataset.condominioId = orden.condominio_id;
        option.dataset.areaId = orden.area_id;
        option.dataset.condominioNombre = orden.condominios ? orden.condominios.nombre : 'Desconocido';
        option.dataset.areaNombre = orden.areas ? orden.areas.nombre : 'Desconocida';
      }
      
      selectVisita.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar las visitas desde IndexedDB:', error);
  }
};

// 4. Autocompletado (Instantáneo y 100% offline-friendly)
selectVisita.addEventListener('change', (e) => {
  const opcionSeleccionada = e.target.options[e.target.selectedIndex];
  
  const idCondominio = opcionSeleccionada.dataset.condominioId;
  const idArea = opcionSeleccionada.dataset.areaId;

  if (idCondominio && idArea) {
    inputCondominioId.value = idCondominio;
    inputAreaId.value = idArea;

    inputCondominioNombre.value = opcionSeleccionada.dataset.condominioNombre;
    inputAreaNombre.value = opcionSeleccionada.dataset.areaNombre;
  }
});

async function mostrarNombreTecnico() {
  const elementoNombre = document.querySelector('.m5-user strong');

  if (!elementoNombre) return;

  try {
    const sesion = await getActiveSession();

    if (sesion?.usuario?.rol === 'tecnico') {
      elementoNombre.textContent =
        sesion.usuario.nombre?.trim() || 'Técnico';
    }
  } catch (error) {
    console.warn(
      '[RUTA] No se pudo recuperar el nombre del técnico:',
      error
    );
  }
}

// 5. Inicialización
actualizarEstadoRed();
mostrarNombreTecnico();
cargarVisitas();