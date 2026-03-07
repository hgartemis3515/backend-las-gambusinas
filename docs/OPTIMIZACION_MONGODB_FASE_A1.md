# Fase A1: Optimización Base MongoDB y Consultas - Las Gambusinas POS

## Fecha: 2026-03-06
## Objetivo: Reducir latencia en endpoints críticos mediante índices, lean() y proyecciones

---

## 1. MAPEO DE QUERIES CRÍTICAS

### 1.1 Endpoint: GET /api/comanda/fechastatus/:fecha (CRÍTICO - Cocina)
**Archivo:** `src/repository/comanda.repository.js` → `listarComandaPorFechaEntregado`
**Uso:** App de Cocina carga comandas del día para tablero Kanban

**Filtros aplicados:**
- `createdAt` (rango de fecha: inicio y fin del día)
- `status: { $ne: "entregado" }` (excluye entregadas)
- `IsActive: true` (solo activas)

**Ordenamiento:** `comandaNumber: -1`

**Populate actual:**
```javascript
.populate('mozos')                          // TODOS los campos del mozo
.populate({ path: 'mesas', populate: 'area' }) // Mesa completa + área
.populate('cliente')                        // Cliente completo
.populate('platos.plato')                   // Plato completo
```

**Campos realmente usados por la UI de Cocina:**
```javascript
{
  _id: string,
  comandaNumber: number,
  status: string,
  prioridadOrden: number,
  createdAt: Date,
  observaciones: string,
  
  // Referencias populadas (solo nombres):
  mesas: { nummesa: number },
  mozos: { name: string },
  
  // Platos con campos mínimos:
  platos: [{
    platoId: number,
    estado: string,
    eliminado: boolean,
    anulado: boolean,
    complementosSeleccionados: [{ opcion: string }],
    notaEspecial: string,
    plato: { nombre: string, precio: number }  // SOLO nombre y precio
  }],
  cantidades: number[]
}
```

**Problemas identificados:**
- ❌ No usa `.lean()` → documentos Mongoose pesados
- ❌ Trae TODOS los campos de mozos, mesas, cliente, platos
- ❌ No tiene índice para filtro fecha + status + IsActive
- ❌ `historialPlatos` y `historialEstados` se traen completos sin usarse

---

### 1.2 Endpoint: GET /api/comanda/fecha/:fecha (Mozos)
**Archivo:** `src/repository/comanda.repository.js` → `listarComandaPorFecha`
**Uso:** App de Mozos para validaciones y pagos

**Filtros aplicados:**
- `createdAt` (rango de fecha)
- `IsActive: true`

**Ordenamiento:** `comandaNumber: -1`

**Problemas identificados:**
- ❌ No usa `.lean()`
- ❌ Mismos populate excesivos que el anterior
- ❌ No tiene índice compuesto para fecha + IsActive

---

### 1.3 Endpoint: GET /api/comanda (General)
**Archivo:** `src/repository/comanda.repository.js` → `listarComanda`
**Uso:** Listado general, dashboard admin

**Filtros aplicados:**
- `IsActive: { $ne: false, $exists: true }`
- `eliminada: { $ne: true }`

**Ordenamiento:** `createdAt: -1, comandaNumber: -1`

**Problemas identificados:**
- ❌ No usa `.lean()`
- ❌ Populates anidados completos
- ❌ `ensurePlatosPopulated` carga TODOS los platos de la BD

---

### 1.4 Endpoint: POST /api/comanda (Creación)
**Archivo:** `src/repository/comanda.repository.js` → `agregarComanda`

**Validaciones actuales (una por plato):**
```javascript
for (let index = 0; index < data.platos.length; index++) {
    // ❌ CONSULTA INDIVIDUAL POR CADA PLATO
    platoCompleto = await platoModel.findById(platoRef);
    // o
    platoCompleto = await platoModel.findOne({ id: Number(platoRef) });
}
```

**Problema:** N platos = N consultas a MongoDB

---

## 2. ÍNDICES PROPUESTOS (Patrón ESR: Equality-Sort-Range)

### 2.1 Colección `comandas`

