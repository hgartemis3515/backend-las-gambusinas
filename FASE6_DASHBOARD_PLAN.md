# FASE 6: Dashboard Administrativo - Plan de Arquitectura Completo

## 🎯 Objetivo
Construir un Dashboard principal basado en el template POSDASH que consolide:
- KPIs del día en tiempo real
- Tabla de comandas activas con actualizaciones WebSocket granulares
- Vista rápida de mesas y platos más vendidos
- Acciones rápidas sobre comandas
- Páginas individuales para cada módulo (mesas, áreas, mozos, platos, comandas, bouchers, clientes, auditoría, cierre de caja)

## 📊 Estado Actual del Dashboard (Análisis Completo)

### ✅ LO QUE YA ESTÁ CONSTRUIDO

#### 1. Dashboard Principal (`index.html`)
- **Estructura Base**: Sidebar, Navbar, Layout completo
- **5 Cards de Resumen**:
  - ✅ Card Mesas Ocupadas (con datos reales desde API)
  - ✅ Card Ventas Hoy (con datos reales desde API)
  - ✅ Card Top Platos (con datos reales desde API)
  - ✅ Card Top Mozos (con datos reales desde API)
  - ✅ Card Alertas (con datos reales desde API)
- **Sistema de Autenticación**: Verificación de token, logout
- **Tema Claro/Oscuro**: Toggle funcional
- **Búsqueda Global**: UI implementada (falta funcionalidad)
- **Notificaciones**: UI implementada (falta funcionalidad)
- **Mensajes**: UI implementada (falta funcionalidad)
- **Estado de Caja**: Badge en navbar (falta funcionalidad)

#### 2. Funciones Backend (`admin-functions.js`)
**CRUD Completo Implementado:**
- ✅ **Mesas**: `loadMesas()`, `editMesa()`, `saveMesa()`, `deleteMesa()`, `activarModoLibreTotal()`
- ✅ **Áreas**: `loadAreas()`, `editArea()`, `saveArea()`, `deleteArea()`
- ✅ **Mozos**: `loadMozos()`, `editMozo()`, `saveMozo()`, `deleteMozo()`
- ✅ **Platos**: `loadPlatos()`, `editPlato()`, `savePlato()`, `deletePlato()`, `loadPlatosEliminados()`
- ✅ **Comandas**: `loadComandas()` (solo lectura, falta edición/eliminación desde dashboard)
- ✅ **Bouchers**: `loadBouchers()`, `loadBouchersPorFecha()` (solo lectura)
- ✅ **Clientes**: `loadClientes()`, `editCliente()`, `saveCliente()`, `deleteCliente()`
- ✅ **Auditoría**: `loadAuditoria()` (solo lectura, filtros por tipo y fecha)
- ✅ **Cierre de Caja**: `loadCierresCaja()`, `crearCierreCaja()`, `editarCierreCaja()`, `eliminarCierreCaja()`

**Funciones Auxiliares:**
- ✅ `showTab()` - Navegación entre tabs
- ✅ `openModal()` - Sistema de modales genérico
- ✅ `closeModal()` - Cerrar modales
- ✅ `showAlert()` - Sistema de alertas/notificaciones
- ✅ `getAuthHeaders()` - Headers de autenticación

#### 3. Scripts de Soporte
- ✅ `dashboard.js` - Lógica de carga de datos del dashboard principal
- ✅ `header.js` - Funcionalidad del navbar (búsqueda, notificaciones, mensajes)
- ✅ `sidebar.js` - Navegación del sidebar
- ✅ `login.js` - Sistema de login

#### 4. Estilos CSS
- ✅ `dashboard-premium.css` - Estilos del dashboard
- ✅ `header-premium.css` - Estilos del header

### ❌ LO QUE FALTA POR CONSTRUIR

#### 1. Páginas HTML Individuales (CRÍTICO)
**Todas las páginas referenciadas en el sidebar NO EXISTEN:**
- ❌ `/dashboard/pages/mesas.html` - Página de gestión de mesas
- ❌ `/dashboard/pages/areas.html` - Página de gestión de áreas
- ❌ `/dashboard/pages/mozos.html` - Página de gestión de mozos
- ❌ `/dashboard/pages/platos.html` - Página de gestión de platos
- ❌ `/dashboard/pages/comandas.html` - Página de gestión de comandas
- ❌ `/dashboard/pages/bouchers.html` - Página de visualización de bouchers
- ❌ `/dashboard/pages/clientes.html` - Página de gestión de clientes
- ❌ `/dashboard/pages/auditoria.html` - Página de auditoría
- ❌ `/dashboard/pages/cierre-caja.html` - Página de cierre de caja

**Nota**: Las funciones CRUD ya existen en `admin-functions.js`, pero faltan las páginas HTML que las utilicen.

