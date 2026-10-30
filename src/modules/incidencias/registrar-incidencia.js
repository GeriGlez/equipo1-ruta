import { guardarIncidenciaOffline } from './db-local.js';
import { supabase } from '../../services/supabase.js';
// import { supabase } from '../../supabase/client.js'; 

const form = document.getElementById('formIncidencia');
const statusText = document.getElementById('connection-status');

// 1. Interceptor de conexión a red (Actualiza la UI)
const actualizarEstadoRed = () => {
  if (navigator.onLine) {
    statusText.innerHTML = '<span class="m7-connection-dot" style="background-color: #4caf50;"></span> Conectado';
  } else {
    statusText.innerHTML = '<span class="m7-connection-dot" style="background-color: #f44336;"></span> Guardado local (Offline)';
  }
};

window.addEventListener('online', actualizarEstadoRed);
window.addEventListener('offline', actualizarEstadoRed);
document.addEventListener('DOMContentLoaded', actualizarEstadoRed);

// 2. Manejo del formulario
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const incidenciaData = {
    condominio_id: parseInt(document.getElementById('condominio_id').value),
    area_id: parseInt(document.getElementById('area_id').value),
    visita_id: parseInt(document.getElementById('visita_id').value),
    descripcion: document.getElementById('descripcion').value,
    prioridad: document.getElementById('prioridad').value
  };

  if (!navigator.onLine) {
    // SIN RED: Desviar a IndexedDB
    const guardadoExitoso = await guardarIncidenciaOffline(incidenciaData);
    if (guardadoExitoso) {
      alert('Sin red: La incidencia se guardó en el dispositivo y está pendiente de envío.');
      form.reset();
      document.getElementById('descripcion-counter').textContent = '0/500';
    } else {
      alert('Ocurrió un error al guardar en el dispositivo.');
    }
  } else {
    // CON RED: Enviar a Supabase
    try {
      const { data: authData } = await supabase.auth.getUser();
      incidenciaData.reportada_por = authData.user.id;

      const { error } = await supabase.from('incidencias').insert([incidenciaData]);

      if (error) throw error;

      alert('Incidencia enviada al servidor exitosamente.');
      form.reset();
      document.getElementById('descripcion-counter').textContent = '0/500';
    } catch (error) {
      console.error('Error al enviar a Supabase:', error);
      alert('Error de conexión con el servidor.');
    }
  }
});