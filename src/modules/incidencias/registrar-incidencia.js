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
//document.addEventListener('DOMContentLoaded', actualizarEstadoRed);

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

//Menús desplegables para seleccionar el condominio, área y visita

//---Condominio
const selectCondominio = document.getElementById('condominio_id');

const cargarCondominios = async () => {
  // Si no hay conexión, se detiene para evitar errores de red
  if (!navigator.onLine) {
    console.warn('Sin conexión: No se pueden cargar los condominios.');
    return;
  }

  try {
    // Asumiendo que tus columnas se llaman 'id' y 'nombre'. Ajusta si es necesario.
    const { data: condominios, error } = await supabase
      .from('condominios')
      .select('id, nombre')
      .order('nombre', { ascending: true });

    if (error) throw error;

    console.log("Respuesta de Supabase:", condominios);

    // Resetea el select manteniendo solo la opción por defecto
    selectCondominio.innerHTML = '<option value="" selected disabled>Selecciona un condominio</option>';

    // Inyecta los datos de la base al HTML
    condominios.forEach(condominio => {
      const option = document.createElement('option');
      option.value = condominio.id;
      option.textContent = condominio.nombre;
      selectCondominio.appendChild(option);
    });

  } catch (error) {
    console.error('Error al obtener los condominios:', error);
  }
};

// Modifica el EventListener que ya tenías para que también ejecute esta función
//document.addEventListener('DOMContentLoaded', () => {
//  actualizarEstadoRed(); 
//  cargarCondominios();
//});


// Ejecución directa al inicializar el módulo
actualizarEstadoRed(); 
cargarCondominios();