#### 2. Dashboard Principal - Funcionalidades Faltantes
- ❌ **Tabla de Comandas en Vivo**: No existe tabla que muestre comandas activas
- ❌ **Integración WebSocket**: No hay conexión WebSocket para actualizaciones en tiempo real
- ❌ **KPIs Avanzados**: Faltan métricas como:
  - Tiempo medio de preparación
  - Comandas activas (en_espera, recoger, entregado)
  - Ocupación de mesas en tiempo real
- ❌ **Vista Rápida de Mesas**: Grid visual de mesas por estado
- ❌ **Top Platos Detallado**: Lista completa de platos más vendidos
- ❌ **Acciones Rápidas sobre Comandas**: Ver/Editar/Eliminar/Pagar desde dashboard

#### 3. Funcionalidades del Header/Navbar
- ❌ **Búsqueda Global Funcional**: La UI existe pero no busca en la base de datos
- ❌ **Notificaciones en Tiempo Real**: La UI existe pero no recibe notificaciones
- ❌ **Mensajes Funcionales**: La UI existe pero no hay sistema de mensajería
- ❌ **Estado de Caja Funcional**: El badge existe pero no muestra datos reales
- ❌ **Alertas Urgentes**: El badge existe pero no muestra alertas reales

#### 4. Integración WebSocket (CRÍTICO)
- ❌ **Conexión WebSocket**: No hay conexión a Socket.io
- ❌ **Eventos en Tiempo Real**: No se escuchan eventos `plato-actualizado-batch`, `comanda-actualizada`, etc.
- ❌ **Actualización Granular**: No se actualizan solo las filas afectadas
- ❌ **Highlight Visual**: No hay feedback visual cuando hay cambios
- ❌ **Room Management**: No hay suscripción a rooms específicos

#### 5. Funcionalidades de Comandas (Pendientes)
- ❌ **Editar Comanda desde Dashboard**: Solo existe `loadComandas()`, falta edición
- ❌ **Eliminar Comanda**: No existe función de eliminación
- ❌ **Cambiar Estado de Plato**: No existe desde dashboard
- ❌ **Modal de Detalle de Comanda**: No existe modal completo
- ❌ **Filtros y Búsqueda**: No hay filtros por estado, mesa, mozo, fecha

#### 6. Mejoras de UX/UI
- ❌ **Estilo POSDASH**: El dashboard actual no usa el template POSDASH completamente
- ❌ **Responsive**: No está completamente optimizado para móvil/tablet
- ❌ **Animaciones**: Faltan animaciones de transición
- ❌ **Loading States**: Algunos componentes no tienen estados de carga claros
- ❌ **Error Handling**: Falta manejo de errores visual en algunos componentes

### 📋 Funciones que Tienen vs Funciones que Faltan

#### ✅ Funciones Implementadas (admin-functions.js)
| Módulo | Cargar | Crear | Editar | Eliminar | Filtros | Búsqueda |
|--------|--------|-------|--------|----------|---------|----------|
| Mesas | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Áreas | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mozos | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Platos | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Comandas | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Bouchers | ✅ | ❌ | ❌ | ❌ | ✅ (fecha) | ❌ |
| Clientes | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Auditoría | ✅ | ❌ | ❌ | ❌ | ✅ (tipo, fecha) | ❌ |
| Cierre Caja | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |

#### ❌ Funciones Faltantes
1. **Comandas**:
   - Editar comanda completa
   - Eliminar comanda
   - Cambiar estado de plato individual
   - Marcar comanda como pagada
   - Ver detalle completo de comanda

2. **Bouchers**:
   - Generar boucher desde comanda
   - Imprimir boucher
   - Exportar boucher (PDF)

3. **Filtros y Búsqueda Global**:
   - Filtros por fecha, estado, mesa, mozo en todas las páginas
   - Búsqueda global funcional en header
   - Búsqueda dentro de cada página

4. **Notificaciones y Mensajes**:
   - Sistema de notificaciones en tiempo real
   - Sistema de mensajería entre usuarios
   - Alertas urgentes (mesas pagadas, comandas pendientes)

5. **Reportes y Estadísticas**:
   - Reportes de ventas por período
   - Estadísticas de mozos
   - Estadísticas de platos
   - Gráficos y visualizaciones

### 🎯 Lo que Estaba Planeado Hacer Anteriormente

Según el código existente y la estructura, se planeaba:

1. **Sistema de Páginas Individuales**: Cada módulo (mesas, áreas, mozos, etc.) debería tener su propia página HTML con:
   - Tabla de datos
   - Botones de acción (crear, editar, eliminar)
   - Modales para formularios
   - Filtros y búsqueda

2. **Dashboard Centralizado**: Un dashboard principal que muestre:
   - Resumen de todas las tablas (✅ Implementado parcialmente)
   - KPIs en tiempo real (❌ Falta integración WebSocket)
   - Tabla de comandas activas (❌ No existe)
   - Acciones rápidas (❌ No existe)

