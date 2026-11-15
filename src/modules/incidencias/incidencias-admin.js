import { supabase } from '../../services/supabase.js';

const formEditar = document.getElementById('formEditarIncidencia');
const selectEstado = document.getElementById('estado');
const inputNota = document.getElementById('nota_resolucion');
const btnGuardar = document.getElementById('btnGuardar');
let incidenciaActualId = null;

// 1. Validar reglas de negocio al intentar guardar
formEditar.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  if (!incidenciaActualId) return;

  const estadoNuevo = selectEstado.value;
  const nota = inputNota.value.trim();

  // REGLA: Pasar a resuelta o descartada exige nota[cite: 26, 30]
  if ((estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') && nota === '') {
    alert('Es obligatorio ingresar una nota para cerrar la incidencia.');
    inputNota.focus();
    return;
  }

  try {
    btnGuardar.disabled = true;
    btnGuardar.textContent = 'Guardando...';

    // Obtenemos sesión del admin para el resuelta_por
    const { data: { session } } = await supabase.auth.getSession();

    const { error } = await supabase
      .from('incidencias')
      .update({
        estado: estadoNuevo,
        nota_resolucion: nota,
        resuelta_por: (estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') ? session.user.id : null
      })
      .eq('id', incidenciaActualId);

    if (error) throw error;

    alert('Incidencia actualizada correctamente.');
    
    // REGLA: Una incidencia cerrada no se reabre[cite: 26]
    if (estadoNuevo === 'resuelta' || estadoNuevo === 'descartada') {
      bloquearFormularioCerrado();
    }

  } catch (error) {
    console.error('Error al actualizar:', error);
    alert('Hubo un error al guardar los cambios.');
  } finally {
    btnGuardar.disabled = false;
    btnGuardar.textContent = 'Guardar cambios';
  }
});

// Función para aplicar la restricción de incidentes cerrados[cite: 26]
function bloquearFormularioCerrado() {
  selectEstado.disabled = true;
  inputNota.readOnly = true;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Incidencia cerrada';
}

