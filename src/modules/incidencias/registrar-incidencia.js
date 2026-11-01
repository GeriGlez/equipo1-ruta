import { guardarIncidenciaOffline } from './db-local.js';
import { supabase } from '../../services/supabase.js';

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

// 2. Manejo del formulario
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validación extra por si intentan guardar sin haber elegido visita
  if (!inputCondominioId.value || !inputAreaId.value) {
    alert('Por favor selecciona un número de visita válido.');
    return;
  }

  const incidenciaData = {
    condominio_id: parseInt(inputCondominioId.value),
    area_id: parseInt(inputAreaId.value),
    visita_id: parseInt(selectVisita.value),
    descripcion: document.getElementById('descripcion').value,
    prioridad: document.getElementById('prioridad').value
  };

  if (!navigator.onLine) {
    const guardadoExitoso = await guardarIncidenciaOffline(incidenciaData);
    if (guardadoExitoso) {
      alert('Sin red: La incidencia se guardó en el dispositivo y está pendiente de envío.');
      form.reset();
      document.getElementById('descripcion-counter').textContent = '0/500';
    } else {
      alert('Ocurrió un error al guardar en el dispositivo.');
    }
  } else {
    try {
      const { data: authData } = await supabase.auth.getUser();
      incidenciaData.reportada_por = authData.user.id;
      console.log("ID intentando guardar:", authData.user.id);

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

// 3. Cargar Visitas (con join a ordenes de servicio)
const cargarVisitas = async () => {
  if (!navigator.onLine) return;
  try {
    const { data: visitas, error } = await supabase
      .from('visitas')
      .select(`
        id,
        ordenes_servicio (
          condominio_id,
          area_id
        )
      `)
      .order('id', { ascending: false }); 

    if (error) throw error;
    console.log("Datos de visitas recibidos:", visitas);

    selectVisita.innerHTML = '<option value="" selected disabled>Selecciona el número de visita</option>';
    
    visitas.forEach(visita => {
      const option = document.createElement('option');
      option.value = visita.id;
      option.textContent = `Visita #${visita.id}`;
      
      const orden = visita.ordenes_servicio;
      if (orden) {
        option.dataset.condominio = orden.condominio_id;
        option.dataset.area = orden.area_id;
      }
      
      selectVisita.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar las visitas:', error);
  }
};

// 4. Autocompletado (Consulta los nombres y asigna los IDs)
selectVisita.addEventListener('change', async (e) => {
  const opcionSeleccionada = e.target.options[e.target.selectedIndex];
  
  const idCondominio = opcionSeleccionada.dataset.condominio;
  const idArea = opcionSeleccionada.dataset.area;

  if (idCondominio && idArea) {
    // 4.1 Guardamos los IDs reales en los campos ocultos para la BD
    inputCondominioId.value = idCondominio;
    inputAreaId.value = idArea;

    // 4.2 Mostramos un texto temporal mientras traemos los nombres
    inputCondominioNombre.value = "Cargando...";
    inputAreaNombre.value = "Cargando...";

    if (navigator.onLine) {
      try {
        const { data: condominioData } = await supabase.from('condominios').select('nombre').eq('id', idCondominio).single();
        const { data: areaData } = await supabase.from('areas').select('nombre').eq('id', idArea).single();

        // 4.3 Inyectamos los textos visuales
        inputCondominioNombre.value = condominioData ? condominioData.nombre : 'Desconocido';
        inputAreaNombre.value = areaData ? areaData.nombre : 'Desconocida';
      } catch (error) {
        console.error("Error al obtener nombres:", error);
        inputCondominioNombre.value = 'Error al cargar nombre';
        inputAreaNombre.value = 'Error al cargar nombre';
      }
    }
  }
});

// 5. Inicialización
actualizarEstadoRed(); 
cargarVisitas();