3. **Integración WebSocket**: Para actualizaciones en tiempo real de:
   - Comandas activas
   - Estado de mesas
   - Notificaciones
   - Alertas

4. **Sistema de Búsqueda Global**: Búsqueda unificada que permita buscar:
   - Mesas por número
   - Platos por nombre
   - Clientes por nombre
   - Comandas por número

5. **Sistema de Notificaciones**: Para alertar sobre:
   - Mesas pagadas pendientes de cierre
   - Comandas con platos listos para recoger
   - Alertas del sistema

## 📁 Estructura de Archivos Propuesta

```
Backend-LasGambusinas/public/dashboard/
├── index.html                    # Dashboard principal (basado en POSDASH)
├── login.html                    # Ya existe
├── assets/
│   ├── css/
│   │   ├── dashboard-premium.css    # Ya existe (mantener)
│   │   ├── header-premium.css       # Ya existe (mantener)
│   │   └── posdash-integration.css  # NUEVO: Estilos específicos POSDASH
│   ├── js/
│   │   ├── dashboard.js            # Ya existe (modificar)
│   │   ├── dashboard-kpis.js       # NUEVO: Lógica de KPIs
│   │   ├── dashboard-comandas.js   # NUEVO: Tabla de comandas en vivo
│   │   ├── dashboard-websocket.js  # NUEVO: Integración WebSocket
│   │   ├── dashboard-mesas.js      # NUEVO: Vista rápida de mesas
│   │   └── admin-functions.js      # Ya existe (mantener)
│   └── vendor/
│       └── [copiar assets necesarios de POSDASH]
│           ├── remixicon/
│           ├── line-awesome/
│           └── backend.css (del template)
```

## 🎨 Componentes a Reutilizar del Template POSDASH

### 1. Layout Base
- **Sidebar**: `iq-sidebar sidebar-default` con estructura de menú
- **Top Navbar**: `iq-top-navbar` con búsqueda y notificaciones
- **Wrapper**: `wrapper` contenedor principal
- **Cards**: Estilo de tarjetas KPI del `index.html` del template

### 2. Estilos CSS
- Copiar `backend.css` y `backend-plugin.min.css` del template
- Mantener compatibilidad con estilos existentes (`dashboard-premium.css`)
- Usar colores y tipografía del template POSDASH

### 3. Componentes Visuales
- **Cards KPI**: Reutilizar estructura de cards del dashboard del template
- **Tablas**: Usar estilo de `tables-basic.html` o `table-data.html`
- **Badges**: Para estados de comandas (en_espera, recoger, entregado, pagado)
- **Modals**: Para detalle/edición de comandas

## 🔌 Integración WebSocket

### Eventos a Escuchar (ya implementados en FASE 2-5)
1. **`plato-actualizado-batch`** (FASE 5): Batch de platos actualizados
   - Actualizar solo la fila de comanda afectada
   - Actualizar KPIs relacionados

2. **`comanda-actualizada`** (si existe): Actualización completa de comanda
   - Actualizar fila completa en tabla

3. **`comanda-eliminada`**: Eliminación de comanda
   - Remover de tabla y actualizar KPIs

### Room/Namespace
- **Namespace**: `/admin` (si existe) o usar `/mozos` con room específico
- **Room**: `admin-dashboard` o `dashboard-{fecha}`

### Lógica de Actualización
- **Granular**: Solo actualizar fila afectada, no recargar toda la tabla
- **Highlight visual**: Borde animado o fondo temporal en fila actualizada
- **Debounce**: Agrupar múltiples actualizaciones si vienen muy rápido

## 📊 KPIs a Implementar

### 1. Comandas Activas
- **Cálculo**: Suma de comandas con estado `en_espera`, `recoger`, `entregado` (no pagado)
- **Actualización**: Cada evento `plato-actualizado` o cada 5-10s
- **Visual**: Card con icono, número grande, tendencia (↑↓)

### 2. Ventas del Día
- **Cálculo**: Total facturado hoy desde bouchers con fecha de hoy
- **Endpoint**: `/api/boucher?fecha=${hoy}`
- **Actualización**: Cada 30s o al recibir evento de nuevo boucher
- **Visual**: Card con icono, monto en S/, comparación con ayer

### 3. Ocupación de Mesas
- **Cálculo**: `(mesas_ocupadas + mesas_preparadas) / total_mesas * 100`
- **Endpoint**: `/api/mesas` con filtro por estado
- **Actualización**: Cada 10s o al cambiar estado de mesa
- **Visual**: Card con porcentaje, barra de progreso

### 4. Tiempo Medio de Preparación
- **Cálculo**: Promedio de `tiempos.recoger - tiempos.pedido` de platos entregados hoy
- **Endpoint**: `/api/comanda?fecha=${hoy}` con cálculo en frontend
- **Actualización**: Cada 30s o al entregar plato
- **Visual**: Card con tiempo en minutos, icono de reloj

