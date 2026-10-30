import {
  obtenerVisitasPendientes
} from './modules/visitas/db-local.js'



import {sincronizarOrdenesTecnico} from './services/ordenes-tecnico.js'


// ============================================
// RUTAS YA DISPONIBLES
// ============================================

const RUTAS = {

  visitas:
    '/src/modules/visitas/Visitas_y_Bitacora_Movil.html',

  pendientes:
    '/src/modules/visitas/Pendientes_Sincronizacion_Movil.html',

  incidencias:
    '/src/modules/incidencias/Registrar_Incidencia_Movil.html'

}


// ============================================
// INICIO DEL TÉCNICO
// ============================================

export function renderTecnicoApp(
  app,
  usuario,
  onLogout
) {

  app.innerHTML = `

    <div class="tecnico-app">


      <!-- =====================================
           ENCABEZADO
      ====================================== -->

      <header class="tecnico-header">

        <div class="tecnico-brand">

          <div class="tecnico-brand-main">

            <img
              src="/logo-ruta.png"
              alt="Logotipo RUTA"
              class="tecnico-logo"
            >

            <span class="tecnico-brand-name">
              RUTA
            </span>

          </div>

          <span class="tecnico-brand-subtitle">
            Gestión de servicios en campo
          </span>

        </div>


        <button
          type="button"
          id="tecnico-profile-button"
          class="tecnico-profile"
          aria-label="Opciones de usuario"
        >

          <img
            src="/avatar.png"
            alt=""
            aria-hidden="true"
            class="tecnico-avatar"
          >

          <strong id="tecnico-profile-name">
            Usuario
          </strong>

          <span>
            Técnico
          </span>

        </button>

      </header>


      <!-- =====================================
           CONTENIDO
      ====================================== -->

      <main class="tecnico-main">


        <!-- SALUDO -->

        <section class="tecnico-welcome">

          <h1>
            Hola,
            <span id="tecnico-welcome-name"></span>
          </h1>

          <p>
            ¿Qué deseas hacer?
          </p>

        </section>

        

        <!-- =================================
             OPCIONES
        ================================== -->

        <nav
          class="tecnico-menu"
          aria-label="Opciones del técnico"
        >


          <!-- ÓRDENES -->

          <button
            type="button"
            class="tecnico-menu-card"
            data-module="ordenes"
          >

            <div class="
            tecnico-menu-icon
            tecnico-menu-icon--ordenes
            ">
            <img
                src="/portapapeles.png"
                alt=""
                aria-hidden="true"
            >
            </div>

            <div class="tecnico-menu-info">

              <strong>
                Órdenes de Servicio
              </strong>

              <span>
                Consulta las órdenes asignadas
                a tu cuadrilla
              </span>

            </div>

            <span
              class="tecnico-menu-arrow"
              aria-hidden="true"
            >
              ›
            </span>

          </button>


          <!-- VISITAS -->

          <button
            type="button"
            class="tecnico-menu-card"
            data-module="visitas"
          >

            <div class="
            tecnico-menu-icon
            tecnico-menu-icon--visitas
            ">
            <img
                src="/ubicacion.png"
                alt=""
                aria-hidden="true"
            >
            </div>

            <div class="tecnico-menu-info">

              <strong>
                Bitácora de visitas
              </strong>

              <span>
                Registro de visitas en campo
              </span>

            </div>

            <span
              class="tecnico-menu-arrow"
              aria-hidden="true"
            >
              ›
            </span>

          </button>


          <!-- INSUMOS -->

          <button
            type="button"
            class="tecnico-menu-card"
            data-module="insumos"
          >

            <div class="
            tecnico-menu-icon
            tecnico-menu-icon--insumos
            ">
            <img
                src="/caja.png"
                alt=""
                aria-hidden="true"
            >
            </div>

            <div class="tecnico-menu-info">

              <strong>
                Insumos y consumo
              </strong>

              <span>
                Registra los insumos utilizados
                en la visita
              </span>

            </div>

            <span
              class="tecnico-menu-arrow"
              aria-hidden="true"
            >
              ›
            </span>

          </button>


          <!-- INCIDENCIAS -->

          <button
            type="button"
            class="tecnico-menu-card"
            data-module="incidencias"
          >

            <div class="
            tecnico-menu-icon
            tecnico-menu-icon--incidencias
            ">
            <img
                src="/advertencia.png"
                alt=""
                aria-hidden="true"
            >
            </div>

            <div class="tecnico-menu-info">

              <strong>
                Incidencias
              </strong>

              <span>
                Reporta y da seguimiento
                a incidencias
              </span>

            </div>

            <span
              class="tecnico-menu-arrow"
              aria-hidden="true"
            >
              ›
            </span>

          </button>

        </nav>

      </main>


      <!-- =====================================
           PENDIENTES
      ====================================== -->

      <footer class="tecnico-pending">

        <div class="tecnico-pending-icon">
        <img
            src="/reloj.png"
            alt=""
            aria-hidden="true"
        >
        </div>


        <div class="tecnico-pending-info">

          <strong id="tecnico-pending-count">
            Consultando pendientes...
          </strong>

          <span>
            Sincronízalas cuando recuperes conexión
          </span>

        </div>


        <button
          type="button"
          id="tecnico-pending-button"
          class="tecnico-pending-button"
        >
          Ver pendientes
        </button>

      </footer>


    </div>

  `


  // ==========================================
  // DATOS DEL USUARIO
  // ==========================================

  const nombre =
    usuario?.nombre || 'Técnico'


  app
    .querySelector('#tecnico-profile-name')
    .textContent =
      nombre


  app
    .querySelector('#tecnico-welcome-name')
    .textContent =
      nombre


  // ==========================================
  // CERRAR SESIÓN DESDE FOTO DE PERFIL
  // ==========================================

  const botonPerfil =
    app.querySelector(
      '#tecnico-profile-button'
    )


  botonPerfil.addEventListener(
    'click',
    async () => {

      const confirmar =
        window.confirm(
          '¿Deseas cerrar sesión?'
        )


      if (!confirmar) {
        return
      }


      if (onLogout) {
        await onLogout()
      }

    }
  )


  // ==========================================
  // NAVEGACIÓN
  // ==========================================

  const botonVisitas =
    app.querySelector(
      '[data-module="visitas"]'
    )


  botonVisitas.addEventListener(
    'click',
    () => {

      window.location.href =
        RUTAS.visitas

    }
  )

  const botonIncidencias =
    app.querySelector(
      '[data-module="incidencias"]'
    )


  botonIncidencias.addEventListener(
    'click',
    () => {

      window.location.href =
        RUTAS.incidencias

    }
  )


  const botonPendientes =
    app.querySelector(
      '#tecnico-pending-button'
    )


  botonPendientes.addEventListener(
    'click',
    () => {

      window.location.href =
        RUTAS.pendientes

    }
  )


  // ==========================================
  // MÓDULOS AÚN NO INTEGRADOS
  // ==========================================

  const modulosPendientes = [
    'ordenes',
    'insumos',
  ]


  modulosPendientes.forEach(
    modulo => {

      const boton =
        app.querySelector(
          `[data-module="${modulo}"]`
        )


      boton.addEventListener(
        'click',
        () => {

          alert(
            'Este módulo todavía no está integrado ' +
            'a la pantalla principal del técnico.'
          )

        }
      )

    }
  )


  // ==========================================
  // CARGA DE DATOS LOCALES
  // ==========================================

  actualizarPendientes(
    app
  )

  actualizarOrdenesTecnico(
    usuario
  )

}



// ============================================
// CONSULTAR PENDIENTES LOCALES
// ============================================

async function actualizarPendientes(
  app
) {

  const contador =
    app.querySelector(
      '#tecnico-pending-count'
    )


  try {

    const pendientes =
      await obtenerVisitasPendientes()


    const cantidad =
      pendientes.length


    contador.textContent =
      cantidad === 1
        ? '1 visita pendiente de sincronización'
        : `${cantidad} visitas pendientes de sincronización`


  } catch (error) {

    console.error(
      '[RUTA] No fue posible consultar ' +
      'las visitas pendientes:',
      error
    )


    contador.textContent =
      'Pendientes no disponibles'

  }

}

// ============================================
// ACTUALIZAR ÓRDENES LOCALES DEL TÉCNICO
// ============================================

async function actualizarOrdenesTecnico(
  usuario
) {

  try {

    const ordenes =
      await sincronizarOrdenesTecnico(
        usuario
      )


    console.log(
      '[RUTA] Órdenes del técnico disponibles:',
      ordenes.length
    )

  } catch (error) {

    console.error(
      '[RUTA] No fue posible actualizar ' +
      'las órdenes del técnico:',
      error
    )

  }

}