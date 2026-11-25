import {
  guardarIncidenciaLocal,
  marcarIncidenciaComoEnviada,
  obtenerVisitasLocales,
  guardarVisitasServidor,
  obtenerContextoOrden
} from '../pendientes_sync/db-local.js';

import { supabase } from '../../services/supabase.js';

import {
  getActiveSession,
  obtenerSesionRemotaVerificada
} from '../auth/authService.js';

const form = document.getElementById('formIncidencia');
const statusText = document.getElementById('connection-status');
const selectVisita = document.getElementById('visita_id');

// Referencias a los inputs ocultos y visibles
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

// 2. Guardar incidencia
form.addEventListener('submit', async (e) => {
  e.preventDefault();

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

    const opcionSeleccionada = selectVisita.options[selectVisita.selectedIndex];
    const visitaLocalId = String(selectVisita.value || '').trim();
    const visitaServidorId = opcionSeleccionada?.dataset.visitaServidorId
      ? Number(opcionSeleccionada.dataset.visitaServidorId)
      : null;

    const condominioId = Number(inputCondominioId.value);
    const areaId = Number(inputAreaId.value);
    const descripcion = document.getElementById('descripcion').value.trim();

    if (
      !visitaLocalId ||
      !Number.isSafeInteger(condominioId) || condominioId <= 0 ||
      !Number.isSafeInteger(areaId) || areaId <= 0 ||
      !descripcion
    ) {
      alert('Completa correctamente los datos de la incidencia.');
      return;
    }

    const datosIncidencia = {
      visita_id: visitaServidorId,      // Número real si ya existe en Supabase, o null si es local
      visita_local_id: visitaLocalId,   // Referencia en IndexedDB ("servidor:15" o UUID)
      condominio_id: condominioId,
      area_id: areaId,
      descripcion,
      prioridad: document.getElementById('prioridad').value,
      reportada_por: sesion.user.id
    };

    // Primera operación: persistencia local en IndexedDB
    incidenciaLocal = await guardarIncidenciaLocal(datosIncidencia);

    // Limpiar formulario
    form.reset();
    inputCondominioNombre.value = '';
    inputAreaNombre.value = '';
    document.getElementById('descripcion-counter').textContent = '0/500';

    // Si no hay red O si la visita padre aún no se sube a Supabase,
    // dejamos la incidencia guardada localmente para sincronizarla en orden.
    if (!navigator.onLine || !incidenciaLocal.visita_id) {
      alert('Incidencia guardada localmente. Pendiente de sincronización.');
      return;
    }

    // Verificar sesión remota antes de enviar a Supabase
    const sesionRemota = await obtenerSesionRemotaVerificada(
      sesion.usuario.id
    );

    if (
      !sesionRemota ||
      String(sesionRemota.user.id) !== String(incidenciaLocal.reportada_por)
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

    const { data, error } = await supabase
      .from('incidencias')
      .insert(datosServidor)
      .select('id')
      .single();

    if (error) throw error;

    if (!data?.id) {
      throw new Error('Supabase no confirmó el ID de la incidencia.');
    }

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

// 3. Cargar Visitas desde IndexedDB (sincronizadas y locales)
// Helpers para validar si la visita pertenece al día actual (hora local)
function fechaLocal(valor) {
  if (!valor) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) return String(valor);

  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return null;

  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
}

function esVisitaDeHoy(visita) {
  const diaVisita = fechaLocal(
    visita.fecha_visita_en || visita.creado_localmente_en
  );
  return diaVisita !== null && diaVisita === fechaLocal(new Date());
}

// 3. Cargar Visitas del día en curso (Supabase + Locales)
const cargarVisitas = async () => {
  try {
    const sesion = await getActiveSession();

    if (sesion?.usuario?.rol !== 'tecnico') {
      throw new Error('No hay una sesión técnica activa.');
    }

    // Si hay red, actualizamos en IndexedDB las visitas del técnico desde Supabase
    if (navigator.onLine) {
      try {
        const { data: visitasRemotas, error } = await supabase
          .from('visitas')
          .select('*')
          .eq('tecnico_id', sesion.usuario.id);

        if (!error && Array.isArray(visitasRemotas)) {
          await guardarVisitasServidor(visitasRemotas);
        }
      } catch (errRed) {
        console.warn('[RUTA] No se pudieron refrescar visitas desde Supabase; se usan las locales.', errRed);
      }
    }

    const todas = await obtenerVisitasLocales();

    // Filtrar solo las visitas del técnico actual Y del día de hoy
    const visitasHoy = todas.filter(
      visita =>
        String(visita.tecnico_id) === String(sesion.usuario.id) &&
        esVisitaDeHoy(visita)
    );

    // Evitar duplicados si una visita existe como UUID y como "servidor:<id>"
    const unicasMap = new Map();
    for (const visita of visitasHoy) {
      const clave = visita.visita_servidor_id
        ? `srv:${visita.visita_servidor_id}`
        : `loc:${visita.id}`;
      if (!unicasMap.has(clave)) {
        unicasMap.set(clave, visita);
      }
    }

    selectVisita.innerHTML = '<option value="" selected disabled>Selecciona la visita</option>';

    for (const visita of unicasMap.values()) {
      let contexto = null;
      if (visita.orden_id) {
        try {
          contexto = await obtenerContextoOrden(visita.orden_id, sesion.usuario.id);
        } catch (_) {
          contexto = null;
        }
      }

      const condominioNombre = contexto?.condominio?.nombre || 'Condominio';
      const areaNombre = contexto?.area?.nombre || 'Área';
      const hora = visita.hora_entrada ? `(${visita.hora_entrada})` : '';
      const prefijo = visita.visita_servidor_id
        ? `Visita #${visita.visita_servidor_id}`
        : 'Visita local';

      const option = document.createElement('option');
      option.value = visita.id;
      option.textContent = `${prefijo}: ${condominioNombre} - ${areaNombre} ${hora}`.trim();

      option.dataset.visitaServidorId = visita.visita_servidor_id || '';
      option.dataset.condominioId = contexto?.condominio?.id || '';
      option.dataset.areaId = contexto?.area?.id || visita.area_id || '';
      option.dataset.condominioNombre = condominioNombre;
      option.dataset.areaNombre = areaNombre;

      selectVisita.appendChild(option);
    }

    if (unicasMap.size === 0) {
      selectVisita.innerHTML = '<option value="" selected disabled>Sin visitas registradas hoy</option>';
    }
  } catch (error) {
    console.error('Error al cargar las visitas desde IndexedDB:', error);
  }
};

// 4. Autocompletado de Condominio y Área al elegir la visita
selectVisita.addEventListener('change', (e) => {
  const opcionSeleccionada = e.target.options[e.target.selectedIndex];

  const idCondominio = opcionSeleccionada.dataset.condominioId;
  const idArea = opcionSeleccionada.dataset.areaId;

  inputCondominioId.value = idCondominio || '';
  inputAreaId.value = idArea || '';

  inputCondominioNombre.value = opcionSeleccionada.dataset.condominioNombre || '';
  inputAreaNombre.value = opcionSeleccionada.dataset.areaNombre || '';
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