# 📊 Sistema de Mozos - Documentación Completa

**Versión:** 2.0  
**Fecha:** Marzo 2026  
**Sistema:** Las Gambusinas POS  
**Módulos:** Backend + Dashboard Admin + App Mozos + Sistema de Metas

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Modelo de Datos](#modelo-de-datos)
3. [Endpoints API REST](#endpoints-api-rest)
4. [Página Mozos.html - Dashboard Admin](#página-mozoshtml---dashboard-admin)
5. [Sistema de Metas de Mozos](#sistema-de-metas-de-mozos)
6. [Integración con App Mozos](#integración-con-app-mozos)
7. [Eventos WebSocket](#eventos-websocket)
8. [Reportes y Cierre de Caja](#reportes-y-cierre-de-caja)
9. [Flujos de Usuario](#flujos-de-usuario)
10. [Consideraciones Técnicas](#consideraciones-técnicas)

---

## 🎯 Visión General

### Objetivo del Sistema

El **Sistema de Mozos** es un módulo integral que permite gestionar el personal de salón del restaurante Las Gambusinas, incluyendo:

- **Gestión de personal**: Registro, edición y eliminación de mozos
- **Sistema de propinas**: Registro y seguimiento de propinas recibidas
- **Sistema de Metas**: Definición de objetivos, monitoreo de cumplimiento y proyecciones inteligentes
- **Visualización en tiempo real**: Actualización instantánea vía Socket.io
- **Integración con reportes**: Datos consolidados para cierre de caja y análisis

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SISTEMA DE MOZOS                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐        │
│  │  App Mozos   │────▶│   Backend    │────▶│  Dashboard   │        │
│  │  (React Nav) │◀────│  (Node.js)   │◀────│  (mozos.html)│        │
│  └──────────────┘     └──────────────┘     └──────────────┘        │
│         │                    │                    │                 │
│         │                    ▼                    │                 │
│         │            ┌──────────────┐            │                 │
│         │            │   MongoDB    │            │                 │
│         │            │  (Propina)   │            │                 │
│         │            │  (Metas)     │            │                 │
│         │            └──────────────┘            │                 │
│         │                    │                    │                 │
│         └────────────────────┼────────────────────┘                 │
│                              ▼                                      │
│                    ┌──────────────┐                                 │
│                    │   Socket.io  │                                 │
│                    │  (Real-time) │                                 │
│                    └──────────────┘                                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Componentes Implementados

| Componente | Ubicación | Estado |
|------------|-----------|--------|
| **Modelo Propina** | `src/database/models/propina.model.js` | ✅ Implementado |
| **Repository Propina** | `src/repository/propina.repository.js` | ✅ Implementado |
| **Controller Propina** | `src/controllers/propinaController.js` | ✅ Implementado |
| **Rutas API** | `index.js` (propinaRoutes) | ✅ Implementado |
| **Página Dashboard** | `public/mozos.html` | ✅ Implementado |
| **Sistema de Metas** | `public/mozos.html` (sección Metas) | ✅ Implementado |

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

### Colección `metas_mozos` (Propuesta)

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
    
    // ========== AUDITORÍA ==========
    creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' },
    actualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'usuarios' }
}, {
    timestamps: true,
    collection: 'metas_mozos'
});
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

### Estructura de Secciones

El dashboard de mozos está organizado en **3 secciones principales**:

| Sección | Tab | Descripción |
|---------|-----|-------------|
| **Principal** | `principal` | Tabla de mozos con métricas, filtros y gestión CRUD |
| **Rendimiento** | `rendimiento` | Gráficos de ventas, propinas, heatmap de productividad |
| **Metas** | `propinas` | Sistema de metas con KPIs, tabla de cumplimiento, ranking |

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

## 🎯 Sistema de Metas de Mozos

### Visión General

La sección de **Metas de Mozos** es una herramienta de gestión que permite al administrador:

1. **Definir objetivos claros** para cada mozo y el equipo
2. **Monitorear cumplimiento** en tiempo real
3. **Detectar rápidamente** quién está rindiendo bien y quién necesita apoyo
4. **Tomar decisiones** basadas en proyecciones inteligentes

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
// Algoritmo de proyección
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
| **Metas activas** | Cantidad de metas configuradas para el período | Count de metas con `activo: true` |
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

### Estructura de la Tabla de Metas

| Columna | Descripción |
|---------|-------------|
| **#** | Posición en la tabla |
| **Mozo** | Nombre y turno asignado |
| **Meta principal** | Tipo de meta con ícono |
| **Objetivo** | Valor objetivo a alcanzar |
| **Actual** | Valor actual alcanzado |
| **Avance** | Barra de progreso con porcentaje |
| **Estado** | Badge semaforizado |
| **Proyección** | Si alcanzará o no, con brecha |
| **Tendencia** | Cambio vs período anterior |
| **Acciones** | Ajustar meta, Ver historial |

### Ranking de Cumplimiento

Vista alternativa que muestra:
- Posición con medallas para top 3
- Cumplimiento por mozo
- Metas cumplidas vs totales
- Tendencia y proyección

### Distribución del Equipo

Gráfico donut que muestra:
- Mozos cumpliendo (≥80%)
- Mozos en progreso (50-79%)
- Mozos en riesgo (<50%)

### Recomendaciones Automáticas

El sistema genera sugerencias contextuales:

| Condición | Recomendación |
|-----------|---------------|
| Cumplimiento equipo <60% | "Reunión de alineación recomendada" |
| Mozos en riesgo | "Asignar mentoreo o revisar mesas" |
| Ticket promedio < S/.40 | "Entrenamiento en sugerencias" |
| Mozos superaron meta | "Oportunidad de reconocimiento" |

### Resumen por Tipo de Meta

Tarjetas resumen para cada tipo:
- Ventas
- Mesas atendidas
- Tickets generados
- Ticket promedio
- Propinas promedio

Cada tarjeta muestra:
- Promedio por mozo
- Porcentaje de cumplimiento
- Barra de progreso

### Modal de Nueva Meta

Formulario para crear metas:

| Campo | Tipo | Descripción |
|-------|------|-------------|
| Tipo de meta | Select | ventas, mesas_atendidas, tickets_generados, ticket_promedio, propinas_promedio |
| Valor objetivo | Number | Valor numérico a alcanzar |
| Período | Select | diario, semanal, mensual |
| Aplicar a | Radio | Todos, Turno mañana, Turno noche, Mozo específico |
| Activa | Checkbox | Meta activa inmediatamente |

### Plantillas Predefinidas

| Plantilla | Tipo | Valor | Aplicación |
|-----------|------|-------|------------|
| Meta diaria mañana | Ventas | S/. 400 | Turno mañana |
| Meta diaria noche | Ventas | S/. 600 | Turno noche |
| Rotación de mesas | Mesas | 12 | Todos |
| Ticket promedio mínimo | Ticket | S/. 45 | Todos |
| Meta semanal | Ventas | S/. 2,500 | Todos |
| Propina promedio | Propinas | S/. 8 | Todos |

### Drawer de Detalle de Meta

Panel lateral que muestra:
- Estado actual con barra de progreso
- Proyección con brecha estimada
- Tendencia vs período anterior
- Acciones recomendadas contextuales
- Botón para ajustar meta

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

---

## 🔌 Eventos WebSocket

### Namespace `/mozos`

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `propina-registrada` | Nueva propina registrada | `{ propinaId, mesaId, mozoId, montoPropina }` |
| `propina-actualizada` | Propina modificada | `{ propinaId, cambios }` |
| `propina-eliminada` | Propina eliminada | `{ propinaId }` |

### Namespace `/admin`

| Evento | Descripción | Payload |
|--------|-------------|---------|
| `propina-registrada` | Actualizar contadores | `{ mozoId, montoPropina }` |
| `propina-actualizada` | Actualizar datos | `{ mozoId, cambios }` |
| `propina-eliminada` | Eliminar de contadores | `{ mozoId }` |
| `mozos-conectados` | Lista de mozos online | `{ conectados, mozos[] }` |
| `mozo-rendimiento-update` | Métricas actualizadas | `{ mozoId, ventasHoy, propinasHoy }` |

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
    ]
}
```

---

## 🔄 Flujos de Usuario

### Flujo 1: Gestión de Metas

1. Admin accede a `/mozos.html`
2. Cambia a la pestaña "Meta"
3. Ve KPIs de gestión y alertas automáticas
4. Opcionalmente crea nueva meta o usa plantilla
5. Monitorea la tabla de cumplimiento
6. Revisa proyecciones y tendencias
7. Toma acciones: ajustar metas, ver detalle

### Flujo 2: Ranking de Cumplimiento

1. Admin accede a sección Metas
2. Cambia vista a "Ranking"
3. Ve mozos ordenados por cumplimiento
4. Identifica top performers y quienes necesitan apoyo

### Flujo 3: Registrar Propina

1. Mozo completa el pago de una mesa
2. Modal post-pago ofrece "Registrar Propina"
3. Mozo selecciona tipo y monto
4. Sistema valida y guarda
5. Evento Socket actualiza dashboard en tiempo real

---

## ⚙️ Consideraciones Técnicas

### Validaciones

| Validación | Implementación |
|------------|----------------|
| Mesa en estado "pagado" | Controller verifica antes de crear propina |
| Mozo existe | Controller consulta mozosRepository |
| Boucher existe | Controller consulta boucherRepository |
| Porcentaje válido (0-100) | Schema validation |
| Monto no negativo | Schema validation |

### Performance

- **Índices optimizados** para consultas frecuentes por mozo y fecha
- **Snapshots de datos** para evitar joins complejos en reportes históricos
- **Agregación MongoDB** para cálculos de resumen
- **Cache Redis** disponible para datos de uso frecuente

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

| Archivo | Propósito |
|---------|-----------|
| `src/database/models/propina.model.js` | Modelo Mongoose de Propina |
| `src/database/models/mozos.model.js` | Modelo Mongoose de Mozo |
| `src/repository/propina.repository.js` | Lógica de acceso a datos |
| `src/controllers/propinaController.js` | Endpoints REST |

### Frontend

| Archivo | Propósito |
|---------|-----------|
| `public/mozos.html` | Página de gestión de mozos con sistema de metas |
| `public/assets/js/shared.js` | Funciones compartidas (apiGet, apiPost, etc.) |
| `public/assets/js/notifications.js` | Sistema de notificaciones toast |

### App Mozos (React Native)

| Archivo | Propósito |
|---------|-----------|
| `Pages/PagosScreen.js` | Pantalla de pagos (integrar modal propina) |
| `services/socketService.js` | Manejo de eventos Socket.io |

---

## 🚀 Roadmap de Mejoras

### Funcionalidades Pendientes

1. **Endpoint `/api/metas-mozos`** - CRUD completo de metas
2. **Historial de metas** - Registro de cambios y auditoría
3. **Notificaciones push** - Alertas a mozos sobre su progreso
4. **Exportación Excel** - Reportes de cumplimiento
5. **Gráficos de tendencia** - Evolución de metas en el tiempo
6. **Integración con turnos** - Metas específicas por turno

---

## 📚 Referencias

- [Backend Las Gambusinas - Documentación Completa](./automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md)
- [Modelo Comanda](../src/database/models/comanda.model.js)
- [Modelo Boucher](../src/database/models/boucher.model.js)
- [Modelo Mozos](../src/database/models/mozos.model.js)
- [Socket.io Events](../src/socket/events.js)

---

**Fin del Documento**  
*Última actualización: Marzo 2026*
