// ==========================================
// 1. CONEXIÓN A SUPABASE
// ==========================================
const supabaseUrl = 'https://ytnmqmhxisfwczwiczev.supabase.co';     // Reemplaza con tu URL
const supabaseKey = 'sb_publishable_cwUYjpVoefobEjInkx8DjA_HzLFVQdj'; // Reemplaza con tu anon key
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

let ordenes = [];
let ordenIdActual = null; 
let modoEdicion = false;

// ==========================================
// 2. REFERENCIAS AL DOM
// ==========================================
const tbody = document.getElementById('cuerpo-tabla-ordenes');
const btnAbrirNuevaOrden = document.getElementById('btn-abrir-nueva-orden');
const btnGuardarOrden = document.getElementById('btn-guardar-orden');
const btnConfirmarCancelacion = document.getElementById('btn-confirmar-cancelacion');

const modalNuevaOrden = document.getElementById('modal-nueva-orden');
const modalCancelarOrden = document.getElementById('modal-cancelar-orden');
const botonesCerrar = document.querySelectorAll('.btn-cerrar-modal');

const formOrden = document.getElementById('form-orden');
const tituloModalOrden = document.getElementById('titulo-modal-orden');
const inputCondominio = document.getElementById('input-condominio');
const inputArea = document.getElementById('input-area');
const inputServicio = document.getElementById('input-servicio');
const inputFecha = document.getElementById('input-fecha');
const inputMotivoCancelacion = document.getElementById('input-motivo-cancelacion');

// ==========================================
// 3. CARGAR CATÁLOGOS DESDE SUPABASE
// ==========================================
async function cargarCatalogos() {
    try {
        const [resCondominios, resAreas, resServicios] = await Promise.all([
            supabase.from('condominios').select('id, nombre'),
            supabase.from('areas').select('id, nombre'),
            supabase.from('servicios').select('id, nombre')
        ]);

        const llenarSelect = (selectElement, datos) => {
            selectElement.innerHTML = '<option value="">Seleccionar</option>';
            if (datos) {
                datos.forEach(item => {
                    const opcion = document.createElement('option');
                    opcion.value = item.id;
                    opcion.textContent = item.nombre;
                    selectElement.appendChild(opcion);
                });
            }
        };

        llenarSelect(inputCondominio, resCondominios.data);
        llenarSelect(inputArea, resAreas.data);
        llenarSelect(inputServicio, resServicios.data);
    } catch (error) {
        console.error("Error cargando catálogos:", error);
    }
}

// ==========================================
// 4. OBTENER ÓRDENES Y RENDERIZAR
// ==========================================
async function obtenerOrdenes() {
    const { data, error } = await supabase
        .from('ordenes_servicio')
        .select(`
            id,
            fecha_programada,
            estado,
            condominio_id,
            area_id,
            servicio_id,
            condominios ( nombre ),
            areas ( nombre ),
            servicios ( nombre )
        `)
        .order('id', { ascending: false });
        
    if (error) {
        console.error("Error al obtener órdenes:", error);
        return;
    }
    
    ordenes = data;
    renderTabla(); 
}

