# 🧭 RUTA - Servicios en Sitio para Condominios
## Documento de Contexto Persistente y Especificación Técnica
**Proyecto Integrador PWA — 10° Cuatrimestre**  
**Equipo #1** | Versión: `1.0.0` | Octubre 2026

---

## 1. Visión y Dominio del Negocio

### 1.1 El Problema Operativo
Las empresas de mantenimiento en sitio que atienden condominios y desarrollos residenciales (albercas, jardinería, áreas comunes y equipos de bombeo) operan tradicionalmente con registros físicos en libreta. Esto ocasiona:
* Pérdida de información en campo.
* Errores de recaptura manual en oficina.
* Falta de trazabilidad y evidencia de visitas, mediciones químicas (pH/cloro), insumos utilizados e incidencias detectadas.

### 1.2 La Solución (RUTA)
RUTA es una **Aplicación Web Progresiva (PWA)** interna orientada a estructurar la operación de campo bajo el modelo conceptual:
Configurar -> Programar -> Ejecutar -> Registrar -> Dar Seguimiento -> Medir

### 1.3 Límites Estrictos de Alcance (Exclusiones del Product Owner)
Para garantizar la viabilidad y cumplimiento de la rúbrica, **quedan expresamente descartadas** las siguientes funciones:
* ❌ Fotografías en visitas o firmas digitales en pantalla.
* ❌ Mapas interactivos, GPS o cálculo de rutas óptimas.
* ❌ Notificaciones automáticas (Push / SMS / Email).
* ❌ Portal para residentes / condóminos y pasarelas de pago o cobranza.
* ❌ Módulos de nómina, asistencia o recursos humanos.

---

## 2. Rúbrica y Envolvente Técnico Obligatorio

| Criterio | Especificación Técnica |
| :--- | :--- |
| **Frontend** | HTML5 semántico, CSS3 responsivo y **JavaScript Vanilla puro (ES6 Modules)**. *Prohibido el uso de frameworks (React, Vue, Angular, Svelte).* |
| **Tooling & Build** | **Vite** para servidor de desarrollo local (`npm run dev`) y optimización en producción (`npm run build`). |
| **Backend & BaaS** | **Supabase** (PostgreSQL relacional, Supabase Auth y API REST vía `@supabase/supabase-js`). |
| **Almacenamiento Local** | **IndexedDB nativo** para soporte *offline-first* en campo. |
| **Despliegue & Git** | Control de versiones en GitHub, ramas por HU y despliegue continuo en **Netlify**. |
| **Auditoría PWA** | Cumplimiento de criterios **Lighthouse** (PWA instalable, Service Worker activo, manifest.json, responsividad móvil). |

### 2.1 Metas Cuantitativas de la Materia
* **7 módulos funcionales** integrados.
* **12 tablas relacionales** en PostgreSQL / Supabase.
* **4 CRUDs completos** en catálogos base.
* **2 flujos de estado** (Órdenes de servicio e Incidencias).
* **2 roles de acceso** (Administrador y Técnico) con seguridad a nivel de datos (RLS).
* **2 vistas de reporte** (Consumo de insumos y Cumplimiento de rutas).

---

## 3. Arquitectura del Sistema y Roles

### 3.1 Los Dos Perfiles de Usuario
* **Administrador (Oficina):**
  * Accede desde computadora/laptop.
  * Administra catálogos, asigna técnicos a cuadrillas, programa órdenes de trabajo, revisa incidencias y analiza reportes de insumos y cumplimiento.
* **Técnico (Campo):**
  * Accede desde su teléfono móvil.
  * Solo visualiza las órdenes asignadas a su cuadrilla.
  * Captura bitácoras de visita, lecturas de alberca (pH y cloro), consumo de materiales e incidencias, **con o sin conexión a internet**.

---

## 4. Repartición de Módulos (Equipo #1)