## 📋 Tabla de Comandas en Vivo

### Columnas
1. **# Comanda**: Número de comanda (link a detalle)
2. **Mesa**: Número y área de mesa
3. **Mozo**: Nombre del mozo
4. **Platos**: 
   - Total de platos
   - Badges: `pedido`, `recoger`, `entregado`, `pagado`
5. **Estado Global**: Badge con estado de comanda
6. **Hora**: Hora de creación o última actualización
7. **Acciones**: Botones Ver/Editar/Eliminar/Pagar

### Funcionalidades
- **Ordenamiento**: Por defecto por hora (más reciente primero)
- **Filtros**: Por estado, mesa, mozo
- **Búsqueda**: Buscar por número de comanda o mesa
- **Paginación**: Si hay muchas comandas (límite 50 por página)
- **Actualización granular**: Solo fila afectada, highlight visual 2s

### Acciones Rápidas
- **Ver Detalle**: Modal con información completa de comanda
- **Editar**: Modal de edición (reutilizar lógica existente)
- **Eliminar**: Confirmación + llamada a endpoint + auditoría
- **Pagar**: Cambiar estado global a `pagado` (si todos los platos están entregados)

## 🗺️ Vista Rápida de Mesas

### Componente Lateral o Inferior
- **Grid de mesas**: Cards pequeñas por estado
- **Estados**: Libre (verde), Pedido (amarillo), Preparado (azul), Pagado (gris)
- **Click**: Abrir modal con comandas de esa mesa
- **Actualización**: Cada 10s o al cambiar estado

## 🍽️ Top Platos Más Vendidos

### Componente Inferior
- **Lista top 5-10**: Platos más vendidos del día
- **Datos**: Desde bouchers o comandas del día
- **Visual**: Lista con nombre, cantidad vendida, icono
- **Actualización**: Cada 60s

## 🔄 Flujo de Datos

### Inicialización
1. Cargar KPIs (paralelo, con timeout individual)
2. Cargar comandas del día (últimas 50)
3. Conectar WebSocket
4. Suscribirse a eventos

### Actualización en Tiempo Real
1. Recibir evento `plato-actualizado-batch`
2. Identificar comandas afectadas
3. Actualizar solo filas afectadas en tabla
4. Recalcular KPIs relacionados
5. Aplicar highlight visual

### Fallback
- Si WebSocket falla: Polling cada 10s
- Si API falla: Mostrar mensaje de error, mantener datos anteriores

## 🛠️ Endpoints a Usar (Ya Existentes)

### KPIs
- `GET /api/comanda?fecha=${hoy}` - Comandas del día
- `GET /api/boucher?fecha=${hoy}` - Ventas del día
- `GET /api/mesas` - Estado de mesas

### Comandas
- `GET /api/comanda/:id` - Detalle de comanda
- `PUT /api/comanda/:id` - Editar comanda
- `DELETE /api/comanda/:id` - Eliminar comanda
- `PUT /api/comanda/:id/plato/:platoId/estado` - Cambiar estado de plato

### WebSocket
- Namespace: `/admin` o `/mozos`
- Eventos: `plato-actualizado-batch`, `comanda-actualizada`, `comanda-eliminada`

## 📝 Orden de Implementación (Actualizado con Estado Actual)

### Fase 6.0: Páginas Individuales (PRIORIDAD ALTA - CRÍTICO)
**Estado**: ❌ NO EXISTEN - Las funciones CRUD ya están implementadas, solo faltan las páginas HTML

1. **Crear `/dashboard/pages/mesas.html`**
   - Tabla de mesas con datos desde `loadMesas()`
   - Botones Crear/Editar/Eliminar
   - Modal para formulario (usar `openModal()` existente)
   - Filtros por área y estado
   - Búsqueda por número de mesa

2. **Crear `/dashboard/pages/areas.html`**
   - Tabla de áreas con datos desde `loadAreas()`
   - Botones Crear/Editar/Eliminar
   - Modal para formulario
   - Filtros por estado (activa/inactiva)

3. **Crear `/dashboard/pages/mozos.html`**
   - Tabla de mozos con datos desde `loadMozos()`
   - Botones Crear/Editar/Eliminar
   - Modal para formulario
   - Filtros por estado (activo/inactivo)

4. **Crear `/dashboard/pages/platos.html`**
   - Tabla de platos con datos desde `loadPlatos()`
   - Botones Crear/Editar/Eliminar
   - Modal para formulario
   - Filtros por categoría y estado
   - Búsqueda por nombre
   - Tab adicional para "Platos Eliminados" (usar `loadPlatosEliminados()`)

5. **Crear `/dashboard/pages/comandas.html`**
   - Tabla de comandas con datos desde `loadComandas()`
   - Ver detalle de comanda (modal)
   - Filtros por estado, mesa, mozo, fecha
   - Búsqueda por número de comanda
   - **FALTA**: Funciones de edición/eliminación (agregar a `admin-functions.js`)

