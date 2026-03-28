# 📊 Sistema de Mozos - Documentación Completa

**Versión:** 3.0  
**Fecha:** Marzo 2026  
**Sistema:** Las Gambusinas POS  
**Módulos:** Backend + Dashboard Admin + App Mozos + Sistema de Metas v3.0 (Gestor de Metas)

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Modelo de Datos](#modelo-de-datos)
4. [Endpoints API REST](#endpoints-api-rest)
5. [Página Mozos.html - Dashboard Admin](#página-mozoshtml---dashboard-admin)
6. [Sistema de Metas de Mozos v3.0](#sistema-de-metas-de-mozos-v30)
7. [Gestor de Metas](#gestor-de-metas)
8. [Integración con App Mozos](#integración-con-app-mozos)
9. [Eventos WebSocket](#eventos-websocket)
10. [Reportes y Cierre de Caja](#reportes-y-cierre-de-caja)
11. [Flujos de Usuario](#flujos-de-usuario)
12. [Consideraciones Técnicas](#consideraciones-técnicas)
13. [Archivos del Sistema](#archivos-del-sistema)
14. [Roadmap de Mejoras](#roadmap-de-mejoras)

---

## 🎯 Visión General

### Objetivo del Sistema

El **Sistema de Mozos** es un módulo integral que permite gestionar el personal de salón del restaurante Las Gambusinas, incluyendo:

- **Gestión de personal**: Registro, edición y eliminación de mozos
- **Sistema de propinas**: Registro y seguimiento de propinas recibidas
- **Sistema de Metas v3.0**: Gestor completo de metas con plantillas, historial y ciclo de vida
- **Visualización en tiempo real**: Actualización instantánea vía Socket.io
- **Integración con reportes**: Datos consolidados para cierre de caja y análisis

### Novedades Versión 3.0

| Característica | Descripción |
|----------------|-------------|
| **Gestor de Metas** | Modal completo con 5 pestañas para administración total de metas |
| **Plantillas dinámicas** | 6 plantillas predefinidas + capacidad de crear/editar personalizadas |
| **Ciclo de vida completo** | Metas activas, futuras, historial con trazabilidad |
| **Asignación flexible** | Por equipo, por turno, o individual con selector de mozos |
| **Notificaciones** | Preparado para push hacia App Mozos |
| **Integración Socket.io** | Evento `metas-actualizadas` para sincronización en tiempo real |

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SISTEMA DE MOZOS v3.0                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐               │
│  │  App Mozos   │────▶│   Backend    │────▶│  Dashboard   │               │
│  │  (React Nav) │◀────│  (Node.js)   │◀────│  (mozos.html)│               │
│  └──────────────┘     └──────────────┘     └──────────────┘               │
│         │                    │                    │                        │
│         │                    ▼                    │                        │
│         │            ┌──────────────┐            │                        │
│         │            │   MongoDB    │            │                        │
│         │            │  (Propinas)  │            │                        │
│         │            │  (Metas)     │            │                        │
│         │            │  (Plantillas)│            │                        │
│         │            └──────────────┘            │                        │
│         │                    │                    │                        │
│         └────────────────────┼────────────────────┘                        │
│                              ▼                                             │
│                    ┌──────────────┐                                        │
│                    │   Socket.io  │                                        │
│                    │  (Real-time) │                                        │
│                    │  /admin      │                                        │
│                    │  /mozos      │                                        │
│                    └──────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Componentes Implementados

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| **Modelo Propina** | `src/database/models/propina.model.js` | ✅ Implementado |
| **Modelo Metas Mozos** | `src/database/models/metaMozo.model.js` | 🔄 Pendiente |
| **Repository Propina** | `src/repository/propina.repository.js` | ✅ Implementado |
| **Controller Propina** | `src/controllers/propinaController.js` | ✅ Implementado |
| **Rutas API Propinas** | `index.js` (propinaRoutes) | ✅ Implementado |
| **Rutas API Metas** | `index.js` (metasMozosRoutes) | 🔄 Pendiente |
| **Página Dashboard** | `public/mozos.html` | ✅ Implementado |
| **Gestor de Metas** | `public/mozos.html` (modal) | ✅ Implementado |

---

## 📦 Modelo de Datos

### Colección `propinas`

El modelo de propina está diseñado como una **colección independiente** para optimizar consultas y reportes.

#### Esquema Completo

```javascript
const propinaSchema = new mongoose.Schema({
    // ========== IDENTIFICACIÓN ==========
    propinaId: { type: Number, unique: true },
    
    // ========== REFERENCIAS ==========
    mesaId: { type: mongoose.Schema.Types.ObjectId, ref: 'mesas', required: true },
    numMesa: { type: Number, required: true },
    boucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Boucher', required: true },
    boucherNumber: { type: Number, required: true },
    mozoId: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    nombreMozo: { type: String, required: true },
    
    // ========== MONTO Y TIPO ==========
    montoPropina: { type: Number, required: true, min: 0 },
    tipo: { type: String, enum: ['monto', 'porcentaje', 'ninguna'], required: true, default: 'monto' },
    montoFijo: { type: Number, min: 0, default: null },
    porcentaje: { type: Number, min: 0, max: 100, default: null },
    totalBoucher: { type: Number, required: true, min: 0 },
    
    // ========== INFORMACIÓN ADICIONAL ==========
    nota: { type: String, maxlength: 200, default: null },
    
    // ========== FECHAS ==========
    fechaRegistro: { type: Date, default: () => moment.tz("America/Lima").toDate() },
    fechaRegistroString: { type: String },
    estadoMesa: { type: String, default: 'pagado' },
    
    // ========== AUDITORÍA ==========
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    registradoPorNombre: { type: String },
    activo: { type: Boolean, default: true }
}, {
    timestamps: true,
    collection: 'propinas'
});
```

### Colección `metas_mozos`

Estructura para almacenar las metas configuradas:

```javascript
const metaMozoSchema = new mongoose.Schema({
    // ========== IDENTIFICACIÓN ==========
    metaId: { type: Number, unique: true },
    
    // ========== CONFIGURACIÓN ==========
    tipo: { 
        type: String, 
        enum: ['ventas', 'mesas_atendidas', 'tickets_generados', 'ticket_promedio', 'propinas_promedio'],
        required: true 
    },
    valorObjetivo: { type: Number, required: true },
    tipoValor: { type: String, enum: ['absoluto', 'relativo'], default: 'absoluto' },
    operador: { type: String, enum: ['gte', 'lte', 'eq'], default: 'gte' },
    
    // ========== PERÍODO ==========
    periodo: { type: String, enum: ['diario', 'semanal', 'mensual'], required: true },
    vigenciaInicio: { type: Date, required: true },
    vigenciaFin: { type: Date, required: true },
    
    // ========== APLICACIÓN ==========
    mozosAplican: [{ type: mongoose.Schema.Types.ObjectId, ref: 'mozos' }],
    aplicarATodos: { type: Boolean, default: false },
    aplicarTurno: { type: String, enum: ['manana', 'noche', 'todos'], default: 'todos' },
    
    // ========== ESTADO ==========
    activo: { type: Boolean, default: true },
    esPlantilla: { type: Boolean, default: false },
    plantillaId: { type: mongoose.Schema.Types.ObjectId, ref: 'MetasMozos' },
    
    // ========== NOTIFICACIONES ==========
    notificar: { type: Boolean, default: false },
    notificadoEn: { type: Date },
    
    // ========== AUDITORÍA ==========
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' },
    creadoPorNombre: { type: String },
    actualizadoPorNombre: { type: String }
}, {
    timestamps: true,
    collection: 'metas_mozos'
});
```

#### Índices Recomendados

```javascript
// Índice para metas activas por período
metaMozoSchema.index({ activo: 1, vigenciaInicio: 1, vigenciaFin: 1 });

// Índice para buscar metas por mozo
metaMozoSchema.index({ mozosAplican: 1 });

// Índice para plantillas
metaMozoSchema.index({ esPlantilla: 1 });
```

---

## 📡 Endpoints API REST

### Resumen de Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/propinas` | Crear nueva propina |
| GET | `/api/propinas` | Listar propinas con filtros |
| GET | `/api/propinas/:id` | Obtener propina por ID |
| GET | `/api/propinas/mesa/:mesaId` | Propinas de una mesa específica |
| GET | `/api/propinas/mozo/:mozoId` | Propinas de un mozo específico |
| GET | `/api/propinas/resumen/dia` | Resumen de propinas del día |
| GET | `/api/propinas/mozos-dashboard` | Datos para dashboard de mozos |
| PUT | `/api/propinas/:id` | Actualizar propina |
| DELETE | `/api/propinas/:id` | Eliminar propina (soft delete) |
| GET | `/api/mozos` | Listar todos los mozos |
| POST | `/api/mozos` | Crear nuevo mozo |
| PUT | `/api/mozos/:id` | Actualizar mozo |
| DELETE | `/api/mozos/:id` | Eliminar mozo |

### Endpoints de Metas (Pendientes de Implementar)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/metas-mozos` | Crear nueva meta |
| GET | `/api/metas-mozos` | Listar metas con filtros |
| GET | `/api/metas-mozos/:id` | Obtener meta por ID |
| PUT | `/api/metas-mozos/:id` | Actualizar meta |
| DELETE | `/api/metas-mozos/:id` | Eliminar meta (soft delete) |
| GET | `/api/metas-mozos/activas` | Metas vigentes |
| GET | `/api/metas-mozos/futuras` | Metas programadas |
| GET | `/api/metas-mozos/historial` | Metas pasadas |
| GET | `/api/metas-mozos/plantillas` | Listar plantillas |
| POST | `/api/metas-mozos/plantillas` | Crear plantilla |
| PUT | `/api/metas-mozos/:id/duplicar` | Duplicar meta |
| PUT | `/api/metas-mozos/:id/desactivar` | Desactivar meta |

### GET `/api/propinas/mozos-dashboard` - Datos para Dashboard

Obtiene datos consolidados para el dashboard de gestión de mozos.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fechaInicio` | String | Fecha inicio (default: hoy) |
| `fechaFin` | String | Fecha fin (default: hoy) |

**Response:**

```json
{
    "success": true,
    "data": {
        "fechaInicio": "2026-03-27",
        "fechaFin": "2026-03-27",
        "totales": {
            "totalVentas": 2500.00,
            "totalPropinas": 150.50,
            "totalTickets": 45,
            "totalMesas": 38,
            "totalMozos": 8
        },
        "mejorMozo": {
            "_id": "507f1f77bcf86cd799439013",
            "nombre": "Juan Pérez",
            "ventasHoy": 850.00,
            "propinasHoy": 45.00,
            "mesasAtendidas": 4
        },
        "mejorMozoVentas": {
            "_id": "507f1f77bcf86cd799439013",
            "nombre": "Juan Pérez",
            "ventasHoy": 850.00
        },
        "mozos": [
            {
                "_id": "...",
                "nombre": "Juan Pérez",
                "ventasHoy": 850.00,
                "propinasHoy": 45.00,
                "bouchersHoy": 5,
                "mesasAtendidas": 4
            }
        ],
        "series": {
            "propinasPorHora": [...],
            "ventasPorHora": [...],
            "mesasPorHora": [...],
            "productividadMozoHora": [...],
            "participacionPropinas": [...]
        },
        "ocupacionSalon": {
            "pct": 75.5,
            "ocupadas": 15,
            "capacidad": 20
        }
    }
}
```

---

## 🖥️ Página Mozos.html - Dashboard Admin

### Ubicación

```
public/mozos.html
```

### Acceso

- **URL:** `http://localhost:PORT/mozos.html`
- **Autenticación:** Requiere token JWT de administrador
- **Integración:** Accesible desde el sidebar del dashboard

### Tecnologías Utilizadas

| Tecnología | Versión | Propósito |
|------------|---------|-----------|
| **Alpine.js** | 3.14.3 | Framework reactivo para estado y eventos |
| **Tailwind CSS** | CDN | Sistema de diseño y utilidades |
| **Chart.js** | 4.4.7 | Gráficos y visualizaciones |
| **Lucide Icons** | Latest | Sistema de iconos SVG |
| **Socket.io Client** | 4.x | Comunicación en tiempo real |
| **AOS** | 2.3.1 | Animaciones de scroll |

### Estructura de Secciones

El dashboard de mozos está organizado en **3 secciones principales**:

| Sección | Tab | Descripción |
|---------|-----|-------------|
| **Principal** | `principal` | Tabla de mozos con métricas, filtros y gestión CRUD |
| **Rendimiento** | `rendimiento` | Gráficos de ventas, propinas, heatmap de productividad |
| **Metas** | `propinas` | Sistema de metas v3.0 con Gestor de Metas completo |

### KPIs Superiores

| KPI | Descripción | Color |
|-----|-------------|-------|
| **Total Mozos** | Cantidad total de mozos registrados | Blanco |
| **Presencia del equipo** | Activos / En turno / En app | Verde/Cyan/Dorado |
| **Ventas del período** | Total de ventas con delta vs anterior | Dorado |
| **Líder de ventas** | Mozo con mayor facturación | Dorado |

### Filtros Disponibles

- **Búsqueda por nombre o DNI**
- **Período:** Hoy | 7 días | Mes | Personalizado
- **Estado:** Todos | Activos | Inactivos | En turno | Fuera de turno
- **Vista:** Tabla | Tarjetas | Mesas

### Tabla de Mozos

| Columna | Descripción |
|---------|-------------|
| **Mozo** | Avatar con inicial + nombre + ID |
| **DNI** | Documento de identidad |
| **Estado** | Badge: Activo (verde) / Inactivo (gris) |
| **Turno** | Badge: En turno (cyan) / Fuera de turno (naranja) |
| **Ventas** | Total de ventas con tendencia |
| **Mesas atendidas** | Cantidad de mesas |
| **Propinas** | Total propinas con tendencia |
| **Prom / mesa** | Promedio de propina por mesa |
| **Prom / boucher** | Promedio de propina por ticket |
| **Acciones** | Editar, Ver detalle, Eliminar |

---

## 🎯 Sistema de Metas de Mozos v3.0

### Visión General

La sección de **Metas de Mozos v3.0** es una herramienta completa de gestión que permite al administrador:

1. **Definir objetivos claros** para cada mozo y el equipo
2. **Monitorear cumplimiento** en tiempo real
3. **Detectar rápidamente** quién está rindiendo bien y quién necesita apoyo
4. **Tomar decisiones** basadas en proyecciones inteligentes
5. **Administrar el ciclo de vida** completo de las metas (crear, editar, duplicar, desactivar)
6. **Gestionar plantillas** para configuración rápida

### Acceso al Gestor de Metas

El botón **"Gestionar Metas"** abre el modal completo con todas las funcionalidades:

```html
<button @click="abrirGestorMetas()" class="...">
    Gestionar Metas
</button>
```

### Tipos de Metas Soportadas

#### Metas Comerciales (Absolutas)

| Tipo | Descripción | Ejemplo | Fuente de datos |
|------|-------------|---------|-----------------|
| `ventas` | Total facturado en el período | S/. 500/día | `bouchers.total` |
| `mesas_atendidas` | Cantidad de mesas cerradas con pago | 12 mesas/turno | `bouchers` por `mozoId` |
| `tickets_generados` | Cantidad de bouchers procesados | 15 tickets/día | `bouchers` count |

#### Metas Operativas (Relativas/Calculadas)

| Tipo | Descripción | Ejemplo | Cálculo |
|------|-------------|---------|---------|
| `ticket_promedio` | Valor promedio por ticket | S/. 45 mínimo | `ventas / tickets` |
| `propinas_promedio` | Propina promedio por ticket | S/. 8 mínimo | `propinas / tickets` |

### Estados de Cumplimiento

| Estado | Criterio | Color | Badge |
|--------|----------|-------|-------|
| `sin_iniciar` | Avance = 0% y período activo, mozo fuera de turno | Gris | Sin iniciar |
| `en_progreso` | Avance 1-49% | Azul | En progreso |
| `en_riesgo` | Avance < 50% y mozo en turno | Naranja | En riesgo |
| `encaminado` | Avance 60-89% y proyección favorable | Verde claro | Encaminado |
| `cumplido` | Avance ≥ 100% | Verde | Cumplido |
| `superado` | Avance > 120% | Dorado | Superado |

### Cálculo de Proyección Inteligente

```javascript
function calcularProyeccion(valorActual, valorObjetivo, tiempoTranscurrido, tiempoTotal) {
    const ritmoActual = valorActual / tiempoTranscurrido;
    const valorProyectado = ritmoActual * tiempoTotal;
    const alcanzara = valorProyectado >= valorObjetivo;
    const brecha = valorObjetivo - valorProyectado;
    
    return {
        alcanzara,
        valorProyectado,
        brecha,
        ritmoActual
    };
}
```

### KPIs de Gestión

| KPI | Descripción | Cálculo |
|-----|-------------|---------|
| **Metas activas** | Cantidad de metas vigentes | `metasActivasGestor.length` |
| **Mozos cumpliendo** | Mozos con ≥80% de avance | Count donde `porcentajeAvance >= 80` |
| **Mozos en riesgo** | Mozos con <50% de avance | Count donde `porcentajeAvance < 50` |
| **Cumplimiento equipo** | Promedio de avance del equipo | `SUM(porcentajeAvance) / COUNT(mozos)` |
| **Próxima a vencer** | Meta con menor tiempo restante | Min de `vigenciaFin - now` |

### Alertas Automáticas

El sistema genera alertas contextuales:

| Tipo | Condición | Mensaje |
|------|-----------|---------|
| **Riesgo** | ≥2 mozos con <40% de avance | "X mozos por debajo del 40%" |
| **Proyección** | ≥1 mozo que no alcanzará la meta | "X mozo(s) no alcanzarán su meta" |
| **Destacado** | ≥1 mozo que superó la meta | "X mozo(s) superaron la meta" |

### Recomendaciones Automáticas

| Condición | Recomendación |
|-----------|---------------|
| Cumplimiento equipo <60% | "Reunión de alineación recomendada" |
| Mozos en riesgo | "Asignar mentoreo o revisar mesas" |
| Ticket promedio < S/.40 | "Entrenamiento en sugerencias" |
| Mozos superaron meta | "Oportunidad de reconocimiento" |

---

## 🎛️ Gestor de Metas

### Estructura del Modal

El **Gestor de Metas** es un modal de pantalla completa (`max-w-[95vw] max-h-[90vh]`) con **5 pestañas internas**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  [X]  GESTOR DE METAS                                        Guardado ✓     │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │▶Nueva    │ │ Activas  │ │ Futuras  │ │Plantillas│ │Historial │        │
│  │  Meta    │ │   (4)    │ │   (2)    │ │   (6)    │ │  (12)    │        │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [CONTENIDO DE LA PESTAÑA ACTIVA]                                          │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Cancelar]                                            [Guardar meta]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pestaña 1: Nueva Meta

Formulario completo dividido en **4 secciones**:

#### A. Definición del Objetivo (Qué y Cuánto)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| **Tipo de meta** | Select | `ventas`, `mesas_atendidas`, `tickets_generados`, `ticket_promedio`, `propinas_promedio` |
| **Valor objetivo** | Number | Valor numérico a alcanzar (con prefijo S/. para tipos monetarios) |

**Tooltips por tipo:**

| Tipo | Tooltip |
|------|---------|
| `ventas` | Total facturado por el mozo en el período |
| `mesas_atendidas` | Cantidad de mesas distintas con pago procesado |
| `tickets_generados` | Cantidad de bouchers/tickets emitidos |
| `ticket_promedio` | Valor promedio por ticket (ventas ÷ tickets) |
| `propinas_promedio` | Propina promedio por ticket (propinas ÷ tickets) |

#### B. Temporalidad (Cuándo)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| **Período** | Botones | Diario / Semanal / Mensual |
| **Vigencia inicio** | Date | Fecha de inicio de la meta |
| **Vigencia fin** | Date | Fecha de fin de la meta |

**Auto-cálculo de fechas:**

| Período | Inicio | Fin |
|---------|--------|-----|
| Diario | Hoy | Hoy |
| Semanal | Lunes de la semana actual | Domingo de la semana actual |
| Mensual | Primer día del mes | Último día del mes |

#### C. Asignación (A quién)

| Opción | Campos afectados | Descripción |
|--------|------------------|-------------|
| **Todo el equipo** | `aplicarATodos: true` | Aplica a todos los mozos activos |
| **Por turno** | `aplicarTurno: 'manana' | 'noche' | 'todos'` | Aplica a mozos de un turno específico |
| **Individual** | `mozosAplican: [id1, id2...]` | Aplica a mozos seleccionados individualmente |

**Selector de mozos individuales:**
- Input de búsqueda por nombre
- Lista de mozos con checkboxes
- Indicador de estado (activo/inactivo, en turno/fuera de turno)
- Contador de mozos seleccionados

#### D. Configuración Pro (Extras)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| **Cargar desde plantilla** | Select | Lista de plantillas disponibles, precarga valores |
| **Meta activa inmediatamente** | Checkbox | `activo: true` al crear |
| **Notificar a mozos** | Checkbox | Prepara evento para Socket.io |

### Pestaña 2: Metas Activas

Muestra metas actualmente vigentes (`vigenciaInicio <= hoy <= vigenciaFin` y `activo: true`).

**Filtros rápidos:**
- Búsqueda por tipo, turno o mozo
- Filtro por tipo de meta
- Filtro por turno

**Columnas de la tabla:**

| Columna | Descripción |
|---------|-------------|
| **#** | Posición |
| **Tipo** | Icono + label del tipo de meta |
| **Período** | Badge (diario/semanal/mensual) |
| **Vigencia** | Rango de fechas |
| **Alcance** | Badge (Todos / Turno / N mozos) |
| **Objetivo** | Valor objetivo con formato |
| **Estado** | Activa/Inactiva |
| **Creado por** | Nombre del usuario + indicador de plantilla |
| **Acciones** | Dropdown con opciones |

**Acciones disponibles:**
- **Editar:** Abre formulario con datos precargados
- **Duplicar:** Crea nueva meta copiando valores
- **Convertir en plantilla:** Marca `esPlantilla: true`
- **Desactivar:** Marca `activo: false` (soft delete)

**Estado vacío:**
```
┌─────────────────────────────────────────────────┐
│           📭                                    │
│   No hay metas activas para este período        │
│                                                 │
│   Crea una nueva meta o carga una plantilla     │
│   para comenzar a monitorear el cumplimiento    │
│                                                 │
│   [+ Nueva meta]  [Ver plantillas]              │
└─────────────────────────────────────────────────┘
```

### Pestaña 3: Futuras / Programadas

Muestra metas con `vigenciaInicio > hoy` y `activo: true`.

**Columnas:**

| Columna | Descripción |
|---------|-------------|
| **Tipo** | Icono + label |
| **Inicia en** | Cuenta regresiva ("En X días") |
| **Vigencia** | Rango de fechas |
| **Alcance** | Badge |
| **Acciones** | Activar ahora, Editar |

**Acciones:**
- **Activar ahora:** Cambia `vigenciaInicio` a hoy
- **Editar:** Modifica valores o fechas

### Pestaña 4: Plantillas

Gestión de plantillas predefinidas y personalizadas.

**Plantillas predefinidas (seed):**

| ID | Nombre | Tipo | Valor | Período | Turno |
|----|--------|------|-------|---------|-------|
| `plantilla-1` | Meta diaria mañana | ventas | S/. 400 | diario | manana |
| `plantilla-2` | Meta diaria noche | ventas | S/. 600 | diario | noche |
| `plantilla-3` | Rotación de mesas | mesas_atendidas | 12 | diario | todos |
| `plantilla-4` | Ticket promedio mínimo | ticket_promedio | S/. 45 | diario | todos |
| `plantilla-5` | Meta semanal de ventas | ventas | S/. 2,500 | semanal | todos |
| `plantilla-6` | Propina promedio objetivo | propinas_promedio | S/. 8 | diario | todos |

**Acciones por plantilla:**
- Click → Aplica la plantilla precargando valores
- Editar → Modifica la plantilla

**Crear nueva plantilla:**
- Mismo formulario que Nueva Meta
- Marca `esPlantilla: true`
- No asigna mozos directamente

### Pestaña 5: Historial

Muestra metas inactivas o con `vigenciaFin < hoy`.

**Columnas:**

| Columna | Descripción |
|---------|-------------|
| **#** | Posición |
| **Tipo** | Icono + label |
| **Período** | Badge |
| **Finalizó** | Fecha de fin |
| **Cumplimiento** | Porcentaje alcanzado |
| **Estado final** | Cumplida / Parcial / No cumplida |
| **Acciones** | Reactivar |

**Estados finales:**
- ✅ **Cumplida:** ≥100%
- ⚠️ **Parcial:** 80-99%
- ✗ **No cumplida:** <80%

---

## 📱 Integración con App Mozos

### Flujo Post-Pago con Propinas

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO POST-PAGO CON PROPINAS                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Mozo genera boucher                                         │
│     POST /api/boucher                                           │
│     ↓                                                           │
│  2. Mesa pasa a estado "pagado"                                 │
│     PUT /api/mesas/:id/estado {estado: "pagado"}                │
│     ↓                                                           │
│  3. Modal de opciones post-pago                                 │
│     [Imprimir Boucher] [Liberar Mesa] [📊 REGISTRAR PROPINA]    │
│     ↓                                                           │
│  4. Modal "Registrar Propina"                                   │
│     ◉ Sin propina | ☐ Monto fijo | ☐ Porcentaje (10/15/20%)    │
│     ↓                                                           │
│  5. POST /api/propinas                                          │
│     + Evento Socket: propina-registrada                         │
│     + Refresh dashboard                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Notificaciones de Metas (Preparado)

Cuando una meta se crea con `notificar: true`, el sistema puede emitir:

```javascript
// Namespace /mozos
socket.emit('nueva-meta-asignada', {
    mozoId: '...',
    meta: {
        tipo: 'ventas',
        valorObjetivo: 500,
        periodo: 'diario',
        vigenciaFin: '2026-03-27T23:59:59-05:00'
    },
    mensaje: 'Se te ha asignado una nueva meta de ventas: S/. 500 hoy'
});
```

---

## 🔌 Eventos WebSocket

### Namespace `/mozos`

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `propina-registrada` | Nueva propina registrada | `{ propinaId, mesaId, mozoId, montoPropina }` |
| `propina-actualizada` | Propina modificada | `{ propinaId, cambios }` |
| `propina-eliminada` | Propina eliminada | `{ propinaId }` |
| `nueva-meta-asignada` | Meta asignada al mozo | `{ mozoId, meta, mensaje }` |

### Namespace `/admin`

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `propina-registrada` | Actualizar contadores | `{ mozoId, montoPropina }` |
| `propina-actualizada` | Actualizar datos | `{ mozoId, cambios }` |
| `propina-eliminada` | Eliminar de contadores | `{ mozoId }` |
| `mozos-conectados` | Lista de mozos online | `{ conectados, mozos[] }` |
| `mozo-rendimiento-update` | Métricas actualizadas | `{ mozoId, ventasHoy, propinasHoy }` |
| `metas-actualizadas` | Cambios en metas | `{ tipo, meta, timestamp, usuario }` |

### Payload del evento `metas-actualizadas`

```javascript
{
    tipo: 'creada' | 'actualizada' | 'desactivada' | 'eliminada',
    meta: {
        _id: '...',
        tipo: 'ventas',
        valorObjetivo: 500,
        periodo: 'diario',
        vigenciaInicio: '2026-03-27T00:00:00-05:00',
        vigenciaFin: '2026-03-27T23:59:59-05:00',
        aplicarATodos: true,
        activo: true
    },
    timestamp: '2026-03-27T10:30:00-05:00',
    usuario: 'Admin'
}
```

### Implementación del Listener

```javascript
// En mozos.html - connectSocket()
this._socketAdmin.on('metas-actualizadas', (payload) => {
    if (payload?.tipo === 'creada' && payload?.meta) {
        const exists = this.metasConfiguradas.some(m => m._id === payload.meta._id);
        if (!exists) {
            this.metasConfiguradas.push(payload.meta);
        }
    } else if (payload?.tipo === 'actualizada' && payload?.meta) {
        const idx = this.metasConfiguradas.findIndex(m => m._id === payload.meta._id);
        if (idx >= 0) {
            this.metasConfiguradas[idx] = { ...this.metasConfiguradas[idx], ...payload.meta };
        }
    } else if (payload?.tipo === 'desactivada' && payload?.meta?._id) {
        const idx = this.metasConfiguradas.findIndex(m => m._id === payload.meta._id);
        if (idx >= 0) {
            this.metasConfiguradas[idx].activo = false;
        }
    }
    this.pulseKpi('total');
    this.updateMetasChart();
});
```

---

## 📊 Reportes y Cierre de Caja

### Integración con Reportes de Mozos

```json
// GET /api/reportes/mozos-performance
{
    "mozos": [
        {
            "mozoId": "...",
            "nombre": "Juan Pérez",
            "ventasTotal": 2500.00,
            "propinasTotal": 150.00,
            "mesasAtendidas": 12,
            "promedioPropina": 12.50,
            "metasCumplidas": 3,
            "metasTotal": 4
        }
    ]
}
```

### Cierre de Caja

```json
// GET /api/cierre-caja/:id
{
    "fecha": "2026-03-27",
    "ventasTotal": 15000.00,
    "propinasTotal": 450.00,
    "propinasPorMozo": [
        { "nombre": "Juan Pérez", "propinas": 150.00 }
    ],
    "metasResumen": {
        "activas": 4,
        "cumplidas": 2,
        "enRiesgo": 1
    }
}
```

---

## 🔄 Flujos de Usuario

### Flujo 1: Crear Meta desde Gestor

1. Admin hace clic en "Gestionar Metas"
2. Selecciona pestaña "Nueva Meta"
3. Define tipo y valor objetivo
4. Selecciona período y fechas de vigencia
5. Elige asignación (equipo/turno/individual)
6. Opcionalmente carga desde plantilla
7. Activa "Notificar" si desea informar a mozos
8. Clic en "Guardar meta"
9. Sistema crea meta y emite evento Socket

### Flujo 2: Aplicar Plantilla

1. Admin abre pestaña "Plantillas"
2. Click en plantilla deseada
3. Sistema precarga formulario con valores
4. Admin ajusta valores si es necesario
5. Guarda como meta nueva

### Flujo 3: Editar Meta Vigente

1. Admin abre pestaña "Metas Activas"
2. Localiza la meta en la tabla
3. Clic en acciones → Editar
4. Si la meta tiene avance, se muestra advertencia
5. Modifica valores
6. Guarda cambios

### Flujo 4: Desactivar Meta

1. Admin localiza meta en "Metas Activas"
2. Clic en acciones → Desactivar
3. Modal de confirmación
4. Sistema marca `activo: false`
5. Meta se mueve al historial

### Flujo 5: Reactivar Meta del Historial

1. Admin abre pestaña "Historial"
2. Localiza meta anterior
3. Clic en "Reactivar"
4. Sistema crea nueva instancia con mismos valores
5. Admin ajusta fechas si es necesario

---

## ⚙️ Consideraciones Técnicas

### Validaciones Frontend

| Campo | Validación |
|-------|------------|
| `tipo` | Requerido, debe ser uno del enum |
| `valorObjetivo` | Requerido, numérico, > 0 |
| `periodo` | Requerido |
| `vigenciaInicio` | Requerida, fecha válida |
| `vigenciaFin` | Requerida, >= vigenciaInicio |
| `mozosAplican` | Si no aplicarATodos, al menos 1 ID |
| `aplicarTurno` | Si por turno, debe ser válido |

### Validaciones Backend (Pendientes)

| Regla | Mensaje |
|-------|---------|
| Usuario autenticado | "Se requiere autenticación" |
| Rol admin/supervisor | "Permisos insuficientes" |
| Mozos existen | "Uno o más mozos no existen" |
| Plantilla existe | "Plantilla no encontrada" |
| Fechas coherentes | "La fecha de fin debe ser posterior a la de inicio" |

### Reglas de Negocio

| Escenario | Regla | Razón |
|-----------|-------|-------|
| Eliminar meta con progreso | Prohibir, usar desactivar | Mantener historial para reportes |
| Editar meta vigente | Permitir con advertencia | Flexibilidad operativa |
| Editar meta pasada | Solo activar/reactivar | Datos históricos inmutables |
| Asignar meta a mozo inactivo | Permitir | El mozo puede reactivarse |
| Meta sin mozos asignados | Validar al guardar | Evita metas huérfanas |

### Performance

- **Paginación:** Tablas con más de 50 registros
- **Cache Redis:** Metas activas (TTL 5 min)
- **Agregaciones:** Cálculos pesados en backend
- **Índices MongoDB:** Optimización de consultas frecuentes

### Cálculos Frontend vs Backend

| Cálculo | Responsable |
|---------|-------------|
| Total ventas por mozo | Backend (agregación) |
| Total propinas por mozo | Backend (agregación) |
| Promedios (mesa, boucher) | Frontend (división simple) |
| Proyecciones | Frontend (algoritmo de ritmo) |
| Estados de cumplimiento | Frontend (cálculo basado en porcentaje) |

---

## 📝 Archivos del Sistema

### Backend

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `src/database/models/propina.model.js` | Modelo Mongoose de Propina | ✅ |
| `src/database/models/mozos.model.js` | Modelo Mongoose de Mozo | ✅ |
| `src/database/models/metaMozo.model.js` | Modelo Mongoose de Meta | 🔄 |
| `src/repository/propina.repository.js` | Lógica de acceso a datos | ✅ |
| `src/repository/metaMozo.repository.js` | Lógica de metas | 🔄 |
| `src/controllers/propinaController.js` | Endpoints REST propinas | ✅ |
| `src/controllers/metaMozoController.js` | Endpoints REST metas | 🔄 |
| `src/socket/events.js` | Eventos Socket.io | ✅ |

### Frontend

| Archivo | Propósito |
|---------|-----------|
| `public/mozos.html` | Página completa con Gestor de Metas |
| `public/assets/js/shared.js` | Funciones compartidas (apiGet, apiPost, etc.) |
| `public/assets/js/notifications.js` | Sistema de notificaciones toast |
| `public/assets/css/dashboard.css` | Estilos del dashboard |
| `public/assets/css/animations.css` | Animaciones CSS |

### App Mozos (React Native)

| Archivo | Propósito |
|---------|-----------|
| `Pages/PagosScreen.js` | Pantalla de pagos |
| `services/socketService.js` | Manejo de eventos Socket.io |

---

## 🚀 Roadmap de Mejoras

### Funcionalidades Implementadas v3.0

- [x] Gestor de Metas completo con 5 pestañas
- [x] Formulario de nueva meta con 4 secciones
- [x] Asignación flexible (equipo/turno/individual)
- [x] 6 plantillas predefinidas
- [x] Metas activas con filtros y acciones
- [x] Metas futuras con activación inmediata
- [x] Historial con reactivación
- [x] Integración Socket.io (`metas-actualizadas`)
- [x] Sincronización con tabla de cumplimiento

### Funcionalidades Pendientes

1. **Endpoint `/api/metas-mozos`** - CRUD completo de metas en backend
2. **Modelo `metaMozoSchema`** - Implementación en MongoDB
3. **Notificaciones push** - Alertas a mozos sobre su progreso
4. **Exportación Excel** - Reportes de cumplimiento
5. **Gráficos de tendencia** - Evolución de metas en el tiempo
6. **Integración con turnos** - Metas específicas por turno
7. **Permisos granulares** - Control de acceso por rol
8. **Auditoría de cambios** - Historial de modificaciones
9. **Metas recursivas** - Repetición automática (diaria/semanal/mensual)
10. **Dashboard de metas** - Vista resumen ejecutivo

---

## 📚 Referencias

- [Backend Las Gambusinas - Documentación Completa](./automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md)
- [Modelo Propina](../src/database/models/propina.model.js)
- [Modelo Mozos](../src/database/models/mozos.model.js)
- [Socket.io Events](../src/socket/events.js)
- [Página Mozos.html](../public/mozos.html)

---

**Fin del Documento**  
*Última actualización: Marzo 2026 - Versión 3.0*
