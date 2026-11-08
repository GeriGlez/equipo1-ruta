import { guardarIncidenciaOffline } from './db-incidencias.js';
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
      //console.log("ID intentando guardar:", authData.user.id);

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

// 3. Cargar Visitas (Join profundo para traer los nombres por adelantado)
const cargarVisitas = async () => {
  if (!navigator.onLine) return;
  try {
    const { data: visitas, error } = await supabase
      .from('visitas')
      .select(`
        id,
        ordenes_servicio (
          condominio_id,
          area_id,
          condominios ( nombre ),
          areas ( nombre )
        )
      `)
      .order('id', { ascending: false }); 

    if (error) throw error;

    selectVisita.innerHTML = '<option value="" selected disabled>Selecciona el número de visita</option>';
    
    visitas.forEach(visita => {
      const option = document.createElement('option');
      option.value = visita.id;
      option.textContent = `Visita #${visita.id}`;
      
      const orden = visita.ordenes_servicio;
      if (orden) {
        // Guardamos IDs
        option.dataset.condominioId = orden.condominio_id;
        option.dataset.areaId = orden.area_id;
        // Guardamos nombres consultados en el join anidado
        option.dataset.condominioNombre = orden.condominios ? orden.condominios.nombre : 'Desconocido';
        option.dataset.areaNombre = orden.areas ? orden.areas.nombre : 'Desconocida';
      }
      
      selectVisita.appendChild(option);
    });
  } catch (error) {
    console.error('Error al cargar las visitas:', error);
  }
};

// 4. Autocompletado (Instantáneo y 100% offline-friendly)
selectVisita.addEventListener('change', (e) => {
  const opcionSeleccionada = e.target.options[e.target.selectedIndex];
  
  const idCondominio = opcionSeleccionada.dataset.condominioId;
  const idArea = opcionSeleccionada.dataset.areaId;

  if (idCondominio && idArea) {
    // 4.1 Asignamos IDs reales
    inputCondominioId.value = idCondominio;
    inputAreaId.value = idArea;

    // 4.2 Mostramos textos al instante leyendo los atributos
    inputCondominioNombre.value = opcionSeleccionada.dataset.condominioNombre;
    inputAreaNombre.value = opcionSeleccionada.dataset.areaNombre;
  }
});

// 5. Inicialización
actualizarEstadoRed(); 
cargarVisitas();