6. **Crear `/dashboard/pages/bouchers.html`**
   - Tabla de bouchers con datos desde `loadBouchers()`
   - Filtro por fecha (usar `loadBouchersPorFecha()`)
   - Ver detalle de boucher (modal)
   - Exportar/Imprimir boucher (pendiente)

7. **Crear `/dashboard/pages/clientes.html`**
   - Tabla de clientes con datos desde `loadClientes()`
   - Botones Crear/Editar/Eliminar
   - Modal para formulario
   - Filtros por estado
   - Búsqueda por nombre

8. **Crear `/dashboard/pages/auditoria.html`**
   - Tabla de auditoría con datos desde `loadAuditoria()`
   - Filtros por tipo y fecha
   - Búsqueda por usuario o acción
   - Exportar reporte (pendiente)

9. **Crear `/dashboard/pages/cierre-caja.html`**
   - Tabla de cierres con datos desde `loadCierresCaja()`
   - Botón Crear Cierre (usar `crearCierreCaja()`)
   - Editar/Eliminar cierre
   - Modal para formulario
   - Filtros por fecha

**Nota**: Todas estas páginas deben usar el mismo layout (sidebar + navbar) que `index.html` y reutilizar las funciones de `admin-functions.js`.

### Fase 6.1: Layout Base POSDASH
**Estado**: ⚠️ PARCIAL - El layout existe pero no usa completamente el template POSDASH

1. Copiar estructura HTML del template `index.html` de POSDASH
2. Integrar sidebar y navbar existentes (ya están)
3. Copiar CSS necesario del template (`backend.css`, `backend-plugin.min.css`)
4. Asegurar compatibilidad con estilos actuales (`dashboard-premium.css`)
5. Aplicar estilos POSDASH a todas las páginas nuevas

### Fase 6.2: KPIs Avanzados
**Estado**: ⚠️ PARCIAL - Existen 5 cards básicas, faltan KPIs avanzados y WebSocket

1. **Mejorar Cards Existentes**:
   - ✅ Card Mesas Ocupadas (existe, mejorar con WebSocket)
   - ✅ Card Ventas Hoy (existe, mejorar con comparación ayer)
   - ✅ Card Top Platos (existe, expandir a top 5-10)
   - ✅ Card Top Mozos (existe, mejorar visualización)
   - ✅ Card Alertas (existe, conectar con notificaciones reales)

2. **Agregar Nuevos KPIs**:
   - ❌ Card Comandas Activas (nuevo)
   - ❌ Card Tiempo Medio Preparación (nuevo)
   - ❌ Card Ocupación Mesas % (mejorar card existente)

3. Implementar `dashboard-kpis.js` para:
   - Cálculo de métricas avanzadas
   - Actualización periódica (cada 5-10s)
   - Integración con WebSocket para actualización en tiempo real

### Fase 6.3: Tabla de Comandas en Vivo
**Estado**: ❌ NO EXISTE - Es la funcionalidad principal pendiente

1. Crear estructura de tabla en `index.html`
2. Implementar `dashboard-comandas.js`:
   - Cargar comandas del día (últimas 50)
   - Renderizar tabla con columnas: # Comanda, Mesa, Mozo, Platos, Estado, Hora, Acciones
   - Implementar acciones: Ver/Editar/Eliminar/Pagar
   - Filtros por estado, mesa, mozo
   - Búsqueda por número de comanda
   - Paginación (50 por página)
3. Crear modal de detalle de comanda
4. Crear modal de edición de comanda
5. Implementar función de eliminar comanda (agregar a `admin-functions.js`)
6. Implementar función de pagar comanda (agregar a `admin-functions.js`)

### Fase 6.4: WebSocket Integration (CRÍTICO)
**Estado**: ❌ NO EXISTE - Es crítico para tiempo real

1. Crear `dashboard-websocket.js`:
   - Conectar a namespace `/mozos` o crear `/admin`
   - Suscribirse a room `admin-dashboard` o `dashboard-{fecha}`
   - Escuchar eventos:
     - `plato-actualizado-batch` (FASE 5)
     - `comanda-actualizada` (si existe)
     - `comanda-eliminada` (si existe)
     - `mesa-actualizada` (si existe)
2. Implementar actualización granular:
   - Actualizar solo fila afectada en tabla de comandas
   - Actualizar KPIs relacionados
   - Aplicar highlight visual (borde animado 2s)
3. Implementar fallback a polling si WebSocket falla
4. Integrar con `dashboard-comandas.js` y `dashboard-kpis.js`

### Fase 6.5: Componentes Adicionales del Dashboard
**Estado**: ❌ NO EXISTE