```javascript
// ÍNDICE 1: Comandas del día para cocina (CRÍTICO)
// Query: listarComandaPorFechaEntregado
// Filtros: IsActive=true, status!=$entregado, createdAt (rango)
// Sort: comandaNumber: -1
comandaSchema.index(
  { IsActive: 1, status: 1, createdAt: -1, comandaNumber: -1 },
  { name: 'idx_comanda_cocina_fecha' }
);

// ÍNDICE 2: Comandas activas por mesa (para pagos y estado de mesa)
// Filtros: mesas=ObjectId, IsActive=true, status!=$pagado
comandaSchema.index(
  { mesas: 1, IsActive: 1, status: 1 },
  { name: 'idx_comanda_mesa_activa' }
);

// ÍNDICE 3: Comandas por fecha general
// Query: listarComandaPorFecha
comandaSchema.index(
  { createdAt: -1, IsActive: 1, comandaNumber: -1 },
  { name: 'idx_comanda_fecha_general' }
);

// ÍNDICE 4: Para eliminación y limpieza
comandaSchema.index(
  { IsActive: 1, eliminada: 1 },
  { name: 'idx_comanda_activa_eliminada' }
);
```

### 2.2 Colección `mesas`

```javascript
// ÍNDICE 1: Búsqueda por estado y área (mapa de mesas)
mesasSchema.index(
  { estado: 1, isActive: 1, area: 1 },
  { name: 'idx_mesa_estado_area' }
);

// ÍNDICE 2: Mesas activas (listado rápido)
mesasSchema.index(
  { isActive: 1, nummesa: 1 },
  { name: 'idx_mesa_activa_num' }
);
```

### 2.3 Colección `platos`

```javascript
// ÍNDICE 1: Platos activos por tipo y categoría (menú)
platoSchema.index(
  { isActive: 1, tipo: 1, categoria: 1 },
  { name: 'idx_plato_menu' }
);

// ÍNDICE 2: Búsqueda por nombre (autocompletado)
platoSchema.index(
  { isActive: 1, nombreLower: 1 },
  { name: 'idx_plato_nombre_search' }
);
```

---

## 3. CAMPOS DESNORMALIZADOS PROPUESTOS

Para evitar múltiples `populate()` en listados frecuentes, se añadirán estos campos en `comandas`:

```javascript
// Campos desnormalizados (actualizados al crear/modificar comanda)
{
  // Datos de lectura frecuente
  mozoNombre: String,      // Ej: "Juan Pérez"
  mesaNumero: Number,      // Ej: 15
  areaNombre: String,      // Ej: "Terraza"
  clienteNombre: String,   // Ej: "María García" (null si no hay cliente)
  
  // Resumen de platos (para lista ligera)
  totalPlatos: Number,     // Cantidad total de items
  platosActivos: Number,   // Platos no eliminados/anulados
}
```

**Justificación:**
- Listados de cocina/mozos solo necesitan nombres para mostrar
- Evita joins con colecciones de mozos, mesas, áreas
- Reduce tamaño del documento poblado en ~70%

---

## 4. PROYECCIONES PROPUESTAS

### 4.1 Proyección para Cocina (endpoint ligero)

```javascript
const PROYECCION_COCINA = {
  _id: 1,
  comandaNumber: 1,
  status: 1,
  prioridadOrden: 1,
  createdAt: 1,
  updatedAt: 1,
  observaciones: 1,
  cantidades: 1,
  mozoNombre: 1,      // Campo desnormalizado
  mesaNumero: 1,      // Campo desnormalizado
  'platos.platoId': 1,
  'platos.estado': 1,
  'platos.eliminado': 1,
  'platos.anulado': 1,
  'platos.complementosSeleccionados': 1,
  'platos.notaEspecial': 1,
  'platos.plato': { nombre: 1, precio: 1 }  // Solo nombre y precio
};
```

### 4.2 Proyección para resumen de mesas (mozos)

```javascript
const PROYECCION_RESUMEN_MESA = {
  _id: 1,
  comandaNumber: 1,
  status: 1,
  precioTotal: 1,
  mesaNumero: 1,
  mozoNombre: 1,
  totalPlatos: 1,
  createdAt: 1
};
```

