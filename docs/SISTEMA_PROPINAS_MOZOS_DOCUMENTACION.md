# 📊 Sistema de Propinas para Mozos - Documentación Completa

**Versión:** 1.0  
**Fecha:** Marzo 2026  
**Sistema:** Las Gambusinas POS  
**Módulos:** Backend + Dashboard Admin + App Mozos

---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Modelo de Datos](#modelo-de-datos)
3. [Endpoints API REST](#endpoints-api-rest)
4. [Página Mozos.html - Dashboard Admin](#página-mozoshtml---dashboard-admin)
5. [Integración con App Mozos](#integración-con-app-mozos)
6. [Eventos WebSocket](#eventos-websocket)
7. [Reportes y Cierre de Caja](#reportes-y-cierre-de-caja)
8. [Flujos de Usuario](#flujos-de-usuario)
9. [Consideraciones Técnicas](#consideraciones-técnicas)

---

## 🎯 Visión General

### Objetivo del Sistema

El **Sistema de Propinas para Mozos** permite registrar y gestionar las propinas recibidas por el personal de salón del restaurante Las Gambusinas. El sistema está diseñado para:

- **Registrar propinas** después de que una mesa es pagada (estado "pagado")
- **Soportar múltiples tipos de propina**: monto fijo, porcentaje sobre el total, o ninguna
- **Visualizar en tiempo real** las propinas en el dashboard administrativo
- **Integrar con reportes** de rendimiento de mozos y cierre de caja
- **Mantener auditoría completa** de quién registró cada propina

### Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SISTEMA DE PROPINAS                          │
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

---

## 📦 Modelo de Datos

### Colección `propinas`

El modelo de propina está diseñado como una **colección independiente** para optimizar consultas y reportes. Se justifica esta decisión porque:

1. **Consultas frecuentes por mozo y fecha**: Los índices optimizan estas búsquedas
2. **Historial completo**: Permite mantener registros históricos sin afectar rendimiento de otras colecciones
3. **Snapshots de datos**: Guarda información del mozo, mesa y boucher al momento del registro para reportes históricos
4. **Auditoría independiente**: Cada propina tiene su propia trazabilidad

### Esquema Completo

```javascript
const propinaSchema = new mongoose.Schema({
    // ========== IDENTIFICACIÓN ==========
    
    // ID auto-incremental para fácil referencia
    propinaId: {
        type: Number,
        unique: true
    },
    
    // ========== REFERENCIAS ==========
    
    // Referencia a la mesa
    mesaId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mesas',
        required: true
    },
    
    // Snapshot del número de mesa (para reportes históricos)
    numMesa: {
        type: Number,
        required: true
    },
    
    // Referencia al boucher asociado
    boucherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Boucher',
        required: true
    },
    
    // Snapshot del número de boucher
    boucherNumber: {
        type: Number,
        required: true
    },
    
    // Mozo que atendió la mesa (quién recibe la propina)
    mozoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos',
        required: true
    },
    
    // Snapshot del nombre del mozo
    nombreMozo: {
        type: String,
        required: true
    },
    
    // ========== MONTO Y TIPO ==========
    
    // Monto final de la propina (calculado)
    montoPropina: {
        type: Number,
        required: true,
        min: 0
    },
    
    // Tipo de propina
    tipo: {
        type: String,
        enum: ['monto', 'porcentaje', 'ninguna'],
        required: true,
        default: 'monto'
    },
    
    // Si tipo = "monto", el valor fijo
    montoFijo: {
        type: Number,
        min: 0,
        default: null
    },
    
    // Si tipo = "porcentaje", el porcentaje aplicado (10, 15, 20, etc.)
    porcentaje: {
        type: Number,
        min: 0,
        max: 100,
        default: null
    },
    
    // Total del boucher sobre el que se calculó la propina
    totalBoucher: {
        type: Number,
        required: true,
        min: 0
    },
    
    // ========== INFORMACIÓN ADICIONAL ==========
    
    // Nota opcional del mozo
    nota: {
        type: String,
        maxlength: 200,
        default: null
    },
    
    // ========== FECHAS ==========
    
    // Fecha y hora de registro
    fechaRegistro: {
        type: Date,
        default: () => moment.tz("America/Lima").toDate()
    },
    
    // Fecha formateada para fácil consulta
    fechaRegistroString: {
        type: String
    },
    
    // Estado de la mesa al momento de registrar
    estadoMesa: {
        type: String,
        default: 'pagado'
    },
    
    // ========== AUDITORÍA ==========
    
    // Usuario que registró la propina
    registradoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    },
    
    // Nombre del usuario que registró
    registradoPorNombre: {
        type: String
    },
    
    // Soft delete
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    collection: 'propinas'
});
```

### Índices Optimizados

```javascript
// Índice para reportes por mozo (más común)
propinaSchema.index(
    { mozoId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_mozo_fecha' }
);

// Índice para historial por mesa
propinaSchema.index(
    { mesaId: 1, fechaRegistro: -1 },
    { name: 'idx_propina_mesa_fecha' }
);

// Índice para relación con boucher
propinaSchema.index(
    { boucherId: 1 },
    { name: 'idx_propina_boucher' }
);

// Índice para listado general ordenado por fecha
propinaSchema.index(
    { fechaRegistro: -1 },
    { name: 'idx_propina_fecha' }
);

// Índice para filtrar por activo
propinaSchema.index(
    { activo: 1, fechaRegistro: -1 },
    { name: 'idx_propina_activo_fecha' }
);
```

### Métodos Estáticos

#### `getPropinasPorMozo(mozoId, fechaInicio, fechaFin)`

Obtiene todas las propinas de un mozo en un rango de fechas.

```javascript
const propinas = await Propina.getPropinasPorMozo(
    '507f1f77bcf86cd799439011', // mozoId
    '2026-03-01',               // fechaInicio
    '2026-03-31'                // fechaFin
);
```

#### `getResumenDia(fecha)`

Obtiene el resumen de propinas del día especificado (o día actual si no se especifica).

```javascript
const resumen = await Propina.getResumenDia('2026-03-26');
// Retorna:
// {
//   fecha: '2026-03-26',
//   totalPropinas: 150.50,
//   cantidadPropinas: 12,
//   promedioPropina: 12.54,
//   porMozo: [
//     { mozoId, nombreMozo, totalPropinas: 45.00, cantidad: 4 },
//     ...
//   ]
// }
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

---

### POST `/api/propinas` - Crear Propina

Registra una nueva propina después de que una mesa ha sido pagada.

**Request Body:**

```json
{
    "mesaId": "507f1f77bcf86cd799439011",
    "boucherId": "507f1f77bcf86cd799439012",
    "mozoId": "507f1f77bcf86cd799439013",
    "tipo": "porcentaje",
    "porcentaje": 10,
    "nota": "Cliente generoso",
    "registradoPor": "507f1f77bcf86cd799439013"
}
```

**Parámetros:**

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `mesaId` | ObjectId | ✅ | ID de la mesa |
| `boucherId` | ObjectId | ✅ | ID del boucher asociado |
| `mozoId` | ObjectId | ✅ | ID del mozo que recibe la propina |
| `tipo` | String | ✅ | "monto", "porcentaje" o "ninguna" |
| `montoFijo` | Number | Condicional | Requerido si tipo = "monto" |
| `porcentaje` | Number | Condicional | Requerido si tipo = "porcentaje" (0-100) |
| `nota` | String | ❌ | Nota opcional (max 200 chars) |
| `registradoPor` | ObjectId | ❌ | ID del usuario que registra |

**Response (201 Created):**

```json
{
    "success": true,
    "message": "Propina registrada exitosamente",
    "data": {
        "_id": "507f1f77bcf86cd799439014",
        "propinaId": 1,
        "mesaId": "507f1f77bcf86cd799439011",
        "numMesa": 5,
        "boucherId": "507f1f77bcf86cd799439012",
        "boucherNumber": 123,
        "mozoId": "507f1f77bcf86cd799439013",
        "nombreMozo": "Juan Pérez",
        "montoPropina": 4.52,
        "tipo": "porcentaje",
        "porcentaje": 10,
        "totalBoucher": 45.20,
        "nota": "Cliente generoso",
        "fechaRegistro": "2026-03-26T15:30:00.000Z",
        "fechaRegistroString": "26/03/2026 10:30:00",
        "estadoMesa": "pagado",
        "registradoPor": "507f1f77bcf86cd799439013",
        "registradoPorNombre": "Juan Pérez",
        "activo": true,
        "createdAt": "2026-03-26T15:30:00.000Z",
        "updatedAt": "2026-03-26T15:30:00.000Z"
    }
}
```

**Validaciones:**

- ✅ `mesaId`, `boucherId` y `mozoId` son requeridos
- ✅ `tipo` debe ser "monto", "porcentaje" o "ninguna"
- ✅ Si `tipo = "monto"`, `montoFijo` es requerido
- ✅ Si `tipo = "porcentaje"`, `porcentaje` es requerido (0-100)
- ✅ La mesa debe existir y estar en estado "pagado"
- ✅ El boucher debe existir
- ✅ El mozo debe existir

---

### GET `/api/propinas` - Listar Propinas

Obtiene todas las propinas con filtros opcionales.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fechaInicio` | String | Fecha inicio (YYYY-MM-DD) |
| `fechaFin` | String | Fecha fin (YYYY-MM-DD) |
| `mozoId` | ObjectId | Filtrar por mozo |
| `mesaId` | ObjectId | Filtrar por mesa |
| `tipo` | String | Filtrar por tipo ("monto", "porcentaje", "ninguna") |

**Ejemplo:**

```
GET /api/propinas?fechaInicio=2026-03-01&fechaFin=2026-03-31&mozoId=507f1f77bcf86cd799439013
```

**Response:**

```json
{
    "success": true,
    "cantidad": 15,
    "data": [
        {
            "_id": "507f1f77bcf86cd799439014",
            "propinaId": 1,
            "mesaId": {...},
            "boucherId": {...},
            "mozoId": {...},
            "montoPropina": 4.52,
            "tipo": "porcentaje",
            ...
        }
    ]
}
```

---

### GET `/api/propinas/mesa/:mesaId` - Propinas por Mesa

Obtiene todas las propinas registradas para una mesa específica.

**Ejemplo:**

```
GET /api/propinas/mesa/507f1f77bcf86cd799439011?fechaInicio=2026-03-01
```

**Response:**

```json
{
    "success": true,
    "mesaId": "507f1f77bcf86cd799439011",
    "cantidad": 3,
    "totalPropinas": 25.50,
    "data": [...]
}
```

---

### GET `/api/propinas/mozo/:mozoId` - Propinas por Mozo

Obtiene las propinas de un mozo con resumen incluido.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fechaInicio` | String | Fecha inicio |
| `fechaFin` | String | Fecha fin |
| `limite` | Number | Límite de resultados (default: 50) |

**Ejemplo:**

```
GET /api/propinas/mozo/507f1f77bcf86cd799439013?fechaInicio=2026-03-26&fechaFin=2026-03-26
```

**Response:**

```json
{
    "success": true,
    "propinas": [...],
    "resumen": {
        "mozoId": "507f1f77bcf86cd799439013",
        "totalPropinas": 45.50,
        "cantidadPropinas": 5,
        "promedioPropina": 9.10
    }
}
```

---

### GET `/api/propinas/resumen/dia` - Resumen del Día

Obtiene el resumen completo de propinas del día.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fecha` | String | Fecha en formato YYYY-MM-DD (opcional, default: hoy) |

**Ejemplo:**

```
GET /api/propinas/resumen/dia?fecha=2026-03-26
```

**Response:**

```json
{
    "success": true,
    "data": {
        "fecha": "2026-03-26",
        "totalPropinas": 150.50,
        "cantidadPropinas": 12,
        "promedioPropina": 12.54,
        "porMozo": [
            {
                "mozoId": "507f1f77bcf86cd799439013",
                "nombreMozo": "Juan Pérez",
                "totalPropinas": 45.00,
                "cantidad": 4
            },
            {
                "mozoId": "507f1f77bcf86cd799439014",
                "nombreMozo": "María García",
                "totalPropinas": 38.50,
                "cantidad": 3
            }
        ]
    }
}
```

---

### GET `/api/propinas/mozos-dashboard` - Datos para Dashboard

Obtiene datos consolidados para el dashboard de gestión de mozos.

**Query Parameters:**

| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `fechaInicio` | String | Fecha inicio (default: hoy) |
| `fechaFin` | String | Fecha fin (default: hoy) |

**Ejemplo:**

```
GET /api/propinas/mozos-dashboard?fechaInicio=2026-03-26&fechaFin=2026-03-26
```

**Response:**

```json
{
    "success": true,
    "data": {
        "fechaInicio": "2026-03-26",
        "fechaFin": "2026-03-26",
        "totales": {
            "totalVentas": 2500.00,
            "totalPropinas": 150.50,
            "totalMozos": 8
        },
        "mejorMozo": {
            "_id": "507f1f77bcf86cd799439013",
            "mozoId": 1,
            "nombre": "Juan Pérez",
            "DNI": 12345678,
            "rol": "mozo",
            "ventasHoy": 850.00,
            "bouchersHoy": 5,
            "mesasAtendidas": 4,
            "propinasHoy": 45.00,
            "cantidadPropinas": 4,
            "promedioPropina": 11.25
        },
        "mozos": [
            {
                "_id": "...",
                "mozoId": 1,
                "nombre": "Juan Pérez",
                "DNI": 12345678,
                "rol": "mozo",
                "ventasHoy": 850.00,
                "bouchersHoy": 5,
                "mesasAtendidas": 4,
                "propinasHoy": 45.00,
                "cantidadPropinas": 4,
                "promedioPropina": 11.25
            }
        ]
    },
    "meta": {
        "fechaInicio": "2026-03-26",
        "fechaFin": "2026-03-26",
        "generadoEn": "2026-03-26T15:30:00.000Z"
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

### Características Principales

#### 1. KPIs Superiores

| KPI | Descripción | Color |
|-----|-------------|-------|
| **Total Mozos** | Cantidad total de mozos registrados | Blanco |
| **Activos Hoy** | Mozos con estado activo | Verde (#2ecc71) |
| **En Turno** | Mozos actualmente trabajando | Cyan (#00d4aa) |
| **Ventas Hoy** | Total de ventas del día | Dorado (#d4af37) |
| **Top Mozo** | Mejor mozo por ventas del día | Dorado |

#### 2. Filtros y Búsqueda

- **Búsqueda por nombre o DNI**
- **Filtro por estado:** Todos | Activos | Inactivos
- **Filtro por turno:** Todos | En turno | Fuera de turno

#### 3. Tabla de Mozos

| Columna | Descripción |
|---------|-------------|
| **Mozo** | Avatar con inicial + nombre + ID |
| **DNI** | Documento de identidad |
| **Teléfono** | Número de contacto |
| **Estado** | Badge: Activo (verde) / Inactivo (gris) |
| **Turno** | Badge: En turno (cyan) / Fuera de turno (naranja) |
| **Ventas Hoy** | Total de ventas del día (formato S/.) |
| **Mesas** | Cantidad de mesas asignadas |
| **Acciones** | Editar, Ver detalle, Eliminar |

#### 4. Modal Crear/Editar Mozo

Campos disponibles:
- Nombre completo (requerido)
- DNI (requerido)
- Teléfono (opcional)
- Usuario/login (opcional)
- Contraseña inicial (opcional)
- Checkbox: Mozo activo
- Checkbox: En turno

#### 5. Modal Detalle Mozo

Información mostrada:
- DNI y Teléfono
- Ventas Hoy
- Mesas atendidas
- Comandas del día
- Estado y Turno

### Estructura HTML

```html
<!-- public/mozos.html -->
<div class="container">
  <!-- Header con título y botón crear -->
  <div class="flex items-center justify-between mb-5">
    <h1>Gestión de Mozos</h1>
    <button @click="openCreateModal()">+ Nuevo Mozo</button>
  </div>

  <!-- KPIs -->
  <div class="grid grid-cols-5 gap-4 mb-6">
    <!-- Total Mozos -->
    <!-- Activos Hoy -->
    <!-- En Turno -->
    <!-- Ventas Hoy -->
    <!-- Top Mozo -->
  </div>

  <!-- Filtros y Mini Ranking -->
  <div class="grid grid-cols-12 gap-4 mb-6">
    <!-- Filtros de búsqueda -->
    <!-- Top 3 Mozos Hoy -->
  </div>

  <!-- Tabla de Mozos -->
  <table id="tabla-mozos">
    <!-- Carga via GET /api/mozos -->
  </table>
</div>
```

### JavaScript (Alpine.js)

```javascript
function mozosApp() {
  return {
    // Estado
    sidebarOpen: true,
    modal: null,
    modalDetalle: null,
    loading: true,
    mozos: [],
    busqueda: '',
    filtroEstado: '',
    filtroTurno: '',
    formMozo: {...},

    // Inicialización
    async init() {
      await this.loadMozos();
    },

    // Cargar mozos desde API
    async loadMozos() {
      const data = await apiGet('/mozos');
      this.mozos = this.normalizarMozos(data);
    },

    // Computados
    get mozosFiltrados() {...},
    get mozosEnTurno() {...},
    get totalVentasHoy() {...},
    get topMozos() {...},

    // Acciones CRUD
    openCreateModal() {...},
    openEditModal(m) {...},
    async guardarMozo() {...},
    async eliminarMozo(id) {...},
    async toggleActivo(m) {...},
  };
}
```

### Endpoints Consumidos

| Endpoint | Uso |
|----------|-----|
| `GET /api/mozos` | Listar todos los mozos |
| `POST /api/mozos` | Crear nuevo mozo |
| `PUT /api/mozos/:id` | Actualizar mozo |
| `DELETE /api/mozos/:id` | Eliminar mozo |
| `GET /api/propinas/mozos-dashboard` | Datos de ventas y propinas |

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
│     ┌─────────────────────────────────┐                         │
│     │ ✓ Pago confirmado - Mesa #5     │                         │
│     │ Total: S/ 45.20                 │                         │
│     │                                  │                         │
│     │ [Imprimir Boucher] [Liberar Mesa]│                         │
│     │ [📊 REGISTRAR PROPINA] ← NUEVO   │                         │
│     └─────────────────────────────────┘                         │
│     ↓                                                           │
│  4. Modal "Registrar Propina"                                   │
│     ┌─────────────────────────────────┐                         │
│     │ Mesa #5 - Pagada ✓              │                         │
│     │ Total Boucher: S/ 45.20         │                         │
│     │                                  │                         │
│     │ Tipo de Propina:                │                         │
│     │ ◉ Sin propina                   │                         │
│     │ ☐ Monto fijo: S/ [10.00]        │                         │
│     │ ☐ Porcentaje: [10]%             │                         │
│     │   → Calcula S/ 4.52             │                         │
│     │                                  │                         │
│     │ Nota: [Cliente generoso]        │                         │
│     │                                  │                         │
│     │ [Cancelar] [Guardar Propina]    │                         │
│     └─────────────────────────────────┘                         │
│     ↓                                                           │
│  5. POST /api/propinas                                          │
│     + Evento Socket: propina-registrada                         │
│     + Refresh mapa mesas                                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Pantalla PagosScreen (App Mozos)

#### Ubicación del Código

```
Las-Gambusinas/Pages/PagosScreen.js
```

#### Implementación del Modal de Propina

```javascript
// Estado para el modal de propina
const [showPropinaModal, setShowPropinaModal] = useState(false);
const [propinaData, setPropinaData] = useState({
    tipo: 'ninguna',
    montoFijo: 0,
    porcentaje: 10,
    nota: ''
});

// Función para calcular propina
const calcularPropina = () => {
    if (propinaData.tipo === 'monto') {
        return propinaData.montoFijo;
    } else if (propinaData.tipo === 'porcentaje') {
        return (boucher.total * propinaData.porcentaje / 100).toFixed(2);
    }
    return 0;
};

// Función para registrar propina
const registrarPropina = async () => {
    try {
        const response = await fetch(`${API_URL}/api/propinas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                mesaId: mesa._id,
                boucherId: boucher._id,
                mozoId: mozoId,
                tipo: propinaData.tipo,
                montoFijo: propinaData.tipo === 'monto' ? propinaData.montoFijo : null,
                porcentaje: propinaData.tipo === 'porcentaje' ? propinaData.porcentaje : null,
                nota: propinaData.nota,
                registradoPor: mozoId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            Alert.alert('Propina registrada', `Monto: S/. ${data.data.montoPropina}`);
            setShowPropinaModal(false);
            // Emitir evento Socket o navegar
        }
    } catch (error) {
        Alert.alert('Error', 'No se pudo registrar la propina');
    }
};
```

#### Presets Rápidos

```javascript
const PRESETS_PORCENTAJE = [10, 15, 20];

// En el modal:
<View style={styles.presetsContainer}>
    {PRESETS_PORCENTAJE.map(preset => (
        <TouchableOpacity
            key={preset}
            style={[
                styles.presetButton,
                propinaData.porcentaje === preset && styles.presetActive
            ]}
            onPress={() => setPropinaData({...propinaData, porcentaje: preset})}
        >
            <Text>{preset}%</Text>
        </TouchableOpacity>
    ))}
</View>
```

---

## 🔌 Eventos WebSocket

### Namespace `/mozos`

#### Evento: `propina-registrada`

Emitido cuando se registra una nueva propina.

```javascript
// Desde el backend
socket.emit('propina-registrada', {
    propinaId: 1,
    mesaId: "507f1f77bcf86cd799439011",
    numMesa: 5,
    mozoId: "507f1f77bcf86cd799439013",
    nombreMozo: "Juan Pérez",
    montoPropina: 4.52,
    tipo: "porcentaje",
    porcentaje: 10,
    timestamp: "2026-03-26T15:30:00.000Z"
});
```

**Escuchar en App Mozos:**

```javascript
socket.on('propina-registrada', (data) => {
    // Actualizar lista de propinas del mozo
    // Mostrar notificación
    // Refrescar estadísticas
});
```

### Namespace `/admin`

#### Evento: `propina-registrada`

Emitido al dashboard para actualización en tiempo real.

```javascript
// Actualizar contadores y gráficos
socket.on('propina-registrada', (data) => {
    updatePropinasCounter();
    refreshCharts();
    showNotification(`Nueva propina: S/. ${data.montoPropina}`);
});
```

#### Evento: `mozos-conectados`

Indica cuántos mozos están conectados en tiempo real.

```javascript
socket.emit('mozos-conectados', {
    conectados: 3,
    total: 12,
    mozos: [
        { mozoId: 1, nombre: "Juan Pérez", conectado: true },
        { mozoId: 2, nombre: "María García", conectado: true },
        ...
    ]
});
```

#### Evento: `mozo-rendimiento-update`

Actualización de métricas de un mozo específico.

```javascript
socket.emit('mozo-rendimiento-update', {
    mozoId: "507f1f77bcf86cd799439013",
    ventasHoy: 850.00,
    propinasHoy: 45.00,
    mesasAtendidas: 4,
    promedioPropina: 11.25
});
```

---

## 📊 Reportes y Cierre de Caja

### Integración con Reportes de Mozos

El endpoint de reportes de mozos se extiende para incluir propinas:

```javascript
// GET /api/reportes/mozos-performance
{
    "mozos": [
        {
            "mozoId": "507f1f77bcf86cd799439013",
            "nombre": "Juan Pérez",
            "ventasTotal": 2500.00,
            "propinasTotal": 150.00,
            "mesasAtendidas": 12,
            "comandasProcesadas": 25,
            "promedioPropina": 12.50,
            "porcentajePropinaVsVentas": 6.0 // propinas/ventas * 100
        }
    ]
}
```

### Cierre de Caja

El cierre de caja incluye el total de propinas del día:

```javascript
// GET /api/cierre-caja/:id
{
    "fecha": "2026-03-26",
    "ventasTotal": 15000.00,
    "propinasTotal": 450.00,  // ← Nuevo campo
    "propinasPorMozo": [
        { "nombre": "Juan Pérez", "propinas": 150.00 },
        { "nombre": "María García", "propinas": 120.00 },
        ...
    ],
    "desglose": {
        "efectivo": 8000.00,
        "tarjeta": 7000.00,
        "propinasEfectivo": 300.00,
        "propinasTarjeta": 150.00
    }
}
```

### PDF de Cierre de Caja

El reporte PDF incluye una sección dedicada a propinas:

```
╔══════════════════════════════════════════════════════════════╗
║                    CIERRE DE CAJA - 26/03/2026               ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  VENTAS TOTALES                    S/. 15,000.00             ║
║  ──────────────────────────────────────────────             ║
║  Efectivo                          S/.  8,000.00             ║
║  Tarjeta                           S/.  7,000.00             ║
║                                                              ║
║  PROPINAS                          S/.    450.00             ║
║  ──────────────────────────────────────────────             ║
║  Juan Pérez                        S/.    150.00             ║
║  María García                      S/.    120.00             ║
║  Carlos López                      S/.     80.00             ║
║  Ana Martínez                      S/.    100.00             ║
║                                                              ║
║  TOTAL EN CAJA                     S/. 15,450.00             ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## 🔄 Flujos de Usuario

### Flujo 1: Registrar Propina desde App Mozos

1. Mozo completa el pago de una mesa
2. El sistema cambia el estado de la mesa a "pagado"
3. Aparece el modal de opciones post-pago
4. Mozo presiona "Registrar Propina"
5. Se abre el modal de propina con:
   - Opción "Sin propina" (default)
   - Opción "Monto fijo" con campo de entrada
   - Opción "Porcentaje" con presets (10%, 15%, 20%) y campo personalizado
   - Campo de nota opcional
6. Mozo selecciona tipo y monto
7. El sistema calcula automáticamente el monto final
8. Mozo presiona "Guardar Propina"
9. El sistema valida:
   - Mesa en estado "pagado" ✓
   - Boucher existe ✓
   - Mozo existe ✓
10. Se registra la propina en la base de datos
11. Se emite evento WebSocket `propina-registrada`
12. Se actualiza el dashboard en tiempo real
13. El modal se cierra y el mozo puede liberar la mesa

### Flujo 2: Ver Propinas en Dashboard Admin

1. Admin accede a `/mozos.html`
2. Se cargan automáticamente los datos de todos los mozos
3. KPIs muestran totales del día
4. La tabla lista todos los mozos con sus métricas
5. Admin puede:
   - Buscar por nombre o DNI
   - Filtrar por estado o turno
   - Ver detalle de un mozo específico
   - Editar información del mozo
   - Crear nuevo mozo
   - Eliminar mozo

### Flujo 3: Reporte de Propinas por Fecha

1. Admin accede a la sección de reportes
2. Selecciona "Propinas" del menú
3. Define rango de fechas
4. El sistema genera reporte con:
   - Total de propinas en el período
   - Desglose por mozo
   - Promedio de propina
   - Gráfico de tendencia
   - Exportación a PDF/Excel

---

## ⚙️ Consideraciones Técnicas

### Validaciones

| Validación | Implementación |
|------------|----------------|
| Mesa en estado "pagado" | Controller verifica antes de crear propina |
| Mozo existe | Controller consulta mozosRepository |
| Boucher existe | Controller consulta boucherRepository |
| Porcentaje válido (0-100) | Schema validation con `min: 0, max: 100` |
| Monto no negativo | Schema validation con `min: 0` |
| Nota máximo 200 caracteres | Schema validation con `maxlength: 200` |

### Manejo de Errores

```javascript
// Errores comunes y sus códigos HTTP
{
    400: "Datos de entrada inválidos",
    404: "Recurso no encontrado (mesa/mozo/boucher)",
    500: "Error interno del servidor"
}
```

### Auditoría

Cada propina registra:
- `registradoPor`: ID del usuario que registró
- `registradoPorNombre`: Nombre del usuario
- `fechaRegistro`: Timestamp exacto
- `timestamps`: createdAt, updatedAt (automático)

### Soft Delete

Las propinas no se eliminan físicamente, se marca `activo: false`:

```javascript
// DELETE /api/propinas/:id
await Propina.findByIdAndUpdate(id, { activo: false });
```

### Performance

- **Índices optimizados** para consultas frecuentes por mozo y fecha
- **Snapshots de datos** para evitar joins complejos en reportes históricos
- **Agregación MongoDB** para cálculos de resumen
- **Cache Redis** disponible para datos de uso frecuente

---

## 📝 Archivos del Sistema

### Backend

| Archivo | Propósito |
|---------|-----------|
| `src/database/models/propina.model.js` | Modelo Mongoose de Propina |
| `src/repository/propina.repository.js` | Lógica de acceso a datos |
| `src/controllers/propinaController.js` | Endpoints REST |
| `src/socket/events.js` | Eventos WebSocket (extensión necesaria) |

### Frontend

| Archivo | Propósito |
|---------|-----------|
| `public/mozos.html` | Página de gestión de mozos |
| `public/assets/js/shared.js` | Funciones compartidas (apiGet, apiPost, etc.) |
| `public/assets/js/notifications.js` | Sistema de notificaciones toast |

### App Mozos (React Native)

| Archivo | Propósito |
|---------|-----------|
| `Pages/PagosScreen.js` | Pantalla de pagos (integrar modal propina) |
| `utils/propinaHelpers.js` | Helpers para cálculos de propina |
| `services/socketService.js` | Manejo de eventos Socket.io |

---

## 🚀 Sugerencias y Mejoras Futuras

### Funcionalidades Pendientes

1. **Presets rápidos en el modal** (10%, 15%, 20%)
2. **KPI "Mejor mozo del día"** por propinas
3. **Línea "Propina sugerida" en PDF de boucher**
4. **Alerta al admin** si propina > 20% del promedio
5. **Diseño responsive** de mozos.html para tablets
6. **Gráficos Chart.js** de ventas y propinas por mozo
7. **Exportación Excel** de reportes de propinas
8. **Notificaciones push** al mozo cuando registre propina

### Integraciones Pendientes

1. **Extender `socket/events.js`** con funciones `emitPropinaRegistrada` y `emitPropinaActualizada`
2. **Actualizar `cierreCajaController`** para incluir propinas
3. **Modificar `reportesController`** para agregar propinas por mozo
4. **Implementar gráficos** en mozos.html usando Chart.js

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