1. **Vista Rápida de Mesas**:
   - Grid de cards pequeñas por estado
   - Colores: Libre (verde), Pedido (amarillo), Preparado (azul), Pagado (gris)
   - Click para abrir modal con comandas de esa mesa
   - Actualización cada 10s o por WebSocket

2. **Top Platos Más Vendidos**:
   - Lista top 5-10 platos del día
   - Datos desde bouchers o comandas
   - Visual con nombre, cantidad, icono
   - Actualización cada 60s

3. **Filtros y Búsqueda en Dashboard**:
   - Filtros para tabla de comandas (estado, mesa, mozo)
   - Búsqueda por número de comanda
   - Búsqueda global funcional en header

4. **Modals de Detalle/Edición**:
   - Modal de detalle completo de comanda
   - Modal de edición de comanda
   - Reutilizar `openModal()` existente

### Fase 6.6: Funcionalidades del Header/Navbar
**Estado**: ⚠️ PARCIAL - UI existe, falta funcionalidad

1. **Búsqueda Global Funcional**:
   - Implementar búsqueda en `header.js`
   - Buscar en: mesas, platos, clientes, comandas
   - Mostrar resultados en dropdown
   - Navegar a página correspondiente

2. **Notificaciones en Tiempo Real**:
   - Conectar con WebSocket
   - Recibir notificaciones de: mesas pagadas, comandas listas, alertas
   - Mostrar contador en badge
   - Lista de notificaciones en dropdown
   - Marcar como leídas

3. **Mensajes Funcionales**:
   - Sistema de mensajería entre usuarios (si se implementa)
   - O mostrar mensajes del sistema

4. **Estado de Caja Funcional**:
   - Mostrar estado real de caja (abierta/cerrada)
   - Mostrar monto actual en caja
   - Click para abrir modal de cierre de caja

5. **Alertas Urgentes**:
   - Contar mesas pagadas pendientes de cierre
   - Contar comandas con platos listos para recoger
   - Mostrar contador en badge
   - Click para mostrar lista de alertas

### Fase 6.7: Mejoras de Comandas
**Estado**: ⚠️ PARCIAL - Solo existe `loadComandas()`, faltan funciones CRUD

1. **Agregar a `admin-functions.js`**:
   - `editComanda(id)` - Editar comanda completa
   - `saveComanda(event)` - Guardar cambios en comanda
   - `deleteComanda(id)` - Eliminar comanda (con confirmación y auditoría)
   - `cambiarEstadoPlato(comandaId, platoId, nuevoEstado)` - Cambiar estado de plato
   - `marcarComandaPagada(id)` - Marcar comanda como pagada
   - `verDetalleComanda(id)` - Ver detalle completo en modal

2. **Mejorar `loadComandas()`**:
   - Agregar filtros por estado, mesa, mozo, fecha
   - Agregar búsqueda por número de comanda
   - Agregar paginación
   - Agregar ordenamiento

### Fase 6.8: Mejoras de UX/UI
**Estado**: ⚠️ PARCIAL - Falta aplicar completamente POSDASH y responsive

1. **Aplicar Estilo POSDASH Completo**:
   - Copiar y adaptar `backend.css` del template
   - Aplicar a todas las páginas
   - Mantener compatibilidad con estilos actuales

2. **Responsive Design**:
   - Optimizar para móvil (< 768px)
   - Optimizar para tablet (768px - 1024px)
   - Sidebar colapsable en móvil
   - Tablas con scroll horizontal en móvil

3. **Animaciones y Transiciones**:
   - Animaciones de carga
   - Transiciones suaves entre páginas
   - Animaciones de highlight en actualizaciones WebSocket
   - Animaciones de modales

4. **Loading States Mejorados**:
   - Skeletons en lugar de spinners
   - Estados de carga por sección
   - Estados de error claros

5. **Error Handling Visual**:
   - Mensajes de error claros
   - Retry automático en errores de red
   - Fallbacks visuales

## ✅ Criterios de Éxito

- ✅ Dashboard carga en <2s con placeholders
- ✅ KPIs se actualizan en tiempo real (<1s delay)
- ✅ Tabla de comandas actualiza solo filas afectadas
- ✅ Highlight visual claro cuando hay cambios
- ✅ WebSocket funciona sin polling innecesario
- ✅ Fallback a polling si WebSocket falla
- ✅ Estilo visual consistente con POSDASH
- ✅ Responsive en móvil/tablet

## 🚀 Próximos Pasos (Priorizados)

### Prioridad CRÍTICA (Bloquea funcionalidad básica)
1. **Fase 6.0**: Crear páginas HTML individuales para cada módulo
   - Sin estas páginas, el sidebar no funciona
   - Las funciones CRUD ya existen, solo falta la UI
   - **Estimado**: 2-3 días

### Prioridad ALTA (Funcionalidad principal)
2. **Fase 6.3**: Tabla de comandas en vivo en dashboard principal
   - Es la funcionalidad principal del dashboard
   - **Estimado**: 1-2 días