---

## 5. QUERIES OPTIMIZADAS

### 5.1 listarComandaPorFechaEntregado (optimizado)

```javascript
const listarComandaPorFechaEntregadoOptimizado = async (fecha) => {
  const fechaInicio = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").startOf('day').toDate();
  const fechaFin = moment.tz(fecha, "YYYY-MM-DD", "America/Lima").endOf('day').toDate();

  // Usar índice idx_comanda_cocina_fecha
  return await comandaModel.find({
    createdAt: { $gte: fechaInicio, $lte: fechaFin },
    status: { $nin: ['entregado', 'pagado'] },
    IsActive: true
  })
  .select(PROYECCION_COCINA)
  .lean()
  .sort({ prioridadOrden: -1, createdAt: -1 });
};
```

### 5.2 Validación batch de platos (agregarComanda)

```javascript
// ANTES: N consultas
for (const plato of platos) {
  await platoModel.findById(plato.plato);  // ❌ N consultas
}

// DESPUÉS: 1 consulta
const platoIds = platos.map(p => p.plato).filter(id => mongoose.Types.ObjectId.isValid(id));
const platoNumIds = platos.map(p => p.platoId).filter(id => !isNaN(Number(id)));

const platosEncontrados = await platoModel.find({
  $or: [
    { _id: { $in: platoIds } },
    { id: { $in: platoNumIds } }
  ],
  isActive: true
}).lean();

// Mapa para lookup O(1)
const platoMap = new Map(platosEncontrados.map(p => [p._id.toString(), p]));
```

---

## 6. CONFIGURACIÓN DE CONEXIÓN MONGODB

```javascript
// En database.js
mongoose.connect(process.env.DBLOCAL, {
  // Pool de conexiones
  minPoolSize: 5,
  maxPoolSize: 50,
  
  // Timeouts
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 10000,
  
  // Otras optimizaciones
  bufferCommands: false,  // Desactivar buffering
  family: 4              // IPv4
});
```

---

## 7. IMPACTO ESPERADO

| Endpoint | Antes | Después | Mejora |
|----------|-------|---------|--------|
| /fechastatus/:fecha | ~800ms, 50KB payload | ~100ms, 10KB | 8x más rápido, 80% menos datos |
| /fecha/:fecha | ~600ms | ~80ms | 7x más rápido |
| GET /comanda | ~1200ms | ~200ms | 6x más rápido |
| POST /comanda (10 platos) | ~300ms (11 queries) | ~50ms (2 queries) | 6x más rápido |

---

## 8. ÍNDICES A ELIMINAR (si existen y no se usan)

Los siguientes índices simples pueden ser redundantes si se crean los compuestos:
- `precioTotal` (simple) → podría eliminarse si no hay queries por precio
- `version` (simple) → solo para auditoría, considerar eliminar
- `prioridadOrden` (simple) → absorbido por índice compuesto

---

## 9. ORDEN DE IMPLEMENTACIÓN

1. ✅ Crear este documento de análisis
2. ✅ Añadir índices a modelos (sin eliminar existentes aún)
3. ✅ Añadir campos desnormalizados a esquema Comanda
4. ✅ Refactorizar repositories con lean() y proyecciones
5. ✅ Optimizar validación batch en agregarComanda
6. ✅ Crear endpoint optimizado para cocina
7. ✅ Crear endpoint de resumen de mesas
8. ✅ Ajustar apps frontend
9. ✅ Ejecutar script de migración de índices
10. ✅ Optimizar listarComanda con lean() y proyecciones

---

## 10. CAMBIOS IMPLEMENTADOS (Resumen)

### Archivos Modificados:

1. **`src/database/models/comanda.model.js`**
   - Añadidos campos desnormalizados: `mozoNombre`, `mesaNumero`, `areaNombre`, `clienteNombre`, `totalPlatos`, `platosActivos`
   - Añadidos 5 índices compuestos optimizados

2. **`src/database/models/mesas.model.js`**
   - Añadidos 2 índices para búsqueda por estado y área