function renderTabla() {
    tbody.innerHTML = ''; 

    if (!ordenes || ordenes.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="padding: 30px; text-align: center; color: #666;">No hay órdenes registradas.</td></tr>`;
        return;
    }
    
    ordenes.forEach(orden => {
        let claseEstado = '';
        let iconoEstado = '';
        let botonCancelarDeshabilitado = '';
        
        // Asignación de estilos basados en los estados de tu base de datos
        if (orden.estado === 'programada' || orden.estado === 'asignada') {
            claseEstado = 'programada'; iconoEstado = '📅';
        } else if (orden.estado === 'completada') {
            claseEstado = 'completada'; iconoEstado = '☑';
            botonCancelarDeshabilitado = 'disabled class="btn-disabled"'; 
        } else if (orden.estado === 'en_proceso') {
            claseEstado = 'en-proceso'; iconoEstado = '⚙️';
        } else if (orden.estado === 'cancelada') {
            claseEstado = 'programada'; iconoEstado = '❌'; 
            botonCancelarDeshabilitado = 'disabled class="btn-disabled"';
        }

        let claseBotonCancelar = botonCancelarDeshabilitado ? 'btn-disabled' : 'btn-danger';

        const nombreCondominio = orden.condominios ? orden.condominios.nombre : 'N/A';
        const nombreArea = orden.areas ? orden.areas.nombre : 'N/A';
        const nombreServicio = orden.servicios ? orden.servicios.nombre : 'N/A';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge">${nombreCondominio}</span></td>
            <td><span class="badge">${nombreArea}</span></td>
            <td><span class="badge">${nombreServicio}</span></td>
            <td><span class="badge">${orden.fecha_programada}</span></td>
            <td><span class="status ${claseEstado}">${iconoEstado} ${orden.estado}</span></td>
            <td style="display: flex; gap: 5px; justify-content: center;">
                <button class="btn-success btn-editar" data-id="${orden.id}">✏️ Editar</button>
                <button class="${claseBotonCancelar} btn-cancelar" data-id="${orden.id}" ${botonCancelarDeshabilitado}>⊘ Cancelar</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 5. CREAR / ACTUALIZAR ORDEN
// ==========================================
btnAbrirNuevaOrden.addEventListener('click', () => {
    modoEdicion = false;
    formOrden.reset(); 
    tituloModalOrden.innerText = 'Nueva Orden de Servicio';
    modalNuevaOrden.classList.add('active');
});

btnGuardarOrden.addEventListener('click', async () => {
    const nuevaOrden = {
        condominio_id: parseInt(inputCondominio.value),
        area_id: parseInt(inputArea.value),
        servicio_id: parseInt(inputServicio.value),
        fecha_programada: inputFecha.value,
        estado: 'programada' 
    };

    if (!nuevaOrden.condominio_id || !nuevaOrden.area_id || !nuevaOrden.servicio_id || !nuevaOrden.fecha_programada) {
        alert("Por favor, selecciona todos los campos.");
        return;
    }

    if (modoEdicion) {
        const { error } = await supabase
            .from('ordenes_servicio')
            .update({
                condominio_id: nuevaOrden.condominio_id,
                area_id: nuevaOrden.area_id,
                servicio_id: nuevaOrden.servicio_id,
                fecha_programada: nuevaOrden.fecha_programada
            })
            .eq('id', ordenIdActual);
            
        if (error) console.error("Error al actualizar:", error);
    } else {
        const { error } = await supabase
            .from('ordenes_servicio')
            .insert([nuevaOrden]);
            
        if (error) console.error("Error al insertar:", error);
    }

    modalNuevaOrden.classList.remove('active'); 
    obtenerOrdenes(); 
});

// ==========================================
// 6. DELEGACIÓN EVENTOS TABLA (EDITAR / CANCELAR)
// ==========================================
tbody.addEventListener('click', (e) => {
    // EDITAR
    if (e.target.closest('.btn-editar')) {
        const id = parseInt(e.target.closest('.btn-editar').dataset.id);
        const orden = ordenes.find(o => o.id === id);
        
        if(orden) {
            modoEdicion = true;
            ordenIdActual = id;
            
            // Llenamos el formulario con los IDs (llaves foráneas)
            inputCondominio.value = orden.condominio_id;
            inputArea.value = orden.area_id;
            inputServicio.value = orden.servicio_id;
            inputFecha.value = orden.fecha_programada;
            
            tituloModalOrden.innerText = 'Editar Orden de Servicio';
            modalNuevaOrden.classList.add('active');
        }
    }

    // ABRIR MODAL CANCELAR
    if (e.target.closest('.btn-cancelar:not(.btn-disabled)')) {
        ordenIdActual = parseInt(e.target.closest('.btn-cancelar').dataset.id);
        inputMotivoCancelacion.value = ''; // Limpiamos el campo previo
        modalCancelarOrden.classList.add('active');
    }
});

// ==========================================
// 7. CONFIRMAR CANCELACIÓN (CON VALIDACIÓN OBLIGATORIA)
// ==========================================
btnConfirmarCancelacion.addEventListener('click', async () => {
    const motivo = inputMotivoCancelacion.value.trim();
    
    // Validación obligatoria
    if (motivo === '') {
        alert('Por favor, ingresa el motivo de cancelación. Es obligatorio.');
        inputMotivoCancelacion.focus();
        return; 
    }

    // Actualizamos el estado en Supabase
    const { error } = await supabase
        .from('ordenes_servicio')
        .update({ 
            estado: 'cancelada'
            // Opcional: agrega aquí la columna del motivo si existe en tu tabla
            // motivo_cancelacion: motivo 
        })
        .eq('id', ordenIdActual);

    if (error) {
        console.error("Error al cancelar:", error);
    } else {
        modalCancelarOrden.classList.remove('active');
        obtenerOrdenes(); 
    }
});

// ==========================================
// 8. CERRAR MODALES
// ==========================================
botonesCerrar.forEach(boton => {
    boton.addEventListener('click', () => {
        modalNuevaOrden.classList.remove('active');
        modalCancelarOrden.classList.remove('active');
    });
});

// INICIALIZACIÓN
cargarCatalogos();
obtenerOrdenes();