3. **Fase 6.4**: Integración WebSocket
   - Crítico para tiempo real
   - **Estimado**: 1 día

4. **Fase 6.7**: Funciones CRUD de comandas
   - Necesario para acciones rápidas
   - **Estimado**: 1 día

### Prioridad MEDIA (Mejoras y completitud)
5. **Fase 6.2**: KPIs avanzados
   - Mejorar cards existentes y agregar nuevas
   - **Estimado**: 1 día

6. **Fase 6.5**: Componentes adicionales
   - Vista rápida de mesas, top platos
   - **Estimado**: 1 día

7. **Fase 6.6**: Funcionalidades del header
   - Búsqueda global, notificaciones, estado de caja
   - **Estimado**: 1-2 días

### Prioridad BAJA (Pulido y UX)
8. **Fase 6.1**: Layout POSDASH completo
   - Aplicar estilos del template
   - **Estimado**: 1 día

9. **Fase 6.8**: Mejoras de UX/UI
   - Responsive, animaciones, loading states
   - **Estimado**: 2-3 días

## 📋 Resumen de Tareas Pendientes

### Páginas HTML a Crear (9 páginas)
- [ ] `/dashboard/pages/mesas.html`
- [ ] `/dashboard/pages/areas.html`
- [ ] `/dashboard/pages/mozos.html`
- [ ] `/dashboard/pages/platos.html`
- [ ] `/dashboard/pages/comandas.html`
- [ ] `/dashboard/pages/bouchers.html`
- [ ] `/dashboard/pages/clientes.html`
- [ ] `/dashboard/pages/auditoria.html`
- [ ] `/dashboard/pages/cierre-caja.html`

### Scripts JavaScript a Crear (4 scripts)
- [ ] `dashboard-kpis.js` - KPIs avanzados
- [ ] `dashboard-comandas.js` - Tabla de comandas en vivo
- [ ] `dashboard-websocket.js` - Integración WebSocket
- [ ] `dashboard-mesas.js` - Vista rápida de mesas (opcional)

### Funciones a Agregar a `admin-functions.js` (6 funciones)
- [ ] `editComanda(id)` - Editar comanda
- [ ] `saveComanda(event)` - Guardar comanda
- [ ] `deleteComanda(id)` - Eliminar comanda
- [ ] `cambiarEstadoPlato(comandaId, platoId, nuevoEstado)` - Cambiar estado
- [ ] `marcarComandaPagada(id)` - Marcar como pagada
- [ ] `verDetalleComanda(id)` - Ver detalle completo

### Funcionalidades del Header a Implementar (5 funcionalidades)
- [ ] Búsqueda global funcional
- [ ] Notificaciones en tiempo real
- [ ] Mensajes funcionales
- [ ] Estado de caja funcional
- [ ] Alertas urgentes funcionales

### Mejoras de Dashboard Principal (4 mejoras)
- [ ] Tabla de comandas en vivo
- [ ] KPIs avanzados (Comandas Activas, Tiempo Medio)
- [ ] Vista rápida de mesas
- [ ] Top platos detallado

### Estilos CSS a Agregar (1 archivo)
- [ ] `posdash-integration.css` - Estilos específicos POSDASH

## ⏱️ Estimación Total

- **Tiempo mínimo (solo crítico)**: 5-7 días
- **Tiempo completo (todo el plan)**: 12-15 días
- **Tiempo recomendado (crítico + alta prioridad)**: 7-9 días

## 🎯 Criterios de Éxito Actualizados

### Funcionalidad Básica (Mínimo Viable)
- ✅ Todas las páginas HTML individuales creadas y funcionales
- ✅ Dashboard principal con tabla de comandas en vivo
- ✅ WebSocket funcionando para actualizaciones en tiempo real
- ✅ Funciones CRUD de comandas implementadas

### Funcionalidad Completa (Ideal)
- ✅ Dashboard carga en <2s con placeholders
- ✅ KPIs se actualizan en tiempo real (<1s delay)
- ✅ Tabla de comandas actualiza solo filas afectadas
- ✅ Highlight visual claro cuando hay cambios
- ✅ WebSocket funciona sin polling innecesario
- ✅ Fallback a polling si WebSocket falla
- ✅ Estilo visual consistente con POSDASH
- ✅ Responsive en móvil/tablet
- ✅ Búsqueda global funcional
- ✅ Notificaciones en tiempo real
- ✅ Todas las funcionalidades del header implementadas

---

## 📚 Referencias y Recursos Adicionales

### Documentación de Tecnologías
- **Socket.io**: https://socket.io/docs/v4/
- **Bootstrap 4**: https://getbootstrap.com/docs/4.6/
- **Line Awesome Icons**: https://icons8.com/line-awesome
- **Remix Icon**: https://remixicon.com/
- **CounterUp2**: https://github.com/bfintal/Counter-Up2