3. **`src/database/models/plato.model.js`**
   - Añadidos 2 índices para menú y búsqueda

4. **`src/repository/comanda.repository.js`**
   - Añadidas proyecciones: `PROYECCION_COCINA`, `PROYECCION_RESUMEN_MESA`, `PROYECCION_PAGOS`
   - Optimizada `listarComandaPorFechaEntregado` con lean(), proyecciones y populate mínimo
   - Optimizada `listarComandaPorFecha` con lean() y proyecciones
   - Añadida `validarPlatosBatch()` para validación batch de platos
   - Añadida `obtenerDatosDesnormalizados()` para poblar campos desnormalizados
   - Actualizada `agregarComanda` para usar validación batch y poblar campos desnormalizados

5. **`src/controllers/comandaController.js`**
   - Añadido endpoint `GET /api/comanda/cocina/:fecha` optimizado para cocina

6. **`src/controllers/mesasController.js`**
   - Añadido endpoint `GET /api/mesas/resumen` para mapa de mesas
   - Añadido endpoint `GET /api/mesas/con-comandas` para vista rápida

### Archivos Frontend Actualizados:

7. **`appcocina/src/components/Principal/comandastyle.jsx`**
   - Actualizado para usar endpoint `/api/comanda/cocina/:fecha`
   - Añadido log de tiempo de respuesta

8. **`Las-Gambusinas/apiConfig.js`**
   - Añadidas funciones para endpoints optimizados: `getMesasResumenAPI()`, `getMesasConComandasAPI()`, `getComandaCocinaAPI()`

9. **`Las-Gambusinas/Components/selects/selectable.js`**
   - Actualizado para usar endpoint `/api/mesas/resumen` con fallback

### Archivos Creados:

1. **`docs/OPTIMIZACION_MONGODB_FASE_A1.md`**
   - Documentación completa del análisis y cambios

2. **`src/database/migrations/crearIndicesFaseA1.js`**
   - Script de migración para crear índices en MongoDB (EJECUTADO ✅)

---

## 11. ÍNDICES CREADOS (Verificado en MongoDB)

### Colección `comandas` (12 índices totales):
- `idx_comanda_cocina_fecha` - Para endpoint cocina
- `idx_comanda_mesa_activa` - Para pagos y estado mesa
- `idx_comanda_fecha_general` - Para listado por fecha
- `idx_comanda_activa_eliminada` - Para filtrado
- `idx_comanda_prioridad_cocina` - Para ordenamiento

### Colección `mesas` (5 índices totales):
- `idx_mesa_estado_area` - Para mapa de mesas
- `idx_mesa_activa_num` - Para listado rápido

### Colección `platos` (7 índices totales):
- `idx_plato_menu` - Para menú filtrado
- `idx_plato_nombre_search` - Para autocompletado

---

## 12. PRÓXIMOS PASOS (Fase A2 sugerida)

1. **Monitoreo continuo:**
   - Verificar tiempos en logs con header `X-Response-Time`
   - Usar `explain()` en MongoDB para verificar uso de índices

2. **Optimizaciones adicionales:**
   - Implementar caché Redis para comandas activas
   - Considerar MongoDB Change Streams para tiempo real
   - Implementar paginación en endpoints de listado

3. **Backfill de campos desnormalizados:**
   - Para comandas existentes, ejecutar migración que poblé los campos `mozoNombre`, `mesaNumero`, etc.

---

## 10. NOTAS PARA TESTING

Después de implementar, usar MongoDB explain() para verificar uso de índices:

```javascript
// En MongoDB shell o código
db.comandas.find({
  createdAt: { $gte: ISODate("2026-03-06T00:00:00Z"), $lte: ISODate("2026-03-06T23:59:59Z") },
  status: { $ne: "entregado" },
  IsActive: true
}).sort({ comandaNumber: -1 }).explain('executionStats');
```

Verificar que:
- `executionStats.totalDocsExamined` sea bajo
- `winningPlan.inputStage.indexName` use el índice esperado
- `executionStats.executionTimeMillis` < 50ms