| # | Módulo Funcional | Integrante Responsable | Historias de Usuario Asignadas |
| :-: | :--- | :--- | :--- |
| **1** | Condominios y Áreas | André Sánchez | **HU-01** (Registrar condominio con áreas) / **HU-02** (Ver notas de acceso) |
| **2** | Servicios Contratados | Jose (Pechu) | **HU-03** (Definir servicios contratados por condominio) |
| **3** | Personal y Cuadrillas | **Alexei** | **HU-04** (Armar cuadrillas) / **HU-14** (Autenticación y roles) |
| **4** | Órdenes de Servicio | Fernando Carrera | **HU-05** (Programar órdenes de la semana) / **HU-06** (Cancelar orden con constancia) / **HU-07** (Ver órdenes de la cuadrilla) |
| **5** | Visitas y Bitácora de Campo | Brayan Ascencio | **HU-08** (Registrar visita sin conexión) / **HU-09** (Enviar pendientes al conectar) / **HU-10** (Capturar pH y cloro) |
| **6** | Insumos y Consumo | Rooney | **HU-11** (Registrar insumos usados en visita) + Reporte de Consumo |
| **7** | Incidencias | Geraldine | **HU-12** (Levantar incidencia sin señal) / **HU-13** (Cerrar incidencia con nota) |

---

## 5. Modelo de Datos Relacional (12 Tablas Oficiales)

1. **`usuarios` / `perfiles`**: (`id` UUID, `nombre`, `correo`, `rol`, `telefono`, `activo`).
2. **`cuadrillas`**: (`id`, `nombre`, `responsable_id`).
3. **`cuadrilla_miembros`**: (`id`, `cuadrilla_id`, `usuario_id`).
4. **`condominios`**: (`id`, `nombre`, `direccion`, `contacto`, `notas_acceso`).
5. **`areas`**: (`id`, `condominio_id`, `nombre`, `tipo_area`).
6. **`servicios`**: (`id`, `nombre`, `descripcion`).
7. **`condominio_servicios`**: (`id`, `condominio_id`, `servicio_id`, `frecuencia`, `dia_preferente`).
8. **`ordenes_servicio`**: (`id`, `condominio_id`, `area_id`, `servicio_id`, `cuadrilla_id`, `fecha_programada`, `estado`, `motivo_cancelacion`).
9. **`visitas`**: (`id`, `orden_id`, `tecnico_id`, `hora_entrada`, `hora_salida`, `recibido_por`, `observaciones`, `sync_status`).
10. **`lecturas_alberca`**: (`id`, `visita_id`, `ph`, `cloro`).
11. **`insumos`**: (`id`, `nombre`, `unidad_medida`).
12. **`visita_insumos`**: (`id`, `visita_id`, `insumo_id`, `cantidad`).
13. **`incidencias`**: (`id`, `visita_id`, `titulo`, `descripcion`, `prioridad`, `estado`, `nota_cierre`).

---

## 6. Flujos de Estados (State Machines)

### 6.1 Órdenes de Servicio
Programada -> En Proceso -> Completada
Programada -> Cancelada (con motivo obligatorio)

### 6.2 Incidencias
Abierta (Reportada en campo) -> En Atención -> Resuelta (con nota de cierre)

---

## 7. Protocolo Offline y Resolución de Conflictos

1. **Estrategia Local:** Se utiliza **IndexedDB** como cola local (*outbox pattern*). Las visitas, consumos e incidencias capturadas sin red se marcan con `sync_status = 'pending'`.
2. **Reconexión:** Al recuperar conexión (`window.addEventListener('online')`), el sistema envía los registros pendientes a Supabase y actualiza `sync_status = 'synced'` sin crear duplicados.
3. **Regla de Conflicto (Orden Cancelada vs Visita Offline):** Si un técnico registra una visita sin red y mientras tanto la administración cancela la orden, **la visita no se destruye**: se almacena como evidencia operativa vinculada a la orden cancelada para auditoría administrativa.

---

## 8. Estado de las Historias de Alexei (Personal y Cuadrillas)

* **[HU-14] Entrar con cuenta y ver lo correspondiente:**
  * ✅ Implementada en `src/modules/auth/authService.js` y `loginView.js`.
  * ✅ Soporte para roles (`admin` y `tecnico`).
  * ✅ Conexión activa con Supabase y respaldo en almacenamiento local con IndexedDB.
* **[HU-04] Armar cuadrillas con técnicos disponibles:**
  * 🎯 Diseñada en Figma (Dashboard de cuadrillas + Modal de creación + Asignación de empleados).
  * 🎯 Criterio 1: Un técnico puede pertenecer a varias cuadrillas.
  * 🎯 Criterio 2: Validación estricta que impide guardar cuadrillas sin un responsable asignado.