### Archivos de Referencia en el Proyecto
- **Template POSDASH**: `TEMPLATES/PosDash/html/backend/index.html`
- **Eventos WebSocket**: `Backend-LasGambusinas/src/socket/events.js`
- **WebSocket Batching**: `Backend-LasGambusinas/src/utils/websocketBatch.js`
- **Funciones Admin**: `Backend-LasGambusinas/public/dashboard/assets/js/admin-functions.js`
- **Dashboard Actual**: `Backend-LasGambusinas/public/dashboard/index.html`

### Estructura de Eventos WebSocket Disponibles

#### Namespace: `/mozos`
- **`plato-actualizado-batch`**: Batch de platos actualizados (FASE 5)
  - Payload: `{ batch: [...], fecha: "YYYY-MM-DD", totalPlatos: Number }`
- **`plato-actualizado`**: Plato individual actualizado (FASE 2)
  - Payload: `{ comandaId, platoId, nuevoEstado, estadoAnterior, timestamp }`
- **`comanda-actualizada`**: Comanda completa actualizada
  - Payload: `{ comanda: {...}, comandaId, timestamp }`
- **`comanda-eliminada`**: Comanda eliminada
  - Payload: `{ comandaId, comanda: {...}, timestamp }`
- **`mesa-actualizada`**: Mesa actualizada
  - Payload: `{ mesaId, mesa: {...}, timestamp }`

#### Rooms Disponibles
- **`fecha-YYYY-MM-DD`**: Para comandas del día específico
- **`mesa-{mesaId}`**: Para comandas de una mesa específica
- **`admin-dashboard`**: Para dashboard administrativo (crear si no existe)

### Endpoints API Disponibles

#### Comandas
- `GET /api/comanda` - Listar comandas (query: fecha, estado, mesa, mozo)
- `GET /api/comanda/:id` - Obtener comanda por ID
- `POST /api/comanda` - Crear comanda
- `PUT /api/comanda/:id` - Actualizar comanda
- `DELETE /api/comanda/:id` - Eliminar comanda
- `PUT /api/comanda/:id/plato/:platoId/estado` - Cambiar estado de plato
- `PUT /api/comanda/:id/pagar` - Marcar comanda como pagada

#### Mesas
- `GET /api/mesas` - Listar mesas
- `GET /api/mesas/:id` - Obtener mesa por ID
- `POST /api/mesas` - Crear mesa
- `PUT /api/mesas/:id` - Actualizar mesa
- `DELETE /api/mesas/:id` - Eliminar mesa
- `PUT /api/mesas/liberar-todas` - Liberar todas las mesas

#### Bouchers
- `GET /api/boucher` - Listar bouchers
- `GET /api/boucher/fecha/:fecha` - Listar bouchers por fecha
- `GET /api/boucher/:id` - Obtener boucher por ID

### Patrones de Código Recomendados

#### 1. Manejo de Errores
```javascript
try {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  return data;
} catch (error) {
  console.error('Error:', error);
  showAlert('Error: ' + error.message, 'error');
  return null;
}
```

#### 2. Actualización Granular
```javascript
function updateComandaRow(comandaId, updateData) {
  const row = document.getElementById(`comanda-row-${comandaId}`);
  if (!row) {
    loadComandas(); // Recargar si no existe
    return;
  }
  row.classList.add('row-updated');
  setTimeout(() => row.classList.remove('row-updated'), 2000);
}
```

#### 3. Debounce para Búsqueda
```javascript
let searchTimeout;
function handleSearch(query) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300);
}
```

### Guía de Estilos Visuales

#### Cards KPI
- **Altura**: 150-180px
- **Padding**: 20px
- **Border-radius**: 8px
- **Sombra**: `box-shadow: 0 2px 4px rgba(0,0,0,0.1)`
- **Icono**: 48x48px, color según tipo
- **Número grande**: 32-36px, bold

#### Tabla de Comandas
- **Header**: Fondo gris claro, texto bold
- **Filas**: Alternar colores (zebra striping)
- **Highlight**: Borde azul 2px, fondo azul claro 10% opacidad
- **Badges**: Tamaño pequeño (12px), padding 4px 8px

### Consideraciones de Performance
- **Lazy Loading**: Cargar datos de páginas solo cuando se accede
- **Virtual Scrolling**: Para tablas con 100+ filas
- **Debounce**: En búsquedas y filtros
- **Memoization**: Para cálculos de KPIs

### Consideraciones de Accesibilidad
- **ARIA Labels**: Agregar labels a botones sin texto
- **Keyboard Navigation**: Asegurar navegación por teclado
- **Contrast**: Verificar contraste de colores (WCAG AA)

---

**Última actualización**: 2025-02-12  
**Versión del Plan**: 2.0  
**Estado**: ✅ Completo y listo para implementación


