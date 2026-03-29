# 🖥️ Documentación Completa - Backend Las Gambusinas

**Versión:** 2.11  
**Última Actualización:** Marzo 2026  
**Tecnología:** Node.js + Express + MongoDB + Socket.io + Redis

**Propósito del documento:** Análisis completo del backend de Las Gambusinas: arquitectura, flujo de datos, carga de datos, endpoints, modelos MongoDB, WebSockets, caché, logging, integración con App Mozos, App Cocina, Dashboard Administrativo y módulo de Cocineros con configuración KDS. Documento alineado con el codebase actual (marzo 2026).

---

## 🎯 Objetivo del Sistema

### ¿Qué se está creando?

El **Backend Las Gambusinas** es el núcleo de un **sistema POS (Point of Sale) integral para restaurantes** que busca digitalizar y optimizar todas las operaciones de un restaurante tradicional. El sistema está diseñado para funcionar en tiempo real, permitiendo la comunicación instantánea entre mozos, cocina y administración.

### Visión del Proyecto

Crear un ecosistema digital completo que permita:

1. **Operación en tiempo real**: Sincronización instantánea entre todas las aplicaciones conectadas
2. **Trazabilidad completa**: Auditoría de cada acción realizada (quién, qué, cuándo, por qué)
3. **Multi-rol y multi-dispositivo**: Soporte para mozos, cocineros, supervisores y administradores
4. **Escalabilidad**: Arquitectura preparada para crecimiento (Redis, Socket.io adapter)
5. **Experiencia de usuario premium**: Interfaces modernas, animaciones fluidas, feedback visual

### Aplicaciones Conectadas

| Aplicación | Tecnología | Rol | Función Principal |
|------------|------------|-----|-------------------|
| **App Mozos** | React Native + Expo | Personal de sala | Tomar pedidos, gestionar mesas, procesar pagos |
| **App Cocina** | React + Vite | Personal de cocina | KDS (Kitchen Display System), preparación de platos |
| **Dashboard Admin** | HTML + Tailwind + Alpine.js | Administradores | Gestión completa, reportes, cierre de caja |
| **Panel Admin** | HTML + CSS + JS | Operación rápida | CRUD sin autenticación JWT |

---

## Changelog (documentación)


| Fecha        | Cambios                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Marzo 2026   | **Bug corregido - Proyecciones de MongoDB:** Los complementos de los platos (`complementosSeleccionados`, `notaEspecial`) no se enviaban al frontend en el endpoint `GET /api/comanda/fecha/:fecha`. Causa: la proyección `PROYECCION_RESUMEN_MESA` no incluía estos campos. Solución: agregados campos faltantes. Ver sección "🐛 Debugging de Datos - Metodología" para aprender a identificar problemas similares. |
| Marzo 2026   | **Funcionalidad Juntar/Separar Mesas v2.8:** Nueva funcionalidad para combinar múltiples mesas en un grupo (usando la mesa de menor número como principal) y separarlas posteriormente. Modelo de datos actualizado con campos `esMesaPrincipal`, `mesaPrincipalId`, `mesasUnidas`, `fechaUnion`, `unidoPor`, `motivoUnion`, `nombreCombinado`. Nuevos endpoints `POST /api/mesas/juntar`, `POST /api/mesas/separar`, `GET /api/mesas/grupos`, `GET /api/mesas/:id/grupo`. Eventos Socket.io `mesas-juntadas` y `mesas-separadas`. Permiso `juntar-separar-mesas` para admin/supervisor. |
| Marzo 2026   | **Sistema de Mozos v2.0 con Metas:** Ampliación completa del sistema de mozos con nueva sección de Metas. Tipos de metas soportadas: ventas, mesas atendidas, tickets generados, ticket promedio, propinas promedio. Estados de cumplimiento semaforizados: sin_iniciar, en_progreso, en_riesgo, encaminado, cumplido, superado. KPIs de gestión: metas activas, mozos cumpliendo, mozos en riesgo, cumplimiento promedio. Proyección inteligente con algoritmo de ritmo y brecha. Ranking de cumplimiento con medallas. Distribución del equipo con gráfico donut. Recomendaciones automáticas contextuales. Plantillas predefinidas para turnos mañana/noche. Modal de nueva meta y drawer de detalle. Documentación actualizada en `docs/Sistemademozos_md.md`. |
| Marzo 2026   | **Sistema de Propinas para Mozos v1.0:** Nueva funcionalidad completa para gestión de propinas del personal de salón. Modelo `Propina` con campos para monto fijo y porcentaje, snapshots de datos históricos, y auditoría completa. Nuevos endpoints `/api/propinas/*` para CRUD y reportes. Página `public/mozos.html` en dashboard administrativo con KPIs de ventas y propinas, tabla de mozos con métricas en tiempo real, y gestión CRUD del personal. Integración con App Mozos para registro de propinas post-pago. |
| Marzo 2026   | **Corrección de Finalización de Comanda v7.4.1:** Bug corregido donde al finalizar comanda completa no se actualizaba en tiempo real en App de Mozos. Ahora se emiten eventos `plato-actualizado` por cada plato (igual que finalizar plato individual), más `comanda-actualizada` y `comanda-finalizada`. Agregado listener `comanda-finalizada` en App de Mozos. |
| Marzo 2026   | **Sistema de Finalización de Platos y Comandas v7.4:** Nueva sección completa documentando el flujo de finalización: diferencias entre finalizar plato individual vs comanda completa; endpoints `PUT /api/comanda/:id/plato/:platoId/finalizar` y `PUT /api/comanda/:id/finalizar`; eventos Socket.io emitidos (`plato-actualizado`, `comanda-finalizada`); impacto en App de Mozos (alertas, cambio de estado de mesa); funciones del repository y controller involucradas; identificación de funciones faltantes (`finalizarPlatosBatch()`, `reabrirPlato()`, `getTiemposPreparacion()`). |
| Marzo 2026   | **Funcionalidad de Cocineros en Comandas v7.2.1:** Ampliación de la documentación del modelo Comanda con campos `procesandoPor` y `procesadoPor` a nivel de plato y comanda; endpoints de procesamiento (`PUT/DELETE /api/comanda/:id/plato/:platoId/procesando`, `PUT /api/comanda/:id/plato/:platoId/finalizar`); eventos Socket.io (`plato-procesando`, `plato-liberado`, `comanda-procesando`, `comanda-liberada`, `conflicto-procesamiento`); métricas de cocineros en cierre de caja; auditoría de platos dejados (`PLATO_DEJADO_COCINA`). |
| Marzo 2026   | **Sistema Multi-Cocinero v7.1:** Implementación completa de identificación de cocinero en procesamiento de platos: modelo `procesandoPor` y `procesadoPor` en comandas; endpoints PUT/DELETE `/api/comanda/:id/plato/:platoId/procesando` y `/finalizar`; registro de tiempos de preparación; auditoría de platos dejados (`PLATO_DEJADO_COCINA`); middleware de autenticación JWT para Socket.io (`socketAuth.js`); rooms por zona (`join-zona`, `join-mis-zonas`); eventos de conflicto y liberación automática. |
| Marzo 2026   | **Cosmos Search:** Nuevo sistema de búsqueda unificada estilo Command Palette (⌘K/Ctrl+K): archivo `public/assets/js/cosmos-search.js` con glassmorphism UI; búsqueda en platos, mesas, clientes, comandas y bouchers; navegación por teclado; integración en todas las páginas del dashboard; componente `cosmos-searchbar.html` y estilos en `cosmos-search.css`.                                                                                                                                                |
| Marzo 2026   | **Autenticación JWT en Socket.io:** Nuevo middleware `src/middleware/socketAuth.js` con validación JWT en conexión de sockets; roles permitidos por namespace (`/cocina`: cocinero/admin/supervisor, `/mozos`: mozos/admin/supervisor, `/admin`: admin/supervisor); advertencia de token próximo a expirar; rate limiting configurable; helpers `emitToUser` y `emitToZona`.                                                                                                                                       |
| Marzo 2026   | **Página cocineros.html y Zonas KDS:** Nueva sección documentando la página `public/cocineros.html`: interfaz completa para gestión de cocineros y zonas KDS con dos tabs; tabla de cocineros con paginación; ranking de métricas; modal de configuración KDS; gestión de zonas con filtros de platos/comandas; integración en tiempo real con Socket.io; modelo `Zona` para organizar estaciones de cocina.                                                                                                       |
| Marzo 2026   | **Integración App Cocina - Cocineros:** Documentación completa de la relación entre la página de cocineros y la App de Cocina: flujo de datos, endpoints consumidos, eventos Socket.io (`config-cocinero-actualizada`), filtros KDS (`kdsFilters.js`), autenticación JWT específica para cocineros, sincronización de configuración en tiempo real. Pendientes identificados y sugerencias de mejora.                                                                                                              |
| Marzo 2026   | **Sección Cocineros:** Nueva sección documentando el módulo de gestión de cocineros: modelo ConfigCocinero para configuración personalizada del tablero KDS; filtros de platos y comandas; métricas de rendimiento (tiempos de preparación, platos top, SLA); endpoints `/api/cocineros/`* con autenticación JWT y permisos; asignación y remoción de rol de cocinero.                                                                                                                                             |
| Marzo 2026   | **Comandas y grupos de comandas:** Nueva sección detallando la implementación deseada: tabla unificada que ordene comandas y grupos de comandas según tipo de pedido (multi-comanda vs una sola comanda); modelo Pedido como grupo de comandas; relación con la App de Mozos; endpoints y flujo de datos.                                                                                                                                                                                                          |
| Marzo 2026   | Actualización exhaustiva del Dashboard Administrativo: auditoría de `public/dashboard/` y `public/`; nueva sección "Dashboard Administrativo" con tecnologías, arquitectura de archivos, autenticación JWT, módulos, endpoints consumidos y eventos Socket.io; corrección de rutas (GET `/`, GET `/dashboard`, GET `/dashboard/login.html`); diferenciación entre Panel Admin (admin.html) y Dashboard con JWT; expansión del namespace `/admin` con eventos documentados.                                         |
| Febrero 2026 | admin.html: complementos, cierre de caja, reportes, auditoría.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |


---

## 📋 Tabla de Contenidos

1. [Visión General](#visión-general)
2. [Arquitectura y Tecnologías](#arquitectura-y-tecnologías)
3. [Estructura del Proyecto](#estructura-del-proyecto)
4. [Flujo de Datos y Carga de Datos](#flujo-de-datos-y-carga-de-datos)
5. [Punto de Entrada (index.js)](#punto-de-entrada-indexjs)
6. [Base de Datos y Carga Inicial](#base-de-datos-y-carga-inicial)
7. [Modelos MongoDB](#modelos-mongodb)
8. [Patrón Controller → Repository](#patrón-controller--repository)
9. [Endpoints por Módulo](#endpoints-por-módulo)
10. [WebSockets (Socket.io)](#websockets-socketio)
11. [Redis Cache (FASE 5)](#redis-cache-fase-5)
12. [Logging y Manejo de Errores](#logging-y-manejo-de-errores)
13. [Middleware](#middleware)
14. [Health Check y Métricas](#health-check-y-métricas)
15. [Dashboard Administrativo](#dashboard-administrativo)
16. [Panel Admin (admin.html)](#panel-admin-adminhtml)
17. [Página de Cocineros (cocineros.html)](#página-de-cocineros-cocineroshtml)
18. [Cocineros y Configuración KDS](#cocineros-y-configuración-kds)
19. [Zonas KDS](#zonas-kds)
20. [Sistema Multi-Cocinero v7.1](#sistema-multi-cocinero-v71)
21. [Autenticación JWT en Socket.io](#autenticación-jwt-en-socketio)
22. [Endpoints de Procesamiento](#endpoints-de-procesamiento)
23. [Cosmos Search - Búsqueda Unificada](#cosmos-search---búsqueda-unificada)
24. [Comandas y Grupos de Comandas (Pedidos)](#comandas-y-grupos-de-comandas-pedidos)
25. [Integración con App de Cocina](#integración-con-app-de-cocina)
26. [Integración con Otras Aplicaciones](#integración-con-otras-aplicaciones)
27. [Variables de Entorno y Despliegue](#variables-de-entorno-y-despliegue)
28. [Testing y Scripts](#testing-y-scripts)
29. [Problemas Resueltos y Pendientes](#problemas-resueltos-y-pendientes)
30. [Sugerencias y Mejoras Futuras](#sugerencias-y-mejoras-futuras)
31. [Sistema de Propinas para Mozos](#sistema-de-propinas-para-mozos)

---

## 🎯 Visión General

### ¿Qué es el Backend Las Gambusinas?

El **Backend** es el núcleo del sistema POS (Point of Sale) de Las Gambusinas. Expone:

- **API REST** bajo el prefijo `/api` para todas las operaciones CRUD (mesas, mozos, platos, comandas, bouchers, clientes, áreas, auditoría, cierre de caja restaurante, reportes, admin, notificaciones, mensajes).
- **WebSockets (Socket.io)** en tres namespaces: `/cocina`, `/mozos`, `/admin`, para actualizaciones en tiempo real.
- **Servidor de archivos estáticos** para el panel administrativo (`/admin` → admin.html), login (`/login`, `/dashboard/login.html`), dashboard con JWT (`/dashboard` → lasgambusinas-dashboard.html) y dashboard multi-página en raíz (`/` → index.html).

### Características Principales


| Característica                                                               | Estado                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------ |
| API REST Express                                                             | ✅                                          |
| MongoDB + Mongoose                                                           | ✅                                          |
| Socket.io (cocina, mozos, admin)                                             | ✅                                          |
| Redis Cache comandas activas (FASE 5)                                        | ✅                                          |
| Redis Adapter Socket.io (dependencia presente)                               | ⚠️ Opcional / no activo en index.js actual |
| WebSocket Batching (websocketBatch.js, 300 ms)                               | ✅                                          |
| Auto-incremento (comandaNumber, boucherNumber, plato.id, mesasId)            | ✅                                          |
| Soft delete (IsActive, eliminada)                                            | ✅                                          |
| Auditoría (historialComandas, auditoriaAcciones, historialPlatos)            | ✅                                          |
| Timezone America/Lima (moment-timezone)                                      | ✅                                          |
| Logging estructurado Winston (FASE 7)                                        | ✅                                          |
| Health Check enterprise                                                      | ✅                                          |
| Metrics Prometheus                                                           | ✅                                          |
| Helmet.js (security headers)                                                 | ✅                                          |
| JWT Dashboard (FASE 6)                                                       | ✅                                          |
| CORS configurable (ALLOWED_ORIGINS)                                          | ✅                                          |
| Correlation ID (request tracing)                                             | ✅                                          |
| Sincronización JSON legacy (data/*.json)                                     | ⚠️ Opcional                                |
| Sentry (opcional en logger)                                                  | ✅                                          |
| Jest + Supertest (testing)                                                   | ✅                                          |
| Scripts migración (migrateEstados, migratePlatosTipos, cleanDuplicatePlatos) | ✅                                          |
| Gestión de Cocineros y configuración KDS                                     | ✅                                          |
| **Sistema Multi-Cocinero v7.1**                                              | ✅                                          |
| **Autenticación JWT en Socket.io**                                           | ✅                                          |
| **Rooms por zona en Socket.io**                                              | ✅                                          |
| **Cosmos Search (⌘K)**                                                       | ✅                                          |
| **Auditoría de platos dejados**                                              | ✅                                          |


---

## 🏗️ Arquitectura y Tecnologías

### Stack Tecnológico


| Tecnología                    | Versión (package.json) | Propósito                          |
| ----------------------------- | ---------------------- | ---------------------------------- |
| **Node.js**                   | LTS                    | Runtime                            |
| **Express**                   | 4.18.2                 | API REST                           |
| **MongoDB**                   | 6.4.0 (driver)         | Base de datos                      |
| **Mongoose**                  | 8.1.3                  | ODM, modelos, validación           |
| **Socket.io**                 | 4.8.3                  | WebSockets                         |
| **ioredis**                   | 5.3.2                  | Cliente Redis (cache + adapter)    |
| **@socket.io/redis-adapter**  | 8.2.1                  | Adapter multi-instancia (opcional) |
| **moment-timezone**           | 0.5.45                 | Fechas/horas America/Lima          |
| **mongoose-sequence**         | 6.0.1                  | Auto-incremento                    |
| **Winston**                   | 3.19.0                 | Logging estructurado               |
| **winston-daily-rotate-file** | 5.0.0                  | Rotación de logs                   |
| **Helmet**                    | 8.1.0                  | Security headers                   |
| **jsonwebtoken**              | 9.0.3                  | JWT dashboard                      |
| **dotenv**                    | 16.4.5                 | Variables de entorno               |
| **express-rate-limit**        | 7.1.5                  | Rate limiting                      |
| **pdfkit**                    | 0.14.0                 | PDF cierre de caja                 |
| **exceljs**                   | 4.4.0                  | Export Excel cierre                |
| **xlsx**                      | 0.18.5                 | Soporte Excel                      |
| **@sentry/node**              | 7.91.0                 | Monitoreo errores (opcional)       |
| **Jest**                      | 30.2.0                 | Testing                            |
| **supertest**                 | 7.2.2                  | Testing HTTP                       |


### Patrones Utilizados

- **Repository Pattern:** La lógica de negocio y acceso a datos está en `src/repository/`. Los controladores solo validan entrada, llaman al repository y devuelven HTTP.
- **Singleton:** `redisCache.js`, `logger.js` — una sola instancia por proceso.
- **Observer (Socket.io):** El backend emite eventos cuando cambian comandas, platos, mesas; las apps suscritas reciben actualizaciones.
- **Cache-Aside (Redis):** Consulta cache antes de MongoDB; invalidación al actualizar.
- **Adapter (Redis):** Dependencia `@socket.io/redis-adapter` disponible para escalar Socket.io en múltiples instancias (configuración opcional).

---

## 📁 Estructura del Proyecto

```
Backend-LasGambusinas/
├── index.js                          # Punto de entrada: Express, Socket.io, CORS, rutas, /health, /metrics
├── package.json
├── .env                              # DBLOCAL, PORT, JWT_SECRET, REDIS_*, ALLOWED_ORIGINS, IP, NODE_ENV
├── src/
│   ├── database/
│   │   ├── database.js                # Conexión MongoDB + importación inicial desde data/*.json
│   │   └── models/
│   │       ├── comanda.model.js
│   │       ├── mesas.model.js
│   │       ├── plato.model.js
│   │       ├── mozos.model.js
│   │       ├── cliente.model.js
│   │       ├── boucher.model.js
│   │       ├── area.model.js
│   │       ├── cierreCaja.model.js
│   │       ├── cierreCajaRestaurante.model.js
│   │       ├── auditoriaAcciones.model.js
│   │       ├── historialComandas.model.js
│   │       ├── sesionesUsuarios.model.js
│   │       ├── configCocinero.model.js
│   │       ├── pedido.model.js
│   │       └── propina.model.js          # Modelo para propinas de mozos
│   ├── controllers/                   # Rutas Express (validación + llamada a repository + res.json)
│   │   ├── comandaController.js
│   │   ├── mesasController.js
│   │   ├── platoController.js
│   │   ├── mozosController.js
│   │   ├── clientesController.js
│   │   ├── boucherController.js
│   │   ├── areaController.js
│   │   ├── auditoriaController.js
│   │   ├── cierreCajaController.js
│   │   ├── cierreCajaRestauranteController.js
│   │   ├── adminController.js
│   │   ├── reportesController.js
│   │   ├── notificacionesController.js
│   │   ├── mensajesController.js
│   │   ├── cocinerosController.js
│   │   ├── pedidoController.js
│   │   ├── procesamientoController.js   # v7.1: Endpoints multi-cocinero
│   │   └── propinaController.js          # Endpoints para gestión de propinas
│   ├── repository/
│   │   ├── comanda.repository.js
│   │   ├── mesas.repository.js
│   │   ├── plato.repository.js
│   │   ├── mozos.repository.js
│   │   ├── clientes.repository.js
│   │   ├── boucher.repository.js
│   │   ├── area.repository.js
│   │   ├── auditoria.repository.js
│   │   ├── cierreCaja.repository.js
│   │   ├── cocineros.repository.js
│   │   ├── pedido.repository.js
│   │   └── propina.repository.js         # Repository para propinas de mozos
│   ├── socket/
│   │   └── events.js                  # Namespaces /cocina, /mozos, /admin + funciones globales emit* + rooms por zona
│   ├── middleware/
│   │   ├── adminAuth.js               # JWT para dashboard
│   │   ├── socketAuth.js              # v7.1: JWT para Socket.io + rooms por zona
│   │   ├── auditoria.js
│   │   └── cierreCaja.middleware.js
│   └── utils/
│       ├── logger.js                  # Winston: niveles, rotación, correlation ID, masking, Sentry
│       ├── redisCache.js              # Cache comandas activas, fallback memoria
│       ├── websocketBatch.js          # Cola y batch plato-actualizado (300 ms)
│       ├── errorHandler.js            # AppError, handleError, createErrorResponse
│       ├── jsonSync.js                # Sincronización legacy con data/*.json
│       ├── migrateEstados.js
│       ├── migratePlatosTipos.js
│       ├── migratePlatoIds.js
│       ├── cleanDuplicatePlatos.js
│       ├── pdfCierreCaja.js
│       └── socketReconnect.js
├── public/
│   ├── index.html                     # Dashboard multi-página (GET /): Tailwind, Alpine.js, Chart.js, Socket.io; carga datos vía API
│   ├── login.html                     # Login JWT (GET /login, GET /dashboard/login.html); usa /dashboard/assets/js/login.js
│   ├── admin.html                     # Panel admin (GET /admin, sin JWT): Mesas, Áreas, Mozos, Platos, Comandas, Bouchers, Clientes, Reportes, Auditoría, Cierre de Caja
│   ├── mesas.html, platos.html, comandas.html, bouchers.html, clientes.html, auditoria.html, cierre-caja.html, reportes.html, configuracion.html, areas.html, usuarios.html, roles.html, cocineros.html, mozos.html  # Páginas del dashboard multi-página
│   ├── assets/
│   │   ├── components/
│   │   │   ├── cosmos-searchbar.html  # Componente de búsqueda Command Palette
│   │   │   └── topbar.html            # Topbar con Cosmos Search integrado
│   │   ├── js/
│   │   │   ├── cosmos-search.js       # v7.1: Búsqueda unificada (⌘K)
│   │   │   └── page-transitions.js    # Transiciones entre páginas
│   │   └── css/
│   │       ├── cosmos-search.css      # Estilos glassmorphism para búsqueda
│   │       └── page-transitions.css
│   └── dashboard/
│       ├── login.html                 # Alternativa de login (estilo premium); lógica en /dashboard/assets/js/login.js
│       ├── lasgambusinas-dashboard.html  # SPA Dashboard (GET /dashboard con JWT): Tailwind, Alpine.js, Chart.js; datos mock (v2.0)
│       ├── wireframe-model.html
│       └── assets/
│           ├── js/                    # login.js, dashboard.js, admin-functions.js, header.js, sidebar.js, animations.js
│           └── css/                   # dashboard-premium.css, header-premium.css
├── docs/
│   ├── automated/                     # Documentación generada automáticamente
│   └── BACKEND_V7.1_IMPLEMENTACION.md # Documentación específica v7.1 multi-cocinero
├── data/                              # JSON legacy (importación inicial)
└── scripts/                           # Backup, restore, producción (opcionales)
```

---

## 🔄 Flujo de Datos y Carga de Datos

### Flujo General (Request HTTP)

```
Cliente (App Mozos / App Cocina / Dashboard / admin.html / Postman)
    ↓
HTTP Request → Express
    ↓
CORS → Helmet → correlationMiddleware → express.json()
    ↓
Router (controllers): validación de params/body
    ↓
Repository: lógica de negocio, MongoDB, Redis (si aplica), emisión Socket.io
    ↓
Response JSON (res.json) o handleError en catch
```

### Carga de Datos: Inicio del Servidor

1. `**require('dotenv').config()**` — Carga variables de entorno desde `.env`.
2. `**require('./src/database/database')**` — Ejecuta `database.js`:
  - `mongoose.connect(process.env.DBLOCAL)`.
  - En `db.once('open')`: `importarPlatosDesdeJSON()` → `importarAreasDesdeJSON()` → `importarMesasDesdeJSON()` → `importarMozosDesdeJSON()` → `inicializarUsuarioAdmin()` → `importarClientesDesdeJSON()` → `importarComandasDesdeJSON()` → `importarBoucherDesdeJSON()` → `importarAuditoriaDesdeJSON()`.
3. **Redis:** `setImmediate(() => redisCache.init().catch(...))` — Inicialización asíncrona sin bloquear el arranque.
4. **Express y Socket.io** se configuran; rutas montadas en `app.use('/api', routes)`.
5. `**server.listen(port, '0.0.0.0')`** — Servidor en todas las interfaces.

### Carga de Comandas por Fecha

- **Endpoint:** `GET /api/comanda/fecha/:fecha`.
- **Repository:** Convierte fecha a rango día America/Lima, query `createdAt` + `IsActive: true`, populate (mozos, mesas.area, cliente, platos.plato), `sort({ comandaNumber: -1 })`, `ensurePlatosPopulated`.

---

## 📍 Punto de Entrada (index.js)

- Carga `dotenv` y `src/database/database`.
- Inicializa Redis en `setImmediate`.
- Crea `express()` y `http.createServer(app)`.
- Crea Socket.io con CORS (`allowedOrigins` desde `ALLOWED_ORIGINS` o fallback desarrollo).
- Exporta `global.io = io`.
- Namespaces: `io.of('/cocina')`, `io.of('/mozos')`, `io.of('/admin')`.
- `require('./src/socket/events')(io, cocinaNamespace, mozosNamespace, adminNamespace)`.
- CORS Express (origen, métodos, headers, credentials).
- Rutas: mesas, mozos, plato, comanda, area, boucher, clientes, auditoria, cierreCaja, cierreCajaRestaurante, admin, notificaciones, mensajes, reportes en `app.use('/api', routes)`.
- Helmet (CSP y seguridad).
- `logger.correlationMiddleware`.
- `express.json()`.
- Estáticos: `express.static('public')`.
- Rutas HTML: `GET /admin` → admin.html; `GET /dashboard/login.html` → login; `GET /dashboard` con token y `adminAuth` → index.html dashboard.
- `GET /health`: health check (MongoDB, Redis, WebSockets, sistema, platos).
- `GET /metrics`: Prometheus.
- `GET /`: página de bienvenida con enlace a /admin.
- `server.listen(port, '0.0.0.0')`.

---

## 🗄️ Base de Datos y Carga Inicial

- **Conexión:** `mongoose.connect(process.env.DBLOCAL)` en `src/database/database.js`.
- **Carga inicial:** Importación desde `data/*.json` en `db.once('open')` (repositorios).
- **Auto-incremento:** `mongoose-sequence` en comanda (comandaNumber), plato (id), mesas (mesasId), boucher (boucherNumber), etc.

---

## 📦 Modelos MongoDB

### Comanda (`comanda.model.js`)

- **mozos**, **mesas**, **cliente**: ObjectId ref. **dividedFrom**: ObjectId ref Comanda (opcional).
- **platos**: array de objetos con la siguiente estructura:
  - `plato`: ObjectId ref `platos`
  - `platoId`: Number (ID numérico del plato)
  - `estado`: enum [`pedido`, `en_espera`, `recoger`, `entregado`, `pagado`]
  - `tiempos`: objeto con timestamps de cada transición de estado:
    - `pedido`: Date (default: fecha de creación)
    - `en_espera`: Date
    - `recoger`: Date
    - `entregado`: Date
    - `pagado`: Date
  - `complementosSeleccionados`: array de `{ grupo, opcion }` — opciones elegidas por el mozo
  - `notaEspecial`: String — nota específica para este plato
  - `eliminado`, `eliminadoPor`, `eliminadoAt`, `eliminadoRazon`: campos de auditoría para eliminación
  - `anulado`, `anuladoPor`, `anuladoAt`, `anuladoRazon`, `anuladoSourceApp`, `tipoAnulacion`: campos para anulación desde cocina
  - **v7.2.1 Procesamiento por cocinero:**
    - `procesandoPor`: objeto que indica qué cocinero está preparando activamente el plato:
      - `cocineroId`: ObjectId ref `mozos`
      - `nombre`: String (nombre completo)
      - `alias`: String (alias del cocinero)
      - `timestamp`: Date (cuándo tomó el plato)
    - `procesadoPor`: objeto que indica qué cocinero terminó de preparar el plato:
      - `cocineroId`: ObjectId ref `mozos`
      - `nombre`: String
      - `alias`: String
      - `timestamp`: Date (cuándo finalizó)
- **cantidades**: array de números (índice paralelo a platos).
- **status**: `en_espera`, `recoger`, `entregado`, `pagado`, `cancelado`.
- **IsActive**, **eliminada** (soft delete); **fechaEliminacion**, **motivoEliminacion**, **eliminadaPor**.
- **comandaNumber**: auto-incremento.
- **createdAt**, **updatedAt**, **tiempoEnEspera**, **tiempoRecoger**, **tiempoEntregado**, **tiempoPagado**.
- **historialEstados**, **historialPlatos** (auditoría); **precioTotalOriginal**, **precioTotal**, **version**.
- **createdBy**, **updatedBy**, **deviceId**, **sourceApp** (enum: mozos, cocina, admin, api).
- **incluidoEnCierre**: ObjectId ref CierreCajaRestaurante (para no duplicar en cierres).
- **FASE A1:** Campos desnormalizados para lectura rápida: `mozoNombre`, `mesaNumero`, `areaNombre`, `clienteNombre`, `totalPlatos`, `platosActivos`.
- **v7.2.1 Multi-Cocinero (nivel comanda):** `procesandoPor` y `procesadoPor` a nivel de comanda (cuando se toma completa por un cocinero).
- **v5.5:** `prioridadOrden` para ordenamiento en cocina.
- **Descuentos:** `descuento`, `motivoDescuento`, `descuentoAplicadoPor`, `descuentoAplicadoAt`, `totalCalculado`, `totalSinDescuento`, `montoDescuento`.

### Mesas (`mesas.model.js`)

- **mesasId** (auto-incremento), **nummesa**, **isActive**, **estado**: `libre`, `esperando`, `pedido`, `preparado`, `pagado`, `reservado`, **area**: ObjectId ref. Índice único `{ nummesa: 1, area: 1 }`.

### Plato (`plato.model.js`)

- **id** (auto-incremento), **nombre**, **nombreLower** (único, pre-save), **precio**, **stock**, **categoria** (requerido, trim), **tipo** (enum: `platos-desayuno`, `plato-carta normal`), **isActive**. **complementos**: array de grupos de opciones que el mozo puede elegir al tomar el pedido; cada grupo tiene: **grupo** (nombre, ej. "Proteína", "Guarnición"), **obligatorio** (boolean), **seleccionMultiple** (boolean), **opciones** (array de strings, ej. ["Pollo", "Carne"]). Índices: `categoria`, `{ tipo: 1, categoria: 1 }`. Validación pre-save: nombre/categoria no vacíos, tipo en enum. Export: `TIPOS_MENU`.

### Pedido (`pedido.model.js`) — Grupo de comandas

- **pedidoId** (auto-incremento), **mesa**, **mozo**, **cliente** (opcional). **comandas**: array de ObjectId ref Comanda. **comandasNumbers**: números de comanda. **estado**: `abierto`, `cerrado`, `pagado`, `cancelado`. **subtotal**, **igv**, **totalSinDescuento**, **totalConDescuento**, **totalFinal**, **descuento**, **motivoDescuento**, **montoDescuento**. **boucher** (ref al generar pago). **cantidadComandas**, **totalPlatos** (desnormalizados). **fechaApertura**, **fechaCierre**, **fechaPago**. Métodos: `calcularTotales`, `aplicarCalculoDescuento`. Estático: `obtenerOcrearPedidoAbierto(mesaId, mozoId)`. Usado para agrupar comandas de una misma mesa/visita; ver [Comandas y Grupos de Comandas (Pedidos)](#comandas-y-grupos-de-comandas-pedidos).

### Otros

- **Boucher**, **Cliente**, **Mozos**, **Area**, **CierreCaja**, **CierreCajaRestaurante**, **AuditoriaAcciones**, **HistorialComandas**, **SesionesUsuarios** — ver esquemas en código y en `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.

### ConfigCocinero (`configCocinero.model.js`)

Modelo para configuración personalizada del tablero KDS de cada cocinero. Ver [Cocineros y Configuración KDS](#cocineros-y-configuración-kds) para documentación completa.


| Campo                | Tipo                 | Descripción                                                                                                  |
| -------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ |
| **usuarioId**        | ObjectId ref `mozos` | Único, índice.                                                                                               |
| **aliasCocinero**    | String               | Nombre a mostrar (opcional).                                                                                 |
| **filtrosPlatos**    | Object               | Configuración de filtros de platos (modoInclusion, platosPermitidos, categoriasPermitidas, tiposPermitidos). |
| **filtrosComandas**  | Object               | Configuración de filtros de comandas (areasPermitidas, mesasEspecificas, rangoHorario, soloPrioritarias).    |
| **configTableroKDS** | Object               | Preferencias visuales (tiempos de alerta, grid, sonido, modo nocturno, etc.).                                |
| **estadisticas**     | Object               | Métricas de sesión (ultimaConexion, totalSesiones, platosPreparados).                                        |
| **activo**           | Boolean              | Estado de la configuración.                                                                                  |


Métodos: `getConfiguracionPorDefecto()`, `debeMostrarPlato(plato)`, `debeMostrarComanda(comanda)`.

---

## 🔀 Patrón Controller → Repository

- Los **controllers** no acceden directamente a modelos; llaman a funciones del **repository** del mismo dominio.
- El **repository** valida reglas de negocio, opera en MongoDB (y Redis si aplica), actualiza estados relacionados, registra auditoría y llama a las funciones globales de Socket.io (`emitNuevaComanda`, `emitComandaActualizada`, `emitPlatoActualizado`, `emitPlatoBatch`, `emitPlatoActualizadoGranular`, etc.).
- El controller: lee params/body/headers, llama al repository, responde con `res.json(...)` o `handleError(error, res, logger)`.

---

## 📡 Endpoints por Módulo

Todas las rutas bajo `/api`. Los controladores exportan routers con rutas relativas; el montaje es `app.use('/api', routes)` (cada router en el array se monta en `/api`). **Nota:** Cierre de caja usado por admin.html es el de **cierreCajaRestauranteController** (`/api/cierre-caja/`*). **cierreCajaController** expone `/api/estado`, `/api/`, `/api/:id`, etc. (rutas propias del router sin prefijo adicional en el array).


| Módulo                  | Prefijo efectivo     | Ejemplos                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mesas                   | `/mesas`             | GET, GET :id, POST, PUT liberar-todas, PUT :id, PUT :id/estado, DELETE :id                                                                                                                                                                                                                                                                                                                                                          |
| Mozos                   | `/mozos`             | GET, GET test/admin, GET :id, POST, PUT :id, DELETE :id, POST auth                                                                                                                                                                                                                                                                                                                                                                  |
| Platos                  | `/platos`            | GET, GET categorias, GET menu/:tipo, GET menu/:tipo/categoria/:categoria, GET categoria/:categoria, GET :id, POST, PUT :id, PATCH :id/tipo, DELETE :id, POST importar                                                                                                                                                                                                                                                               |
| Comanda                 | `/comanda`           | GET, GET fecha/:fecha, GET fechastatus/:fecha, GET :id, POST, DELETE :id, PUT :id/eliminar, PUT :id, PUT :id/status, PUT :id/estado, PUT :id/plato/:platoId/estado, PUT :comandaId/plato/:platoId/entregar, PUT :id/revertir/:nuevoStatus, GET comandas-para-pagar/:mesaId, PUT :id/eliminar-plato/:platoIndex, PUT :id/editar-platos, PUT :id/eliminar-platos, DELETE :id/ultima, DELETE :id/individual, DELETE mesa/:mesaId/todas |
| Boucher                 | `/boucher`           | GET, GET fecha/:fecha, GET :id, POST, DELETE :id, GET by-mesa/:mesaId, GET boucher-ultimo/:mesaId                                                                                                                                                                                                                                                                                                                                   |
| Clientes                | `/clientes`          | POST, GET, GET :id, GET dni/:dni, GET tipo/invitado, PUT :id, POST comandas/:id/cliente                                                                                                                                                                                                                                                                                                                                             |
| Áreas                   | `/areas`             | GET, GET :id, POST, PUT :id, DELETE :id                                                                                                                                                                                                                                                                                                                                                                                             |
| Admin (Dashboard JWT)   | `/admin`             | POST auth (login; body: username, password=DNI), GET verify (token en Authorization), GET perfil                                                                                                                                                                                                                                                                                                                                    |
| Auditoría               | `/auditoria`         | GET comandas, GET comanda/:id/historial, GET platos-eliminados, GET reporte-completo, GET sesiones                                                                                                                                                                                                                                                                                                                                  |
| Cierre Caja (legacy)    | (router sin prefijo) | GET estado, GET /, GET :id, POST generar, POST :id/validar, GET :id/reporte-pdf                                                                                                                                                                                                                                                                                                                                                     |
| Cierre Caja Restaurante | `/cierre-caja`       | POST, GET historial, GET :id, GET estado/actual, GET :id/exportar-pdf, GET :id/exportar-excel                                                                                                                                                                                                                                                                                                                                       |
| Reportes                | (sin prefijo)        | GET ventas, GET platos-top, GET mozos-performance, GET mesas-ocupacion, GET kpis                                                                                                                                                                                                                                                                                                                                                    |
| Notificaciones          | `/notificaciones`    | GET, PATCH :id/leida, PATCH leidas                                                                                                                                                                                                                                                                                                                                                                                                  |
| Mensajes                | `/mensajes`          | GET mensajes-no-leidos                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cocineros               | `/cocineros`         | GET, GET :id, GET :id/config, PUT :id/config, POST :id/asignar-rol, POST :id/quitar-rol, GET :id/metricas, GET metricas/todos, POST :id/conexion                                                                                                                                                                                                                                                                                    |
| Propinas                | `/propinas`          | POST, GET, GET :id, GET mesa/:mesaId, GET mozo/:mozoId, GET resumen/dia, GET mozos-dashboard, PUT :id, DELETE :id                                                                                                                                                                                                                                                                                                                   |
| Procesamiento (v7.2.1)  | `/comanda`           | PUT :id/plato/:platoId/procesando, DELETE :id/plato/:platoId/procesando, PUT :id/plato/:platoId/finalizar, PUT :id/procesando, DELETE :id/procesando                                                                                                                                                                                                                                                                                |


**Platos:** GET /api/platos/categorias, GET /api/platos/menu/:tipo, GET /api/platos/menu/:tipo/categoria/:categoria, PATCH /api/platos/:id/tipo (body: { tipo }). Cache Redis 5 min en menu/:tipo; emisión `plato-menu-actualizado` en crear/actualizar/cambiar tipo.

---

## 🔌 WebSockets (Socket.io)

### Namespaces

- `**/cocina`:** App Cocina. Rooms por fecha: `fecha-YYYY-MM-DD`. Rooms por cocinero: `cocinero-{id}`. Rooms por zona: `zona-{id}`. Eventos recibidos: `join-fecha`, `join-cocinero`, `leave-cocinero`, `join-zona`, `leave-zona`, `join-mis-zonas`, `heartbeat`, `error`, `disconnect`. Emitidos por servidor: `joined-fecha`, `joined-cocinero`, `joined-zona`, `joined-mis-zonas`, `heartbeat-ack`, `nueva-comanda`, `comanda-actualizada`, `plato-actualizado`, `plato-actualizado-batch`, `comanda-eliminada`, `comanda-revertida`, `mesa-actualizada`, `plato-entregado`, `plato-menu-actualizado`, `socket-status`, `plato-procesando`, `plato-liberado`, `comanda-procesando`, `comanda-liberada`, `conflicto-procesamiento`, `liberacion-automatica`, `token-expiring-soon`. **Autenticación JWT obligatoria** (roles: cocinero, admin, supervisor).
- `**/mozos`:** App Mozos. Rooms por mesa: `mesa-{mesaId}`. Eventos recibidos: `join-mesa`, `leave-mesa`, `heartbeat`, `error`, `disconnect`. Emitidos: `joined-mesa`, `heartbeat-ack`, mismos eventos de comanda/plato/mesa que cocina (con envío a room mesa o broadcast). **Autenticación JWT obligatoria** (roles: mozos, admin, supervisor).
- `**/admin`:** Dashboard y admin.html. Eventos recibidos: `heartbeat`, `error`, `disconnect`. Emitidos por servidor: `plato-menu-actualizado`, `reportes:boucher-nuevo`, `reportes:comanda-nueva`, `reportes:plato-listo`, `socket-status`, `roles-actualizados`. **Autenticación JWT obligatoria** (roles: admin, supervisor). Ver [Dashboard Administrativo](#dashboard-administrativo) para detalle.

### Funciones globales (`src/socket/events.js`)

- **emitNuevaComanda(comanda)** — Populate completo, emite `nueva-comanda` a cocina (room fecha) y broadcast a mozos.
- **emitComandaActualizada(comandaId, estadoAnterior, estadoNuevo, cuentasPlatos)** — Incluye platosEliminados; cocina room fecha; mozos room mesa o broadcast.
- **emitPlatoActualizado(comandaId, platoId, nuevoEstado)** — Comanda populada; cocina room fecha; mozos broadcast.
- **emitPlatoActualizadoGranular(datos)** — Encola en `websocketBatch`; el batch se emite cada 300 ms como `plato-actualizado-batch`.
- **emitPlatoBatch(batch)** — Emite `plato-actualizado-batch` a cocina y mozos (room mesa o todos).
- **emitComandaEliminada(comandaId)** — Cocina room fecha; mozos room mesa.
- **emitMesaActualizada(mesaId)** — Broadcast mozos y cocina.
- **emitComandaRevertida(comanda, mesa)** — Cocina room fecha; mozos room mesa.
- **emitPlatoEntregado(comandaId, platoId, platoNombre, estadoAnterior)** — Room mesa mozos y room fecha cocina.
- **emitReporteBoucherNuevo(boucher)**, **emitReporteComandaNueva(comanda)**, **emitReportePlatoListo(...)** — Namespace `/admin`.
- **emitPlatoMenuActualizado(plato)** — Emite `plato-menu-actualizado` a `/cocina`, `/mozos` y `/admin`.

**Funciones de procesamiento de cocineros (v7.2.1):**

- **emitPlatoProcesando(comandaId, platoId, cocinero)** — Emite `plato-procesando` cuando un cocinero toma un plato para prepararlo. Datos: `{ comandaId, platoId, cocinero: { cocineroId, nombre, alias }, timestamp }`.
- **emitPlatoLiberado(comandaId, platoId, cocineroId)** — Emite `plato-liberado` cuando un cocinero libera un plato antes de terminarlo. Datos: `{ comandaId, platoId, cocineroId, timestamp }`.
- **emitComandaProcesando(comandaId, cocinero)** — Emite `comanda-procesando` cuando un cocinero toma una comanda completa. Datos: `{ comandaId, comandaNumber, cocinero, timestamp }`.
- **emitComandaLiberada(comandaId, cocineroId)** — Emite `comanda-liberada` cuando un cocinero libera una comanda. Datos: `{ comandaId, comandaNumber, cocineroId, timestamp }`.
- **emitConflictoProcesamiento(comandaId, platoId, cocineroActual, cocineroIntentando)** — Emite `conflicto-procesamiento` al room del cocinero que intentó tomar un plato ya tomado. Datos: `{ comandaId, platoId, procesadoPor, mensaje }`.
- **emitLiberacionAutomatica(cocineroId, platosLiberados)** — Emite `liberacion-automatica` cuando se liberan platos automáticamente por desconexión del cocinero. Datos: `{ cocineroId, platosLiberados, timestamp }`.
- **emitNuevaComandaToZona(zonaId, comanda)** — Emite `nueva-comanda-zona` a un room de zona específica para cocineros asignados a esa área.

Cada 30 s se emite `socket-status` (connected, socketId, timestamp) a los tres namespaces.

---

## 📦 Redis Cache (FASE 5)

- **Archivo:** `src/utils/redisCache.js`.
- **Objetivo:** Cachear comandas activas con TTL 60 s.
- **Estrategia:** Cache-aside; fallback a `Map()` en memoria con limpieza de expirados.
- **Configuración:** `REDIS_ENABLED`, `REDIS_URL` (o `REDIS_HOST`, `REDIS_PORT`), `REDIS_PASSWORD`, `REDIS_PREFIX`.
- **Estadísticas:** En `/health` (redis status, hitRate, hits, misses) y en `/metrics` (redis_cache_hits_total, redis_cache_misses_total).

---

## 📝 Logging y Manejo de Errores

- **Logger (`src/utils/logger.js`):** Winston, niveles (error, warn, info, debug), formato JSON para archivo, rotación diaria, correlation ID, enmascaramiento de datos sensibles. Opcional integración Sentry. Middleware `logger.correlationMiddleware`.
- **Manejo de errores (`src/utils/errorHandler.js`):** `AppError`, `createErrorResponse`, `handleError`. Los controllers usan `handleError(error, res, logger)` en catch.

---

## 🛡️ Middleware

- **adminAuth:** Lee `Authorization: Bearer <token>`, verifica JWT con `JWT_SECRET`. Redirige a `/dashboard/login.html` si falla y `req.accepts('html')`; si es API devuelve 401.
- **auditoria:** Registro de acciones (eliminación comanda, platos, etc.).
- **cierreCaja.middleware:** Lógica asociada al cierre de caja.

---

## ❤️ Health Check y Métricas

- **GET /health:** JSON con status (ok/degraded/error), timestamp, version, uptime, serverIP, serverUrl, `services`: mongodb (status, latency, connections, replicaSet), redis (status, latency, type, hitRate, hits, misses), websockets (cocina, mozos, admin, total), system (cpu, memory, disk), platos (porTipo, porCategoria, topCategorias, platos_unicos, platos_total). Response time. Código 503 si status error.
- **GET /metrics:** Texto Prometheus: nodejs_uptime_seconds, nodejs_memory_*, mongodb_connections_active, redis_cache_hits_total, redis_cache_misses_total, websocket_connections_total.

---

## 📊 Dashboard Administrativo

El backend expone **varias interfaces web** para administración. Se distinguen dos tipos principales: el **Dashboard con autenticación JWT** (FASE 6) y el **Panel Admin público** (admin.html). Esta sección describe el Dashboard Administrativo (login JWT, rutas protegidas y archivos en `public/` y `public/dashboard/`).

### Tecnologías utilizadas


| Recurso              | Uso                                                                           |
| -------------------- | ----------------------------------------------------------------------------- |
| **HTML5**            | Páginas estáticas servidas por Express                                        |
| **Bootstrap 4**      | login.html (dashboard): formulario, grid, utilidades                          |
| **Tailwind CSS**     | index.html (/) y lasgambusinas-dashboard.html (/dashboard): diseño responsive |
| **Alpine.js**        | index.html y lasgambusinas-dashboard.html: estado reactivo, modales, tabs     |
| **Chart.js**         | Gráficos en dashboard principal y reportes                                    |
| **jQuery**           | login.html (opcional según versión)                                           |
| **Socket.io client** | index.html: namespace `/admin` para actualizaciones en tiempo real            |
| **Fetch API**        | login.js, dashboard.js y lógica inline: llamadas a `/api/`*                   |


### Arquitectura de archivos del Dashboard

```
public/
├── index.html              # GET / — Dashboard multi-página (Tailwind, Alpine.js); loadDashboard() vía API
├── login.html              # GET /login, GET /dashboard/login.html — Formulario JWT; script: /dashboard/assets/js/login.js
├── mesas.html, platos.html, comandas.html, bouchers.html, clientes.html, auditoria.html,
├── cierre-caja.html, reportes.html, configuracion.html, areas.html, usuarios.html, roles.html
│                           # GET /mesas, /platos, etc. (sin extensión o .html)
└── dashboard/
    ├── login.html          # Versión premium del login (mismo login.js)
    ├── lasgambusinas-dashboard.html   # GET /dashboard (protegido JWT) — SPA con datos mock (v2.0)
    ├── wireframe-model.html
    └── assets/
        ├── js/
        │   ├── login.js        # Autenticación: POST /api/admin/auth, GET /api/admin/verify; redirección a /
        │   ├── dashboard.js    # Carga API: mesas, boucher/fecha, comanda, mozos; actualiza KPIs y grid mesas
        │   ├── admin-functions.js  # Clon de lógica CRUD para mesas, áreas, mozos, platos, comandas, bouchers, clientes, auditoría, cierre de caja (usado por admin.html si se refactoriza)
        │   ├── header.js, sidebar.js, animations.js
        └── css/
            ├── dashboard-premium.css
            └── header-premium.css
```

### Rutas y acceso


| Ruta                          | Archivo servido                                 | Protección          | Descripción                                                         |
| ----------------------------- | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------- |
| `GET /`                       | `public/index.html`                             | No                  | Dashboard multi-página; tras login JWT el usuario suele llegar aquí |
| `GET /login`                  | `public/login.html`                             | No                  | Página de login                                                     |
| `GET /dashboard/login.html`   | `public/login.html`                             | No                  | Misma página de login (ruta alternativa)                            |
| `GET /dashboard`              | `public/dashboard/lasgambusinas-dashboard.html` | **JWT** (adminAuth) | SPA dashboard v2; token por query, cookie o header Authorization    |
| `GET /dashboard/assets/*`     | `public/dashboard/assets/*`                     | No                  | JS/CSS públicos                                                     |
| `GET /mesas`, `/platos`, etc. | `public/mesas.html`, `public/platos.html`, …    | No                  | Páginas del dashboard multi-página                                  |


Si no hay token, `GET /dashboard` redirige a `/login`.

### Sistema de autenticación JWT (Dashboard)

1. **Login:** El usuario envía credenciales en `login.html` (o `dashboard/login.html`).
2. **Request:** `POST /api/admin/auth` con body `{ "username": string, "password": string }`. En el backend, `password` se interpreta como **DNI** (número).
3. **Validación:** Se autentica como mozo (`autenticarMozo`) y se verifica rol admin o supervisor (`rolesRepository.obtenerMozoConRol`). Solo esos roles reciben token.
4. **Respuesta:** `{ "token": string, "usuario": { id, name, DNI, rol, permisos } }`. El cliente guarda el token en `localStorage` como `adminToken` (y opcionalmente `gambusinas_auth`).
5. **Redirección:** Tras login exitoso, el cliente redirige a `/` (index.html).
6. **Verificación:** Para acceder a recursos protegidos o a `GET /dashboard`, el cliente envía `Authorization: Bearer <token>`. El backend puede comprobar el token con `GET /api/admin/verify` (headers: `Authorization: Bearer <token>`). Respuesta: `{ "valid": true, "usuario": { id, name, rol, permisos, activo } }`.
7. **Protección en servidor:** La ruta `GET /dashboard` usa el middleware `adminAuth`: lee token de query, cookie (`adminToken`) o header; si no hay token redirige a `/login`; si el token es inválido responde 401 o redirección según `Accept`.

**Endpoints de autenticación consumidos por el Dashboard:**

- `POST /api/admin/auth` — Login. **Request:** `{ "username", "password" }` (password = DNI). **Response:** `{ "token", "usuario" }`.
- `GET /api/admin/verify` — Verificar token. **Headers:** `Authorization: Bearer <token>`. **Response:** `{ "valid", "usuario" }`.
- `GET /api/admin/perfil` — Perfil del usuario autenticado (opcional). **Headers:** `Authorization: Bearer <token>`.

### Endpoints consumidos por el Dashboard (API REST)

El archivo `dashboard.js` (y la lógica equivalente en index.html) utiliza, entre otros, los siguientes endpoints (todos bajo prefijo `/api`, con header `Authorization: Bearer <token>` cuando la ruta está protegida):


| Método | Ruta                        | Uso                                   |
| ------ | --------------------------- | ------------------------------------- |
| GET    | `/api/admin/verify`         | Comprobar sesión al cargar            |
| GET    | `/api/mesas`                | Listar mesas; KPIs y grid de mesas    |
| GET    | `/api/boucher/fecha/:fecha` | Ventas del día (fecha ISO YYYY-MM-DD) |
| GET    | `/api/comanda`              | Comandas; derivar top platos          |
| GET    | `/api/mozos`                | Lista de mozos; top mozos por ventas  |


El **Panel Admin** (admin.html) consume además todos los endpoints CRUD y de reportes documentados en [Endpoints por Módulo](#endpoints-por-módulo) y [Panel Admin (admin.html)](#panel-admin-adminhtml) (mesas, áreas, mozos, platos, comandas, bouchers, clientes, auditoría, cierre de caja, reportes).

### Integración WebSockets (namespace /admin)

El namespace Socket.io `**/admin`** está pensado para el Dashboard y admin.html.

**Conexión:** El cliente se conecta a `io('/admin')`.

**Eventos que el servidor emite al namespace `/admin`:**


| Evento                   | Descripción                                                     | Origen                                       |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------------- |
| `plato-menu-actualizado` | Menú de platos actualizado (crear/editar/cambiar tipo)          | events.js (emitPlatoMenuActualizado)         |
| `reportes:boucher-nuevo` | Nuevo boucher generado; actualizar reportes/ventas              | boucher.repository → emitReporteBoucherNuevo |
| `reportes:comanda-nueva` | Nueva comanda creada                                            | comanda.repository → emitReporteComandaNueva |
| `reportes:plato-listo`   | Plato marcado como listo en comanda                             | comanda.repository → emitReportePlatoListo   |
| `socket-status`          | Estado de conexión (cada ~30 s): connected, socketId, timestamp | events.js (interval)                         |
| `roles-actualizados`     | Cambios en roles/permisos                                       | events.js                                    |


**Eventos que el servidor escucha del cliente en `/admin`:** `heartbeat` (responde `heartbeat-ack`), `error`, `disconnect`.

La UI puede actualizar listas (platos, reportes, notificaciones) sin recargar la página al escuchar estos eventos.

### Experiencia de usuario (resumen)

- **Login:** Formulario con usuario y contraseña (DNI), toggle de visibilidad de contraseña, recordarme, mensajes de error.
- **Dashboard principal (index.html):** KPIs (mesas ocupadas, ventas hoy, top plato, top mozo, alertas), botones Actualizar/Exportar/Personalizar, grid de mesas, gráficos (Chart.js), actividad reciente; carga de datos con timeout y reintentos; refresh adaptativo (intervalo según visibilidad de la pestaña).
- **Dashboard SPA (lasgambusinas-dashboard.html):** Diseño v2 (Tailwind, Alpine.js), módulos: Dashboard, Mesas, Áreas, Mozos, Platos, Comandas, Bouchers, Clientes, Auditoría, Cierre Caja, Reportes, Configuración; datos mock en cliente; modales para detalle mesa, crear plato/mesa/mozo, ver comanda/boucher; búsqueda global, atajos, notificaciones, perfil y modo oscuro (UI).
- **Seguridad:** Token en `localStorage`; verificación en carga; redirección a login si no autenticado; middleware `adminAuth.js` en rutas protegidas del servidor.

### Limitaciones actuales

- **lasgambusinas-dashboard.html:** Utiliza datos mock en el cliente; no realiza llamadas a la API en el código actual. La funcionalidad que sí consume API está en `index.html` (/) y en `admin.html` (/admin).
- **dashboard.js:** Diseñado para una vista con IDs concretos (ej. `#mesaGrid`, `.counter`, `#total-mesas`). Es reutilizable cuando la estructura HTML coincida (p. ej. en una versión futura unificada).

---

## 📋 Panel Admin (admin.html)

### Qué es y cómo se sirve

- **URL:** GET `/admin` → `public/admin.html`. Sin JWT (público en la red).
- **Tecnología:** HTML5, CSS (estilo tipo Bootstrap), JavaScript vanilla, `fetch` a `/api/`*, Socket.io-client namespace `/admin`. `const API_BASE = '/api'`.
- **Librerías CDN:** Chart.js (gráficos), jsPDF (PDF), xlsx (Excel), Socket.io client.

### Tabs principales


| Tab                | Contenido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mesas**          | CRUD mesas (nombre, área, estado, activa). Botón "MODO LIBRE TOTAL" → PUT /api/mesas/liberar-todas. Tabla: ID, Número, Área, Estado, Activa, Acciones (Editar, Eliminar).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Áreas**          | CRUD áreas (nombre, descripción, isActive). Tabla: ID, Nombre, Descripción, Estado, Acciones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Mozos**          | CRUD mozos (name, DNI, phoneNumber). Tabla: ID, Nombre, DNI, Teléfono, Acciones.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Platos**         | Tabs internos: Todos / Desayuno / Carta. Panel derecho: Categorías/Tipo. Tabla con scroll horizontal: #, ID, Nombre, Precio, Stock, Categoría, Tipo, **Complementos** (badge con cantidad de grupos), Acciones. Modal Crear/Editar incluye **Complementos del Plato** (ver más abajo).                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Comandas**       | Filtros: ID Comanda, Mesa, Estado (en_espera, recoger, entregado, pagado), Mozo, Cliente, Fecha desde/hasta. **Tabla unificada:** muestra filas de tipo **grupo** (grupos de comandas = Pedidos con varias comandas) y **individual** (una comanda). Toggle "Agrupado / Individual" para vista por grupo o por comanda suelta. Columnas: ID/Grupo, Mesa, Cliente, Mozo, Items, Total, Estado, Fecha/Hora, Acciones. Grupos expandibles; acciones por grupo (Ver, Editar, Eliminar) y por comanda (Ver detalle, Editar platos, Eliminar). Guardar edición: PUT /api/comanda/:id/editar-platos. Ver [Comandas y Grupos de Comandas (Pedidos)](#comandas-y-grupos-de-comandas-pedidos) para el diseño con modelo Pedido. |
| **Bouchers**       | Filtro por fecha (input + "Filtrar por Fecha"). Tabla: N° Boucher, Mesa, Mozo, Comandas, Platos, Subtotal, IGV, Total, Fecha Pago, Acciones (Ver, Imprimir). Modal ver detalle con platos y totales.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Clientes**       | Filtros: Tipo (registrado/invitado), Nombre, DNI. Botón Exportar CSV. Tabla con datos de clientes y total gastado. Acciones: Editar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Reportes**       | Sub-tabs: 💰 Ventas, 🍽️ Top Platos, 👥 Mozos, 🪑 Mesas. Selector de rango de fechas. Tablas con datos de cada reporte (GET /api/reportes/ventas, platos-top, mozos-performance, mesas-ocupacion).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Auditoría**      | Filtro por Acción (comanda_eliminada, ELIMINAR_ULTIMA_COMANDA, ELIMINAR_TODAS_COMANDAS, ELIMINAR_COMANDA_INDIVIDUAL, comanda_editada, plato_eliminado, plato_modificado). Botón "Reporte Completo". Tabla: Fecha/Hora, Acción, Usuario, Comanda #, Motivo, IP, Detalles. Modal "Ver" con comparación platos antes/después y metadata.                                                                                                                                                                                                                                                                                                                                                                                 |
| **Cierre de Caja** | Bloque superior: estado actual (resumen del cierre en curso), botón "Cerrar Caja Ahora" → modal con confirmación y POST /api/cierre-caja. Histórico: filtros fecha desde/hasta, tabla de cierres. Al hacer clic en un cierre: modal **Estadísticas del Cierre** con sub-tabs: 💰 Resumen (resumen financiero, gráficos ventas por día/hora con Chart.js), 🍽️ Productos (top productos, por categoría), 👥 Mozos, 🪑 Mesas, 👤 Clientes, 🔒 Auditoría. Botones exportar PDF y Excel (GET :id/exportar-pdf, :id/exportar-excel).                                                                                                                                                                                       |


### Complementos en Platos (admin.html)

Los platos pueden tener **grupos de complementos**: opciones que el mozo elige al tomar el pedido (ej. "Proteína" → Pollo/Carne/Mixto, "Guarnición" → Arroz/Ensalada).

- **En el modal Crear/Editar Plato:** sección "🍽️ Complementos del Plato" con:
  - Contenedor `#complementos-container` donde se renderizan los grupos.
  - Botón "+ Agregar Grupo de Complemento" → `agregarGrupoComplemento()`.
  - Cada grupo muestra: nombre del grupo (input), opciones (lista de inputs + "Agregar opción", eliminar opción), checkboxes **Obligatorio** y **Selección múltiple**.
  - Funciones JS: `initComplementosEditor(complementos)`, `renderComplementosEditor()`, `agregarGrupoComplemento()`, `eliminarGrupoComplemento(gi)`, `actualizarGrupoComplemento(gi, campo, valor)`, `agregarOpcionComplemento(gi)`, `eliminarOpcionComplemento(gi, oi)`, `syncComplementosHidden()` (sincroniza con `#complementos-hidden`).
  - El formulario envía un campo oculto `complementos` con JSON: array de `{ grupo, obligatorio, seleccionMultiple, opciones }`. En `savePlato()` se parsea y se envía en el body a POST/PUT `/api/platos` o `/api/platos/:id`.
- **En la tabla de platos:** columna "Complementos" con badge que muestra la cantidad de grupos (ej. 🍽️ 2) y tooltip con nombres de grupos; si no hay complementos se muestra "-".
- **Modelo backend:** en `plato.model.js` el campo `complementos` es un array de `{ grupo, obligatorio, seleccionMultiple, opciones }`. En comanda/boucher los ítems de plato pueden llevar `complementosSeleccionados: [{ grupo, opcion }]`.

### Modales y utilidades en admin.html

- **ModalManager:** abrir/cerrar modales con título y cuerpo HTML (evita conflictos con múltiples modales).
- **showAlert(message, type):** alertas success/error en el panel.
- **Tablas:** scroll horizontal con indicador; columna Acciones sticky a la derecha en varias tablas.
- **Carga por tab:** al activar un tab se llama a `loadMesas()`, `loadAreas()`, `loadMozos()`, `loadPlatos()`, `loadComandas()`, `loadBouchers()`, `loadClientes()`, `loadAuditoria()`, `loadCierresCaja()` o se refrescan reportes según corresponda.

### Socket en admin.html

- Conexión a namespace `/admin`. Eventos usados: **plato-menu-actualizado** (refresca lista de Platos); **reportes:boucher-nuevo**, **reportes:comanda-nueva**, **reportes:plato-listo** (actualización en tiempo real del tab Reportes cuando está activo).

### Diferencias con Dashboard (JWT)


| Aspecto           | admin.html (GET /admin)                                                                                          | Dashboard JWT (GET /dashboard, GET /)                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Autenticación     | Sin JWT (público en la red)                                                                                      | JWT obligatorio (POST /api/admin/auth, token en localStorage)                                                   |
| Archivo principal | `public/admin.html`                                                                                              | `public/dashboard/lasgambusinas-dashboard.html` (SPA) o `public/index.html` (multi-página)                      |
| Uso               | Gestión completa: mesas, áreas, mozos, platos, comandas, bouchers, clientes, reportes, auditoría, cierre de caja | Panel con login; index.html carga datos reales vía API; lasgambusinas-dashboard.html actualmente con datos mock |


---

## 👨‍🍳 Cocineros y Configuración KDS

Esta sección describe el módulo de **gestión de cocineros**, que permite administrar usuarios con rol de cocinero y su configuración personalizada para el tablero KDS (Kitchen Display System). El módulo incluye filtros de platos/comandas, métricas de rendimiento y asignación de roles.

### Objetivo

Permitir que cada cocinero tenga una **vista personalizada del KDS** según su especialidad, área de trabajo y preferencias visuales, además de brindar métricas de rendimiento para supervisores y administradores.

### Modelo ConfigCocinero (`configCocinero.model.js`)

El modelo almacena la configuración personalizada de cada cocinero para su tablero KDS:


| Campo / concepto                  | Descripción                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| **usuarioId**                     | ObjectId ref `mozos` — único, índice. Referencia al usuario/cocinero.                   |
| **aliasCocinero**                 | String opcional — nombre a mostrar en cocina (puede diferir del nombre real).           |
| **filtrosPlatos**                 | Configuración de qué platos ver en el KDS:                                              |
| → modoInclusion                   | Boolean — `true` = inclusivo (solo mostrar estos), `false` = exclusivo (ocultar estos). |
| → platosPermitidos                | Array de Number (platoId) — IDs de platos específicos permitidos/bloqueados.            |
| → categoriasPermitidas            | Array de String — categorías permitidas/bloqueadas.                                     |
| → tiposPermitidos                 | Array de String (enum: `platos-desayuno`, `plato-carta normal`).                        |
| **filtrosComandas**               | Configuración de qué comandas ver:                                                      |
| → areasPermitidas                 | Array de String — áreas del restaurante que puede ver.                                  |
| → mesasEspecificas                | Array de Number — mesas específicas (null = todas las de áreas permitidas).             |
| → rangoHorario                    | Objeto con `inicio` y `fin` (formato HH:mm) — filtro por horario.                       |
| → soloPrioritarias                | Boolean — si true, solo muestra comandas urgentes/prioritarias.                         |
| **configTableroKDS**              | Preferencias visuales del tablero:                                                      |
| → tiempoAmarillo                  | Number (minutos, default 15) — tiempo para alerta amarilla.                             |
| → tiempoRojo                      | Number (minutos, default 20) — tiempo para alerta roja.                                 |
| → maxTarjetasVisibles             | Number (default 20, rango 5-100) — tarjetas visibles en pantalla.                       |
| → modoAltoVolumen                 | Boolean — vista compacta con menos animaciones.                                         |
| → sonidoNotificacion              | Boolean — activar/desactivar sonido de nuevas comandas.                                 |
| → modoNocturno                    | Boolean — tema oscuro.                                                                  |
| → columnasGrid                    | Number (default 5, rango 1-8) — columnas del grid de tarjetas.                          |
| → filasGrid                       | Number (default 1, rango 1-4) — filas del grid.                                         |
| → tamanioFuente                   | Number (default 15, rango 12-24) — tamaño de texto.                                     |
| **estadisticas**                  | Métricas de sesión del cocinero:                                                        |
| → ultimaConexion                  | Date — timestamp de última conexión.                                                    |
| → totalSesiones                   | Number — contador de sesiones totales.                                                  |
| → platosPreparados                | Number — contador de platos marcados como listos.                                       |
| **activo**                        | Boolean — estado activo/inactivo de la configuración.                                   |
| **creadoPor**, **actualizadoPor** | ObjectId ref `mozos` — auditoría.                                                       |
| **createdAt**, **updatedAt**      | Timestamps automáticos.                                                                 |


**Métodos del esquema:**

- `configCocineroSchema.statics.getConfiguracionPorDefecto()` — Retorna configuración por defecto para nuevos cocineros.
- `configCocineroSchema.methods.debeMostrarPlato(plato)` — Verifica si un plato debe mostrarse según los filtros configurados.
- `configCocineroSchema.methods.debeMostrarComanda(comanda)` — Verifica si una comanda debe mostrarse según los filtros.

**Índices:** `usuarioId`, `activo`.

### Repository (`cocineros.repository.js`)

Funciones principales de acceso a datos:


| Función                                                                 | Descripción                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `obtenerCocineros(filtros)`                                             | Lista todos los usuarios con rol `cocinero`, incluye su configuración KDS.                                    |
| `obtenerCocineroPorId(usuarioId)`                                       | Obtiene un cocinero específico con su configuración.                                                          |
| `obtenerConfigKDS(usuarioId)`                                           | Obtiene configuración KDS; crea una por defecto si no existe.                                                 |
| `actualizarConfigKDS(usuarioId, datosConfig, actualizadoPor)`           | Crea o actualiza la configuración KDS de un cocinero.                                                         |
| `asignarRolCocinero(usuarioId, asignadoPor)`                            | Asigna rol `cocinero` a un usuario existente; crea configuración por defecto.                                 |
| `quitarRolCocinero(usuarioId, nuevoRol, quitadoPor)`                    | Quita rol de cocinero y desactiva su configuración.                                                           |
| `registrarConexion(usuarioId)`                                          | Registra conexión del cocinero (actualiza `ultimaConexion`, incrementa `totalSesiones`).                      |
| `incrementarPlatosPreparados(usuarioId, cantidad)`                      | Incrementa contador de platos preparados.                                                                     |
| `calcularMetricasRendimiento(usuarioId, fechaInicio, fechaFin)`         | Calcula métricas de rendimiento: total platos, tiempo promedio/min/max de preparación, % dentro SLA (15 min). |
| `obtenerMetricasTodosCocineros(fechaInicio, fechaFin)`                  | Ranking de todos los cocineros ordenados por tiempo promedio de preparación.                                  |
| `obtenerPlatosTopPorCocinero(usuarioId, fechaInicio, fechaFin, limite)` | Platos más preparados por un cocinero con cantidad y tiempo promedio.                                         |


### Controller (`cocinerosController.js`)

Endpoints bajo el prefijo `/api/cocineros`:


| Método | Ruta                         | Descripción                                     | Permiso requerido       |
| ------ | ---------------------------- | ----------------------------------------------- | ----------------------- |
| GET    | `/cocineros`                 | Listar todos los cocineros con su configuración | `ver-mozos`             |
| GET    | `/cocineros/:id`             | Obtener un cocinero específico                  | Propio o `ver-mozos`    |
| GET    | `/cocineros/:id/config`      | Obtener configuración KDS de un cocinero        | Propio o `ver-mozos`    |
| PUT    | `/cocineros/:id/config`      | Actualizar configuración KDS                    | Propio o `editar-mozos` |
| POST   | `/cocineros/:id/asignar-rol` | Asignar rol de cocinero a un usuario            | `gestionar-roles`       |
| POST   | `/cocineros/:id/quitar-rol`  | Quitar rol de cocinero                          | `gestionar-roles`       |
| GET    | `/cocineros/:id/metricas`    | Métricas de rendimiento de un cocinero          | Propio o `ver-reportes` |
| GET    | `/cocineros/metricas/todos`  | Ranking de métricas de todos los cocineros      | `ver-reportes`          |
| POST   | `/cocineros/:id/conexion`    | Registrar conexión (uso interno)                | Solo propio usuario     |


**Autenticación:** Todos los endpoints requieren JWT (`adminAuth` middleware).

**Parámetros:**

- `GET /cocineros?activo=true/false` — Filtrar por estado activo.
- `GET /cocineros/:id/metricas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` — Rango de fechas para métricas.
- `GET /cocineros/metricas/todos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` — Rango para ranking.

### Estructura de la request PUT /cocineros/:id/config

```json
{
  "aliasCocinero": "Chef Juan",
  "filtrosPlatos": {
    "modoInclusion": true,
    "platosPermitidos": [1, 5, 12],
    "categoriasPermitidas": ["Entradas", "Platos de fondo"],
    "tiposPermitidos": ["plato-carta normal"]
  },
  "filtrosComandas": {
    "areasPermitidas": ["Terraza", "Salón Principal"],
    "mesasEspecificas": [1, 2, 3, 4, 5],
    "rangoHorario": { "inicio": "12:00", "fin": "22:00" },
    "soloPrioritarias": false
  },
  "configTableroKDS": {
    "tiempoAmarillo": 15,
    "tiempoRojo": 20,
    "maxTarjetasVisibles": 20,
    "modoAltoVolumen": false,
    "sonidoNotificacion": true,
    "modoNocturno": true,
    "columnasGrid": 5,
    "filasGrid": 1,
    "tamanioFuente": 15
  }
}
```

### Métricas de rendimiento

El sistema calcula métricas basadas en los tiempos de preparación de los platos:


| Métrica                       | Descripción                                        |
| ----------------------------- | -------------------------------------------------- |
| **totalPlatos**               | Cantidad de platos preparados en el período.       |
| **tiempoPromedioPreparacion** | Promedio de minutos entre `en_espera` y `recoger`. |
| **tiempoMinPreparacion**      | Tiempo mínimo de preparación.                      |
| **tiempoMaxPreparacion**      | Tiempo máximo de preparación.                      |
| **porcentajeDentroSLA**       | % de platos preparados en ≤15 minutos.             |


**Cálculo:** Se usa aggregation pipeline sobre `Comanda` con `$unwind` de `platos`, filtrando los que tienen `tiempos.en_espera` y `tiempos.recoger`.

### Integración con Socket.io

Cuando se actualiza la configuración KDS de un cocinero, el controller emite un evento para actualizar el tablero en tiempo real:

```javascript
if (global.emitConfigCocineroActualizada) {
    global.emitConfigCocineroActualizada(id, datosSanitizados);
}
```

**Nota:** La función `emitConfigCocineroActualizada` debe estar definida en `src/socket/events.js` para notificar al namespace `/cocina` o a un room específico del cocinero.

### Flujo de asignación de rol

1. **Admin/Supervisor** llama a `POST /api/cocineros/:id/asignar-rol`.
2. El repository actualiza `rol` a `cocinero` en el documento del usuario (modelo `Mozos`).
3. Se crea una configuración KDS por defecto si no existe.
4. Se registra en el log: usuario, rol anterior, asignado por.

### Flujo de quitar rol

1. **Admin/Supervisor** llama a `POST /api/cocineros/:id/quitar-rol` con body `{ "nuevoRol": "mozos" }`.
2. El repository actualiza `rol` al nuevo valor.
3. Se desactiva la configuración KDS (`activo: false`).
4. Se registra en el log: usuario, rol quitado, nuevo rol, quitado por.

### Archivos del módulo

```
src/
├── database/models/
│   └── configCocinero.model.js     # Esquema ConfigCocinero
├── controllers/
│   └── cocinerosController.js      # Endpoints /api/cocineros/*
├── repository/
│   └── cocineros.repository.js     # Lógica de acceso a datos
└── middleware/
    └── adminAuth.js                # JWT + permisos (ver-mozos, editar-mozos, gestionar-roles, ver-reportes)
```

### Relación con App Cocina

- La **App Cocina** puede usar `GET /api/cocineros/:id/config` al iniciar sesión para cargar la configuración personalizada del cocinero.
- Los filtros de platos y comandas se aplican en el cliente para mostrar solo lo relevante.
- `configTableroKDS` define la apariencia visual del tablero KDS.
- El método `debeMostrarPlato()` y `debeMostrarComanda()` pueden usarse para filtrar en frontend o backend.

---

## 📄 Página de Cocineros (cocineros.html)

### Descripción General

La página `public/cocineros.html` es una interfaz administrativa completa para la gestión de cocineros y zonas KDS. Permite a administradores y supervisores configurar el tablero KDS de cada cocinero, asignar zonas de trabajo, ver métricas de rendimiento y gestionar roles.

### Tecnologías Utilizadas


| Tecnología            | Uso                                                 |
| --------------------- | --------------------------------------------------- |
| **HTML5**             | Estructura semántica con Alpine.js para reactividad |
| **Tailwind CSS**      | Sistema de diseño con tema oscuro personalizado     |
| **Alpine.js**         | Estado reactivo, modales, paginación, tabs          |
| **Tabler Icons**      | Biblioteca de iconos para cocina y restaurantes     |
| **Animate.css / AOS** | Animaciones de entrada y transiciones               |
| **Socket.io-client**  | Actualizaciones en tiempo real                      |
| **Fetch API**         | Llamadas a `/api/`* con autenticación JWT           |


### Estructura de la Página

La página tiene **dos tabs principales**:

#### Tab 1: Cocineros

- **KPIs superiores:** Total cocineros, activos, conectados hoy, platos hoy, % dentro SLA
- **Filtros globales:** Búsqueda por nombre/alias, filtro de estado, selector de período (hoy, 7 días, 30 días, personalizado)
- **Tabla de cocineros:**
  - Columnas: Nombre, Alias, Estado, Última conexión, Platos preparados, Acciones
  - Paginación configurable (5, 10, 20 filas)
  - Selección de cocinero para ver detalle
- **Panel lateral derecho:**
  - Información del cocinero seleccionado
  - KPIs individuales (platos, sesiones)
  - Resumen de configuración KDS
  - Zonas asignadas
  - Métricas detalladas del período
- **Ranking de rendimiento:** Lista ordenada por tiempo promedio de preparación

#### Tab 2: Zonas

- **KPIs de zonas:** Total zonas, activas, con filtros, asignadas
- **Filtros:** Búsqueda por nombre, filtro de estado
- **Tabla de zonas:**
  - Columnas: Color/icono, Nombre, Descripción, Filtros aplicados, Cocineros asignados, Estado, Acciones
  - Paginación completa

### Modales Disponibles


| Modal                    | Función                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Configuración KDS**    | Editar alias, zonas asignadas, preferencias del tablero (tiempos de alerta, grid, sonido, modo nocturno, etc.), horario de trabajo |
| **Asignar Rol Cocinero** | Seleccionar usuario existente para asignar rol de cocinero                                                                         |
| **Métricas Detalladas**  | Ver métricas completas de un cocinero con platos más preparados                                                                    |
| **Quitar Rol**           | Confirmar eliminación del rol de cocinero                                                                                          |
| **Crear/Editar Zona**    | Configurar nombre, descripción, color, icono, filtros de platos y comandas                                                         |
| **Selector de Iconos**   | Elegir icono para la zona (búsqueda por keywords)                                                                                  |
| **Asignar Zonas**        | Gestionar zonas asignadas a un cocinero                                                                                            |


### Funciones Principales (JavaScript)

```javascript
// Estado reactivo principal
{
  cocineros: [],           // Lista de cocineros con su configuración
  selectedCocinero: null,  // Cocinero seleccionado para detalle
  zonas: [],              // Lista de zonas KDS
  rankingMetricas: [],    // Ranking de rendimiento
  metricasCocinero: {},   // Métricas del cocinero seleccionado
  
  // Filtros y paginación
  busqueda: '',
  filtroEstado: '',
  filtroFecha: 'hoy',
  currentPageCocineros: 1,
  pageSizeCocineros: 10,
  
  // Formularios
  formConfig: { ... },    // Configuración KDS a guardar
  formZona: { ... }       // Datos de zona a crear/editar
}
```

### Endpoints Consumidos


| Método | Ruta                             | Uso en la página                |
| ------ | -------------------------------- | ------------------------------- |
| GET    | `/api/cocineros`                 | Listar todos los cocineros      |
| GET    | `/api/cocineros/:id/config`      | Obtener configuración KDS       |
| PUT    | `/api/cocineros/:id/config`      | Actualizar configuración KDS    |
| POST   | `/api/cocineros/:id/asignar-rol` | Asignar rol de cocinero         |
| POST   | `/api/cocineros/:id/quitar-rol`  | Quitar rol de cocinero          |
| GET    | `/api/cocineros/:id/metricas`    | Métricas de un cocinero         |
| GET    | `/api/cocineros/metricas/todos`  | Ranking de todos los cocineros  |
| GET    | `/api/cocineros/:id/zonas`       | Zonas asignadas a un cocinero   |
| PUT    | `/api/cocineros/:id/zonas`       | Asignar zonas a un cocinero     |
| GET    | `/api/platos/categorias`         | Categorías para filtros de zona |
| GET    | `/api/areas`                     | Áreas para filtros de zona      |
| GET    | `/api/mesas`                     | Mesas para filtros de zona      |
| GET    | `/api/platos`                    | Platos para filtros de zona     |


### Eventos Socket.io


| Evento                   | Descripción                           |
| ------------------------ | ------------------------------------- |
| `roles-actualizados`     | Actualizar lista cuando cambian roles |
| `plato-menu-actualizado` | Actualizar platos disponibles         |


### Autenticación

La página requiere **JWT válido** almacenado en `localStorage` como `adminToken`. Si no hay token, redirige a `/login.html`.

---

## 📍 Zonas KDS

### Concepto

Las **Zonas KDS** son estaciones o áreas de trabajo dentro de la cocina que permiten organizar los tableros por especialidad (ej: Parrilla, Postres, Wok, Desayunos). Cada zona tiene filtros específicos que determinan qué platos y comandas se muestran en ella.

### Modelo Zona (`zona.model.js`)


| Campo                  | Tipo    | Descripción                                   |
| ---------------------- | ------- | --------------------------------------------- |
| **nombre**             | String  | Nombre de la zona (ej: "Parrilla", "Postres") |
| **descripcion**        | String  | Descripción opcional                          |
| **color**              | String  | Color hexadecimal para identificación visual  |
| **icono**              | String  | Nombre del icono Tabler Icons                 |
| **filtrosPlatos**      | Object  | Configuración de filtros de platos            |
| → modoInclusion        | Boolean | Si true, solo mostrar los seleccionados       |
| → categoriasPermitidas | Array   | Categorías de platos para esta zona           |
| → tiposPermitidos      | Array   | Tipos de menú (desayuno, carta)               |
| → platosPermitidos     | Array   | IDs de platos específicos                     |
| **filtrosComandas**    | Object  | Configuración de filtros de comandas          |
| → areasPermitidas      | Array   | Áreas del restaurante                         |
| → mesasEspecificas     | Array   | Mesas específicas                             |
| → soloPrioritarias     | Boolean | Solo mostrar comandas urgentes                |
| **activo**             | Boolean | Estado de la zona                             |
| **createdAt**          | Date    | Fecha de creación                             |


### Relación Cocinero - Zona

Los cocineros pueden ser asignados a una o más zonas mediante el campo `zonaIds` en el modelo `Mozos`. La configuración de la zona se hereda al cocinero:

```
Zona (filtros) → Cocinero (zonaIds) → App Cocina (aplica filtros)
```

### Flujo de Trabajo

1. **Admin** crea zonas en `cocineros.html` (tab "Zonas")
2. **Admin** asigna zonas a cocineros en el modal de configuración
3. **Cocinero** inicia sesión en App Cocina
4. **App Cocina** carga configuración desde `GET /api/cocineros/:id/config`
5. **App Cocina** aplica filtros de las zonas asignadas usando `kdsFilters.js`

### Iconos Disponibles

La página incluye un catálogo de iconos de cocina organizados por keywords:


| Categoría         | Iconos                                |
| ----------------- | ------------------------------------- |
| **Cocina**        | tools-kitchen, chef-hat, pot, knife   |
| **Fuego**         | flame, grill, barbecue, zap (picante) |
| **Proteínas**     | meat, fish, egg-fried                 |
| **Vegetales**     | salad, carrot, pepper, leaf           |
| **Carbohidratos** | bread, rice, noodles, pizza           |
| **Bebidas**       | coffee, tea-cup, cup, glass, bottle   |
| **Postres**       | ice-cream, cake, cookie, apple, lemon |
| **Especiales**    | heart, star, snowflake                |


---

## 🍳 Sistema Multi-Cocinero v7.2.1

Esta sección documenta la implementación del **sistema multi-cocinero**, que permite identificar qué cocinero está procesando cada plato, gestionar conflictos de procesamiento, y llevar un registro de tiempos de preparación.

### Objetivo

Permitir que múltiples cocineros trabajen simultáneamente en el KDS, con identificación clara de quién está preparando cada plato, prevención de conflictos y métricas de rendimiento por cocinero.

### Modelo de Datos Extendido (Comanda)

En `comanda.model.js` se añadieron campos para tracking de procesamiento:

**A nivel de plato:**

```javascript
procesandoPor: {
  cocineroId: { type: ObjectId, ref: 'mozos', default: null },
  nombre: { type: String, default: null },      // Nombre completo
  alias: { type: String, default: null },       // Alias del cocinero
  timestamp: { type: Date, default: null }      // Cuándo tomó el plato
},
procesadoPor: {
  cocineroId: { type: ObjectId, ref: 'mozos', default: null },
  nombre: { type: String, default: null },
  alias: { type: String, default: null },
  timestamp: { type: Date, default: null }
}
```

**A nivel de comanda (cuando se toma completa):**

```javascript
procesandoPor: {
  cocineroId: { type: ObjectId, ref: 'mozos', default: null },
  nombre: { type: String, default: null },
  alias: { type: String, default: null },
  timestamp: { type: Date, default: null }
}
```

### Reglas de Negocio

1. **Exclusividad:** Solo el cocinero que tomó el plato puede liberarlo o finalizarlo
2. **Conflicto 409:** Si otro cocinero intenta tomar un plato ya en procesamiento, se devuelve error 409
3. **Autenticación:** Todos los endpoints requieren JWT y verificación de identidad
4. **Auditoría:** Se registra cuando un cocinero deja un plato (`PLATO_DEJADO_COCINA`)

### Flujo de Procesamiento de Platos

El flujo de procesamiento permite que los cocineros "tomen", "liberen" o "finalicen" platos individualmente o comandas completas:

```
┌─────────────────────────────────────────────────────────────────┐
│                     ESTADOS DE UN PLATO                          │
├─────────────────────────────────────────────────────────────────┤
│  pedido → en_espera → recoger → entregado → pagado              │
│                                                                  │
│  Estados de procesamiento (overlay):                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐      │
│  │  Sin tomar   │ ──► │ Procesando   │ ──► │  Procesado   │      │
│  │procesandoPor │     │ (cocinero X) │     │ procesadoPor │      │
│  │    = null    │     │    activo    │     │  completado  │      │
│  └──────────────┘     └──────────────┘     └──────────────┘      │
│         ▲                    │                    │              │
│         │                    ▼                    │              │
│         │            ┌──────────────┐             │              │
│         └────────────│   Liberado   │◄────────────┘              │
│                      │ (motivo opt.) │                            │
│                      └──────────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

**Acciones disponibles:**

| Acción | Endpoint | Descripción |
|--------|----------|-------------|
| Tomar plato | `PUT /api/comanda/:id/plato/:platoId/procesando` | El cocinero indica que está preparando el plato. Si el estado era `pedido`, cambia a `en_espera`. |
| Liberar plato | `DELETE /api/comanda/:id/plato/:platoId/procesando` | El cocinero libera el plato antes de terminarlo. Registra auditoría `PLATO_DEJADO_COCINA`. |
| Finalizar plato | `PUT /api/comanda/:id/plato/:platoId/finalizar` | El cocinero termina el plato. Estado cambia a `recoger`. Se guarda `procesadoPor`. |
| Tomar comanda | `PUT /api/comanda/:id/procesando` | El cocinero toma toda la comanda completa. |
| Liberar comanda | `DELETE /api/comanda/:id/procesando` | El cocinero libera la comanda completa. |

### Estructura de Respuestas

**Éxito (200):**
```json
{
  "success": true,
  "message": "Plato tomado para preparación",
  "data": {
    "comandaId": "67abc...",
    "platoId": "0",
    "procesandoPor": {
      "cocineroId": "67def...",
      "nombre": "Juan Pérez",
      "alias": "Chef Juan",
      "timestamp": "2026-03-22T15:30:00.000Z"
    }
  }
}
```

**Conflicto (409):**
```json
{
  "success": false,
  "error": "Este plato ya está siendo procesado por otro cocinero",
  "procesandoPor": {
    "cocineroId": "67xyz...",
    "nombre": "María García",
    "alias": "Chef María"
  }
}
```

**Sin permisos (403):**
```json
{
  "success": false,
  "error": "Solo el cocinero que tomó el plato puede liberarlo"
}
```

### Eventos Socket.io Nuevos


| Evento                    | Dirección        | Datos                                  | Descripción |
| ------------------------- | ---------------- | -------------------------------------- | ----------- |
| `plato-procesando`        | Server → Cliente | `{ comandaId, platoId, cocinero, timestamp }` | Emitido cuando un cocinero toma un plato |
| `plato-liberado`          | Server → Cliente | `{ comandaId, platoId, cocineroId, timestamp }` | Emitido cuando un cocinero libera un plato |
| `comanda-procesando`      | Server → Cliente | `{ comandaId, comandaNumber, cocinero, timestamp }` | Emitido cuando un cocinero toma una comanda completa |
| `comanda-liberada`        | Server → Cliente | `{ comandaId, comandaNumber, cocineroId, timestamp }` | Emitido cuando un cocinero libera una comanda |
| `conflicto-procesamiento` | Server → Cliente | `{ comandaId, platoId, procesadoPor, mensaje }` | Emitido al room del cocinero que intentó tomar un plato ya tomado |
| `liberacion-automatica`   | Server → Cliente | `{ cocineroId, platosLiberados, timestamp }` | Emitido cuando se liberan platos automáticamente por desconexión |


### Métricas de Cocineros en Cierre de Caja

El módulo de cierre de caja (`cierreCajaRestauranteController.js`) incluye análisis de desempeño de cocineros basado en los campos `procesadoPor` de las comandas:

**Datos calculados:**

```javascript
cocineros: {
  totalCocineros: Number,           // Total de cocineros en el sistema
  cocinerosActivos: Number,         // Cocineros con platos preparados en el período
  totalPlatosPreparados: Number,    // Suma de todos los platos preparados
  tiempoPromedioPreparacion: Number, // Promedio en minutos
  porcentajeDentroSLA: Number,      // % de platos preparados en ≤15 minutos
  desempeñoPorCocinero: [
    {
      cocineroId: ObjectId,
      nombre: String,
      alias: String,
      totalPlatos: Number,
      totalTickets: Number,
      tiempoPromedioPlato: Number,  // Minutos promedio
      platosHora: Number,           // Productividad
      porcentajeSLA: Number,        // % dentro del SLA
      participacion: Number,        // % del total de platos
      score: Number                 // Score de eficiencia
    }
  ],
  rankingCocineros: [...]           // Top 5 cocineros por score
}
```

**Exportación a PDF/Excel:**

El cierre de caja incluye una hoja/sección específica para cocineros con:
- Total de platos preparados
- Tiempo promedio de preparación
- Porcentaje dentro del SLA (15 min)
- Cocineros activos
- Tabla de rendimiento individual

### Auditoría de Platos Dejados

Cuando un cocinero libera un plato sin terminarlo, se registra en auditoría:

```javascript
{
  accion: 'PLATO_DEJADO_COCINA',
  entidadTipo: 'comanda',
  entidadId: comandaId,
  usuario: cocineroId,
  metadata: {
    comandaNumber: Number,
    platoId: String,
    platoNombre: String,
    mesaNum: Number
  }
}
```

### Documentación de Referencia

Para detalles completos de implementación, ver `docs/BACKEND_V7.1_IMPLEMENTACION.md`.

---

## 🔐 Autenticación JWT en Socket.io

### Archivo: `src/middleware/socketAuth.js`

Middleware de autenticación JWT para conexiones Socket.io que garantiza que solo usuarios autenticados puedan conectarse a los namespaces.

### Middlewares por Namespace


| Namespace | Middleware           | Roles Permitidos            |
| --------- | -------------------- | --------------------------- |
| `/cocina` | `authenticateCocina` | cocinero, admin, supervisor |
| `/mozos`  | `authenticateMozos`  | mozos, admin, supervisor    |
| `/admin`  | `authenticateAdmin`  | admin, supervisor           |


### Características de Seguridad

1. **Validación JWT:** Verifica firma y expiración del token
2. **Múltiples fuentes de token:**
  - `auth.token` (recomendado)
  - `handshake.headers.authorization` (Bearer token)
3. **Verificación de roles:** Solo roles permitidos pueden conectarse
4. **Advertencia de expiración:** Emite `token-expiring-soon` cuando el token expira en menos de 5 minutos
5. **Rate limiting:** Previene spam de eventos (configurable, default 10 eventos/segundo)

### Información Adjuntada al Socket

```javascript
socket.user = {
  id: payload.id || payload._id,
  name: payload.name || payload.nombre,
  rol: payload.rol || payload.role,
  permisos: payload.permisos || [],
  aliasCocinero: payload.aliasCocinero || payload.name
};
socket.authToken = token;
```

### Funciones Helper Exportadas


| Función                                          | Descripción                                              |
| ------------------------------------------------ | -------------------------------------------------------- |
| `decodeAndVerifyToken(token)`                    | Decodifica y valida un token JWT                         |
| `emitToUser(namespace, userId, eventName, data)` | Emite evento a usuario específico (room `user-{userId}`) |
| `emitToZona(namespace, zonaId, eventName, data)` | Emite evento a zona específica (room `zona-{zonaId}`)    |
| `rateLimiter(maxEventsPerSecond)`                | Middleware de rate limiting                              |


### Rooms por Zona en Socket.io

**Eventos implementados:**


| Evento             | Descripción                        | Parámetros             |
| ------------------ | ---------------------------------- | ---------------------- |
| `join-zona`        | Unirse a room de zona específica   | `zonaId`               |
| `leave-zona`       | Salir de room de zona              | `zonaId`               |
| `join-mis-zonas`   | Unirse a todas las zonas asignadas | (ninguno)              |
| `joined-zona`      | Confirmación de join               | `{ zonaId, roomName }` |
| `joined-mis-zonas` | Confirmación de mis zonas          | `{ zonas, todas }`     |
| `zona-error`       | Error de acceso a zona             | `{ zonaId, error }`    |


**Validación de acceso:**

- **Admin/Supervisor:** Pueden unirse a cualquier zona
- **Cocinero:** Solo puede unirse a zonas que tiene asignadas (`zonaIds`)

---

## ⚡ Endpoints de Procesamiento

### Controlador: `src/controllers/procesamientoController.js`

Endpoints para el sistema de procesamiento con identificación de cocinero.

### Endpoints Disponibles


| Método   | Endpoint                                     | Descripción                                | Body                      |
| -------- | -------------------------------------------- | ------------------------------------------ | ------------------------- |
| `PUT`    | `/api/comanda/:id/plato/:platoId/procesando` | Cocinero toma un plato                     | `{ cocineroId }`          |
| `DELETE` | `/api/comanda/:id/plato/:platoId/procesando` | Cocinero libera un plato                   | `{ cocineroId, motivo? }` |
| `PUT`    | `/api/comanda/:id/plato/:platoId/finalizar`  | Cocinero finaliza un plato (marca recoger) | `{ cocineroId }`          |
| `PUT`    | `/api/comanda/:id/procesando`                | Cocinero toma toda la comanda              | `{ cocineroId }`          |
| `DELETE` | `/api/comanda/:id/procesando`                | Cocinero libera la comanda                 | `{ cocineroId }`          |


### Códigos de Respuesta


| Código | Significado                                            |
| ------ | ------------------------------------------------------ |
| `200`  | Operación exitosa                                      |
| `400`  | Parámetros faltantes                                   |
| `403`  | Sin permisos (no es el cocinero que tomó el recurso)   |
| `404`  | Comanda o plato no encontrado                          |
| `409`  | Conflicto (ya está siendo procesado por otro cocinero) |
| `500`  | Error del servidor                                     |


### Auditoría de Platos Dejados

Cuando un cocinero libera un plato (DELETE `/procesando`), se registra en auditoría:

```javascript
{
  accion: 'PLATO_DEJADO_COCINA',
  entidadTipo: 'comanda',
  entidadId: comandaId,
  usuario: cocineroId,
  metadata: {
    comandaNumber: Number,
    platoId: String,
    platoNombre: String,
    mesaNum: Number
  }
}
```

### Ejemplo de Uso

```javascript
// Tomar un plato
const response = await fetch('/api/comanda/67abc.../plato/0/procesando', {
  method: 'PUT',
  headers: { 
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ cocineroId: '67def...' })
});

// Si otro cocinero ya lo tomó
// Response: 409 { error: 'Este plato ya está siendo procesado por otro cocinero', procesadoPor: {...} }
```

---

## 🍽️ Finalización de Platos y Comandas (v7.4)

Esta sección documenta detalladamente el proceso de **finalización de platos y comandas**, incluyendo la lógica de negocio, funciones involucradas, eventos Socket.io emitidos, y el impacto en las aplicaciones conectadas (App de Cocina, App de Mozos y Dashboard).

### Visión General del Flujo

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE FINALIZACIÓN EN COCINA                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  App Cocina                              Backend                          App Mozos │
│  ──────────                              ───────                          ───────── │
│                                                                                 │
│  1. Marcar plato ──────────────────►  cambiarEstadoPlato()                  │
│     (checkbox visual)                 ├── validar transición               │
│                                        ├── actualizar plato.estado         │
│                                        ├── guardar tiempos.recoger         │
│                                        ├── limpiar procesandoPor           │
│                                        └── emitir plato-actualizado       │
│                                                      │                         │
│                                                      ▼                         │
│  ◄────────────── plato-actualizado ◄──────────────────────────────────────►  │
│  (UI actualizada)              (socket event)         (alerta "Plato Listo")  │
│                                                                                 │
│  2. Finalizar comanda ─────────────►  finalizarComanda()                    │
│     (todos los platos)                ├── iterar todos los platos           │
│                                        ├── cambiar estado a recoger         │
│                                        ├── registrar procesadoPor           │
│                                        ├── actualizar status comanda        │
│                                        └── emitir comanda-finalizada        │
│                                                      │                         │
│                                                      ▼                         │
│  ◄────────────── comanda-finalizada ◄─────────────────────────────────────►  │
│  (UI actualizada)             (socket event)          (mesa en "preparado")   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Diferencia entre Finalizar Plato y Finalizar Comanda

| Aspecto | Finalizar Plato | Finalizar Comanda |
|---------|-----------------|-------------------|
| **Endpoint** | `PUT /api/comanda/:id/plato/:platoId/finalizar` | `PUT /api/comanda/:id/finalizar` |
| **Alcance** | Un solo plato | Todos los platos de la comanda |
| **Estado del plato** | Cambia a `recoger` | Todos cambian a `recoger` |
| **Validación** | Solo el cocinero que tomó el plato puede finalizarlo | Solo el cocinero que tomó la comanda puede finalizarla |
| **Evento Socket** | `plato-actualizado` | `comanda-finalizada` |
| **Status comanda** | Puede cambiar si TODOS los platos están listos | Siempre cambia a `recoger` |
| **Métricas** | Incrementa contador del cocinero (+1 plato) | Incrementa contador (+N platos) |
| **Caso de uso** | Finalización individual por checkbox | Finalización en batch de comanda completa |

### Finalizar Plato: Lógica Detallada

#### Endpoint: `PUT /api/comanda/:id/plato/:platoId/finalizar`

**Archivo:** `src/controllers/procesamientoController.js` (líneas 322-447)

**Proceso paso a paso:**

1. **Validaciones iniciales:**
   - Verificar que `cocineroId` está presente en el body
   - Buscar la comanda por ID (404 si no existe)
   - Encontrar el índice del plato (por `_id` de subdocumento, `platoId` numérico, o índice)

2. **Verificación de propiedad:**
   ```javascript
   if (plato.procesandoPor?.cocineroId && 
       plato.procesandoPor.cocineroId.toString() !== cocineroId) {
     return res.status(403).json({
       error: 'Solo el cocinero que tomó el plato puede finalizarlo'
     });
   }
   ```

3. **Actualización del plato:**
   ```javascript
   await Comanda.updateOne(
     { _id: comandaId },
     {
       $set: {
         [`platos.${platoIndex}.estado`]: 'recoger',
         [`platos.${platoIndex}.tiempos.recoger`]: timestamp,
         [`platos.${platoIndex}.procesadoPor`]: {
           cocineroId, nombre, alias, timestamp
         },
         [`platos.${platoIndex}.procesandoPor`]: null
       }
     }
   );
   ```

4. **Verificación de comanda completa:**
   ```javascript
   const todosListos = comandaActualizada.platos.every(p => 
     p.estado === 'recoger' || p.estado === 'entregado' || p.anulado || p.eliminado
   );
   
   if (todosListos && comandaActualizada.status !== 'recoger') {
     await Comanda.updateOne(
       { _id: comandaId },
       { $set: { status: 'recoger', tiempoRecoger: timestamp } }
     );
   }
   ```

5. **Emisión de eventos Socket.io:**
   - `emitPlatoActualizado(comandaId, platoId, 'recoger')` → A `/cocina` y `/mozos`
   - `emitComandaActualizada(comandaId)` → Si toda la comanda está lista

6. **Actualización de métricas del cocinero:**
   ```javascript
   cocinerosRepository.incrementarPlatosPreparados(cocineroId, 1);
   ```

### Finalizar Comanda: Lógica Detallada

#### Endpoint: `PUT /api/comanda/:id/finalizar`

**Archivo:** `src/controllers/procesamientoController.js` (líneas 724-879)

**Proceso paso a paso:**

1. **Validaciones iniciales:**
   - Verificar que `cocineroId` está presente
   - Buscar la comanda por ID
   - Verificar que el cocinero es quien tomó la comanda (`procesandoPor`)

2. **Iteración sobre todos los platos:**
   ```javascript
   for (let i = 0; i < comanda.platos.length; i++) {
     const plato = comanda.platos[i];
     
     // Saltar platos eliminados o anulados
     if (plato.eliminado || plato.anulado) continue;
     
     const estado = plato.estado || 'en_espera';
     
     // Solo finalizar platos que no estén ya en 'recoger' o 'entregado'
     if (estado !== 'recoger' && estado !== 'entregado') {
       await Comanda.updateOne(
         { _id: comandaId },
         {
           $set: {
             [`platos.${i}.estado`]: 'recoger',
             [`platos.${i}.tiempos.recoger`]: timestamp,
             [`platos.${i}.procesadoPor`]: cocineroInfo,
             [`platos.${i}.procesandoPor`]: null
           }
         }
       );
       platosFinalizados++;
     }
   }
   ```

3. **Limpieza de procesamiento a nivel comanda:**
   ```javascript
   await Comanda.updateOne(
     { _id: comandaId },
     {
       $set: {
         procesandoPor: null,
         updatedAt: timestamp,
         updatedBy: cocineroId
       }
     }
   );
   ```

4. **Actualización del status de la comanda:**
   ```javascript
   if (todosListos && comandaActualizada.status !== 'recoger') {
     await Comanda.updateOne(
       { _id: comandaId },
       { $set: { status: 'recoger', tiempoRecoger: timestamp } }
     );
   }
   ```

5. **Emisión de evento Socket:**
   ```javascript
   if (global.emitComandaFinalizada) {
     global.emitComandaFinalizada(comandaId, cocineroInfo, comandaFinalizada);
   }
   ```

6. **Actualización de métricas del cocinero:**
   ```javascript
   if (platosFinalizados > 0) {
     cocinerosRepository.incrementarPlatosPreparados(cocineroId, platosFinalizados);
   }
   ```

### Eventos Socket.io Emitidos

#### Evento: `plato-actualizado`

**Emitido cuando:** Un plato cambia de estado (incluyendo finalización).

**Emisor:** `global.emitPlatoActualizado(comandaId, platoId, nuevoEstado)`

**Archivo:** `src/socket/events.js`

**Estructura del evento:**
```javascript
{
  comandaId: "67abc...",
  platoId: "0",
  nuevoEstado: "recoger",
  comanda: { /* comanda populada completa */ }
}
```

**Namespaces destinatarios:**
- `/cocina` → Room `fecha-{YYYY-MM-DD}`
- `/mozos` → Broadcast o room `mesa-{mesaId}`

**Recepción en App Mozos:**
```javascript
// ComandaDetalleScreen.js - Línea 361
socket.on('plato-actualizado', (data) => {
  // Actualizar estado local del plato
  // Si nuevoEstado === 'recoger', mostrar alerta "🍽️ Plato Listo"
  // Vibra el dispositivo (Haptics.notificationAsync)
});
```

#### Evento: `comanda-finalizada`

**Emitido cuando:** Una comanda completa es finalizada.

**Emisor:** `global.emitComandaFinalizada(comandaId, cocinero, comanda)`

**Archivo:** `src/socket/events.js` (líneas 1783-1812)

**Estructura del evento:**
```javascript
{
  comandaId: "67abc...",
  comandaNumber: 472,
  cocinero: {
    cocineroId: "67def...",
    nombre: "Juan Pérez",
    alias: "Chef Juan"
  },
  comanda: { /* comanda completa con platos actualizados */ },
  timestamp: "2026-03-25T15:30:00.000Z"
}
```

**Namespaces destinatarios:**
- `/cocina` → Room `fecha-{YYYY-MM-DD}`

### Impacto en el Estado de la Mesa

Cuando se finaliza un plato o comanda, el estado de la mesa puede cambiar:

| Estado Mesa | Condición | Nuevo Estado |
|-------------|-----------|--------------|
| `pedido` | Todos los platos en `recoger` | `preparado` |
| `pedido` | Algunos platos en `recoger` | `pedido` (sin cambio) |
| `preparado` | Mesa con comandas pendientes | `preparado` (sin cambio) |

**Lógica implementada en:** `src/repository/comanda.repository.js` - `cambiarEstadoPlato()`

```javascript
// Actualización automática de mesa
if (nuevoEstado === 'recoger') {
  const nuevaMesaEstado = comanda.platos.every(p => 
    p.estado === 'recoger' || p.eliminado || p.anulado
  ) ? 'preparado' : mesa.estado;
  
  await Mesas.updateOne(
    { _id: mesa._id },
    { $set: { estado: nuevaMesaEstado } }
  );
}
```

### Respuestas de la API

#### Éxito (200 OK):

```json
{
  "success": true,
  "message": "Plato finalizado correctamente",
  "data": {
    "comandaId": "67abc...",
    "platoId": "0",
    "estado": "recoger",
    "procesadoPor": {
      "cocineroId": "67def...",
      "nombre": "Juan Pérez",
      "alias": "Chef Juan",
      "timestamp": "2026-03-25T15:30:00.000Z"
    },
    "comandaLista": true
  }
}
```

#### Error 403 (Sin permisos):

```json
{
  "success": false,
  "error": "Solo el cocinero que tomó el plato puede finalizarlo"
}
```

#### Error 404 (No encontrado):

```json
{
  "success": false,
  "error": "Plato no encontrado en la comanda"
}
```

### Flujo de Datos entre Aplicaciones

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    SINCRONIZACIÓN ENTRE APLICACIONES                            │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  [App Cocina]                    [Backend]                    [App Mozos]        │
│       │                             │                             │               │
│       │  PUT /comanda/:id/plato/    │                             │               │
│       │  :platoId/finalizar         │                             │               │
│       │ ───────────────────────────►│                             │               │
│       │                             │                             │               │
│       │                             │  emitPlatoActualizado()     │               │
│       │                             │ ───────────────────────────►│               │
│       │                             │                             │               │
│       │  socket.on('plato-          │                             │               │
│       │  actualizado') ◄────────────┼─────────────────────────────│               │
│       │  (actualiza UI)             │  socket.on('plato-          │               │
│       │                             │  actualizado') ◄────────────┘               │
│       │                             │  (muestra alerta "Plato Listo")             │
│       │                             │  (actualiza estado local)                    │
│       │                             │                              │               │
│       │  Si TODOS los platos listos:│                              │               │
│       │                             │  emitComandaActualizada()    │               │
│       │                             │ ────────────────────────────►│               │
│       │                             │                              │               │
│       │                             │                              │  Mesa cambia  │
│       │                             │                              │  a "preparado"│
│       │                             │                              │               │
│       └─────────────────────────────┴──────────────────────────────┘               │
│                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Funciones Relacionadas

#### Repository: `comanda.repository.js`

| Función | Descripción |
|---------|-------------|
| `cambiarEstadoPlato(comandaId, platoId, nuevoEstado)` | Cambia el estado de un plato individual |
| `cambiarStatusComanda(comandaId, nuevoStatus, options)` | Cambia el status global de la comanda |
| `recalcularEstadoComandaPorPlatos(comandaId)` | Recalcula el status basado en estados de platos |
| `marcarPlatoComoEntregado(comandaId, platoId)` | Marca un plato como entregado (desde App Mozos) |

#### Controller: `procesamientoController.js`

| Función | Endpoint | Descripción |
|---------|----------|-------------|
| `tomarPlato()` | `PUT /comanda/:id/plato/:platoId/procesando` | Cocinero toma un plato |
| `liberarPlato()` | `DELETE /comanda/:id/plato/:platoId/procesando` | Cocinero libera un plato |
| `finalizarPlato()` | `PUT /comanda/:id/plato/:platoId/finalizar` | Cocinero finaliza un plato |
| `tomarComanda()` | `PUT /comanda/:id/procesando` | Cocinero toma comanda completa |
| `liberarComanda()` | `DELETE /comanda/:id/procesando` | Cocinero libera comanda |
| `finalizarComanda()` | `PUT /comanda/:id/finalizar` | Cocinero finaliza comanda completa |

### Posibles Funciones Faltantes

Basado en el análisis del código, se identifican las siguientes funciones que podrían mejorar el sistema:

| Función | Descripción | Justificación |
|---------|-------------|---------------|
| `finalizarPlatosBatch()` | Finalizar múltiples platos en una sola transacción | Actualmente se usa `Promise.allSettled` en el frontend; una función backend reduciría latencia |
| `reabrirPlato()` | Cambiar estado de `recoger` a `en_espera` | Útil para correcciones cuando un plato necesita repetirse |
| `finalizarComandasMesa()` | Finalizar todas las comandas de una mesa | Optimización para when todas las comandas están listas |
| `getTiemposPreparacion()` | Obtener tiempos de preparación de una comanda | Para métricas y reportes detallados |
| `emitComandaParcialmenteLista()` | Notificar cuando X% de platos están listos | Para dar visibilidad al mozo del progreso |
| `validarTransicionEstado()` | Validar si una transición de estado es válida | Centralizar lógica de validación |

**Función sugerida - `finalizarPlatosBatch()`:**

```javascript
// Sugerencia de implementación
const finalizarPlatosBatch = async (comandaId, platosIds, cocineroId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const comanda = await Comanda.findById(comandaId).session(session);
    
    for (const platoId of platosIds) {
      const platoIndex = findPlatoIndex(comanda.platos, platoId);
      if (platoIndex === -1) continue;
      
      // Verificar propiedad
      if (comanda.platos[platoIndex].procesandoPor?.cocineroId?.toString() !== cocineroId) {
        continue; // O lanzar error
      }
      
      // Actualizar estado
      comanda.platos[platoIndex].estado = 'recoger';
      comanda.platos[platoIndex].tiempos.recoger = new Date();
      // ...
    }
    
    await comanda.save();
    await session.commitTransaction();
    
    // Emitir evento batch
    if (global.emitPlatoBatch) {
      global.emitPlatoBatch(comandaId, platosIds, 'recoger');
    }
    
    return { success: true, platosActualizados: platosIds.length };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};
```

### Métricas y Auditoría

#### Auditoría de Platos Dejados

Cuando un cocinero libera un plato sin finalizarlo, se registra:

```javascript
{
  accion: 'PLATO_DEJADO_COCINA',
  entidadTipo: 'comanda',
  entidadId: comandaId,
  usuario: cocineroId,
  metadata: {
    comandaNumber: 472,
    platoId: "0",
    platoNombre: "Lomo Saltado",
    mesaNum: 5
  }
}
```

#### Métricas del Cocinero

Actualizadas en tiempo real:

| Métrica | Incremento | Evento |
|---------|-----------|--------|
| `platosPreparados` | +1 por plato finalizado | `finalizarPlato()` |
| `totalSesiones` | +1 por conexión | `registrarConexion()` |
| `ultimaConexion` | Timestamp actual | Socket.io connection |

---

## 🔍 Cosmos Search - Búsqueda Unificada

### Archivos Principales

- `public/assets/js/cosmos-search.js` - Lógica principal
- `public/assets/css/cosmos-search.css` - Estilos
- `public/assets/components/cosmos-searchbar.html` - Componente HTML

### Descripción

Sistema de búsqueda unificada estilo **Command Palette** (inspirado en Cosmos.so, VS Code, Linear) que permite buscar rápidamente en todo el dashboard.

### Características

1. **Command Palette (⌘K / Ctrl+K):** Atajo de teclado global para abrir búsqueda
2. **Glassmorphism UI:** Diseño moderno con efectos de blur y transparencia
3. **Búsqueda unificada:** Platos, mesas, clientes, comandas y bouchers
4. **Navegación por teclado:** ↑↓ para navegar, Enter para seleccionar, Esc para cerrar
5. **Agrupación por tipo:** Resultados organizados por categoría
6. **Acciones rápidas:** Atajos a páginas frecuentes (Comandas, Mesas, Reportes)

### Inicialización

```javascript
// Se inicializa automáticamente en DOMContentLoaded
window.cosmosSearch = new CosmosSearch();

// O con opciones personalizadas
new CosmosSearch({
  placeholder: 'Buscar...',
  shortcutKey: 'k',
  maxResults: 10
});
```

### Fuentes de Datos

Carga datos desde múltiples endpoints al inicializar:


| Endpoint                     | Datos                |
| ---------------------------- | -------------------- |
| `GET /api/platos?limit=50`   | Platos del menú      |
| `GET /api/mesas`             | Estado de mesas      |
| `GET /api/clientes?limit=50` | Clientes registrados |
| `GET /api/comanda?limit=30`  | Comandas recientes   |
| `GET /api/boucher?limit=50`  | Bouchers generados   |


### Búsqueda por Tipo


| Tipo    | Búsqueda en                  | Formato de resultado                |
| ------- | ---------------------------- | ----------------------------------- |
| Plato   | nombre, categoría, precio    | `🍽️ Plato · Categoría · S/.precio` |
| Mesa    | número, área, estado         | `🪑 Mesa N · Área · Estado`         |
| Cliente | nombre, email, teléfono      | `👤 Nombre · Contacto`              |
| Comanda | número (#472), mesa, cliente | `📋 Comanda #N · Mesa · Estado`     |
| Boucher | código, estado               | `🎫 Boucher código · Estado`        |


### Integración en Páginas

Se incluye en el topbar de todas las páginas del dashboard:

```html
<div id="cosmos-search-container"></div>
<script src="/assets/js/cosmos-search.js"></script>
```

### Estilos Principales

```css
.cosmos-command-palette { /* Modal backdrop */ }
.cosmos-command-container { /* Container glassmorphism */ }
.cosmos-command-input { /* Input de búsqueda */ }
.cosmos-command-list { /* Lista de resultados */ }
.cosmos-command-item { /* Item individual */ }
.cosmos-badge-plato, .cosmos-badge-mesa, etc. { /* Badges por tipo */ }
```

---

## 🍳 Integración con App de Cocina

Esta sección documenta la relación completa entre la página `cocineros.html` (administración) y la **App de Cocina** (uso operativo por parte de los cocineros).

### Arquitectura de Integración

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  cocineros.html │     │    Backend      │     │   App Cocina    │
│  (Administración)│     │   (API REST)    │     │   (Operativo)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  PUT /cocineros/:id/config                  │
         │──────────────────────►│                       │
         │                       │                       │
         │                       │  emitConfigActualizada │
         │                       │──────────────────────►│
         │                       │                       │
         │                       │◄──────────────────────│
         │                       │  GET /cocineros/:id/config
         │                       │                       │
         │                       │──────────────────────►│
         │                       │  { filtros, config }  │
         │                       │                       │
```

### Flujo de Datos

#### 1. Inicio de Sesión en App Cocina

```javascript
// AuthContext.jsx - App Cocina
const login = async (username, password) => {
  // POST /api/admin/cocina/auth
  // Recibe: { token, usuario: { id, name, rol } }
  // Guarda token en localStorage como 'cocinaAuth'
};
```

#### 2. Carga de Configuración KDS

```javascript
// AuthContext.jsx - App Cocina
const loadCocineroConfig = async () => {
  // GET /api/cocineros/:id/config
  // Headers: Authorization: Bearer <token>
  // Recibe: { aliasCocinero, filtrosPlatos, filtrosComandas, configTableroKDS }
  // Guarda en localStorage como 'cocinaKdsConfig'
};
```

#### 3. Aplicación de Filtros en Tiempo Real

```javascript
// kdsFilters.js - App Cocina
export const aplicarFiltrosCompletos = (comandas, config) => {
  return comandas
    .filter(comanda => debeMostrarComanda(comanda, config.filtrosComandas))
    .map(comanda => ({
      ...comanda,
      platos: filtrarPlatos(comanda.platos, config.filtrosPlatos)
    }));
};
```

#### 4. Actualización en Tiempo Real

```javascript
// useSocketCocina.js - App Cocina
socket.on('config-cocinero-actualizada', (data) => {
  // data: { cocineroId, config }
  // Actualiza cocineroConfig en AuthContext
  // Re-aplica filtros a las comandas visibles
});
```

### Endpoints Específicos para App Cocina


| Endpoint                                     | Propósito                 | Frecuencia                  |
| -------------------------------------------- | ------------------------- | --------------------------- |
| `POST /api/admin/cocina/auth`                | Autenticación de cocinero | Una vez por sesión          |
| `GET /api/cocineros/:id/config`              | Cargar configuración KDS  | Al iniciar sesión + cambios |
| `POST /api/cocineros/:id/conexion`           | Registrar conexión        | Al iniciar sesión           |
| `GET /api/comanda/fecha/:fecha`              | Cargar comandas del día   | Periódicamente + WebSocket  |
| `PUT /api/comanda/:id/plato/:platoId/estado` | Cambiar estado de plato   | Al preparar/entregar        |


### Archivos Clave en App Cocina


| Archivo                                    | Función                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/contexts/AuthContext.jsx`             | Autenticación JWT, carga de configuración KDS, timers de seguridad |
| `src/hooks/useSocketCocina.js`             | Conexión Socket.io con autenticación, eventos de comandas y config |
| `src/utils/kdsFilters.js`                  | Funciones de filtrado de platos y comandas                         |
| `src/components/Principal/ConfigModal.jsx` | Modal de configuración local (servidor, tiempos, grid)             |
| `src/config/apiConfig.js`                  | Configuración de URL del servidor con validación de hosts          |


### Configuración Local vs Servidor

La App Cocina maneja **dos niveles de configuración**:


| Nivel        | Origen                           | Contenido                                                        |
| ------------ | -------------------------------- | ---------------------------------------------------------------- |
| **Servidor** | `GET /api/cocineros/:id/config`  | Filtros de platos/comandas, zonas asignadas, métricas            |
| **Local**    | `ConfigModal.jsx` + localStorage | URL del servidor, tiempos de alerta, grid, sonido, modo nocturno |


**Sincronización:** Los valores de `configTableroKDS` del servidor pueden sobrescribir o complementar la configuración local.

### Eventos Socket.io para Cocineros


| Evento                        | Dirección    | Datos                                  |
| ----------------------------- | ------------ | -------------------------------------- |
| `join-fecha`                  | App → Server | Fecha YYYY-MM-DD                       |
| `join-cocinero`               | App → Server | `cocineroId` (unirse a room personal)  |
| `join-zona`                   | App → Server | `zonaId` (unirse a room de zona)       |
| `join-mis-zonas`              | App → Server | (unirse a todas las zonas asignadas)   |
| `heartbeat`                   | App → Server | Keepalive                              |
| `config-cocinero-actualizada` | Server → App | `{ cocineroId, config }`               |
| `nueva-comanda`               | Server → App | `{ comanda }`                          |
| `plato-actualizado`           | Server → App | `{ comandaId, platoId, nuevoEstado }`  |
| `plato-procesando`            | Server → App | `{ comandaId, platoId, cocinero }`     |
| `plato-liberado`              | Server → App | `{ comandaId, platoId, cocineroId }`   |
| `conflicto-procesamiento`     | Server → App | `{ comandaId, platoId, procesadoPor }` |
| `token-expiring-soon`         | Server → App | `{ message }`                          |


### Seguridad

- **JWT obligatorio:** El token debe incluir `rol: 'cocinero'` para acceso a endpoints de configuración
- **Validación de hosts:** Solo URLs autorizadas en `apiConfig.js` (previene conexiones a servidores maliciosos)
- **Logout por inactividad:** 30 minutos sin actividad cierra sesión automáticamente
- **Advertencia previa:** A los 25 minutos de inactividad se muestra advertencia

---

## 📋 Comandas y Grupos de Comandas (Pedidos)

Esta sección detalla lo que se quiere implementar en el módulo de **comandas** del backend y del dashboard: una **tabla unificada** que muestre tanto **grupos de comandas (Pedidos)** como **comandas individuales**, ordenadas según el tipo de pedido (multi-comanda o una sola comanda), y la **relación con la App de Mozos**.

### Objetivo

- **Una sola tabla** en la vista de comandas (dashboard / admin) que combine:
  - **Filas de tipo "grupo"**: un **Pedido** (grupo de comandas de la misma mesa/visita) cuando hay **varias comandas** asociadas.
  - **Filas de tipo "individual"**: una **comanda suelta** cuando el pedido es de **una sola comanda** (o cuando la comanda no está asociada a un Pedido).
- **Ordenamiento** según el tipo de pedido y criterios de negocio (fecha, estado, mesa, etc.), de modo que se distinga claramente entre multi-comanda y comanda única.

### Modelo Pedido (grupo de comandas)

El backend dispone del modelo **Pedido** (`src/database/models/pedido.model.js`), que representa un **grupo de comandas** de una misma mesa durante una visita:


| Campo / concepto                                                    | Descripción                                                                  |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **pedidoId**                                                        | Auto-incremento numérico visible para el usuario.                            |
| **mesa**                                                            | Referencia a la mesa.                                                        |
| **mozo**                                                            | Mozo principal del pedido.                                                   |
| **cliente**                                                         | Opcional; si se identifica al cliente.                                       |
| **comandas**                                                        | Array de ObjectId ref `Comanda` — las comandas que pertenecen a este pedido. |
| **comandasNumbers**                                                 | Números de comanda para lectura rápida.                                      |
| **estado**                                                          | `abierto`, `cerrado`, `pagado`, `cancelado`.                                 |
| **subtotal, igv, totalSinDescuento, totalConDescuento, totalFinal** | Totales calculados a partir de las comandas.                                 |
| **descuento, motivoDescuento**                                      | Descuentos a nivel de pedido (no por comanda).                               |
| **boucher**                                                         | Referencia al Boucher generado al pagar.                                     |
| **cantidadComandas, totalPlatos**                                   | Campos desnormalizados para listados.                                        |


- **Repository:** `src/repository/pedido.repository.js` (listar pedidos, obtener por ID, obtener o crear pedido abierto por mesa, agregar comanda al pedido, etc.).
- **Controller:** `src/controllers/pedidoController.js` expone rutas como `GET /api/pedidos`, `GET /api/pedidos/:id`, `GET /api/pedidos/mesa/:mesaId`. **Nota:** actualmente el router de pedidos **no está montado** en `index.js`; para que el dashboard consuma grupos de comandas vía API hay que añadir `pedidoRoutes` al array `routes`.

### Tabla unificada: grupos y comandas

Comportamiento deseado de la tabla de comandas:

1. **Fuente de datos**
  - **Grupos:** Pedidos con más de una comanda (y opcionalmente pedidos con una comanda que se quieran mostrar como “grupo”).
  - **Individuales:** Comandas que no pertenecen a ningún Pedido, o comandas que son la única de un Pedido (según criterio de negocio).
2. **Columnas y filas**
  - **Fila grupo:** identificador del grupo (ej. Pedido #, o “GRUPO” + mesa/cliente), mesa, cliente, mozo(s), cantidad de comandas, total de ítems, total monetario, estado del grupo (derivado de las comandas), fecha/hora, acciones (ver grupo, editar, eliminar).
  - **Fila individual:** ID/número de comanda, mesa, cliente, mozo, ítems, total, estado, fecha/hora, acciones.
  - Las filas de grupo pueden ser expandibles para mostrar las comandas que las componen.
3. **Ordenamiento**
  - Ordenar por tipo de pedido (multi-comanda vs una comanda) y por criterios como: fecha/hora (más reciente primero), estado (en_espera, recoger, entregado, pagado), mesa, etc., según lo definido en el dashboard.
4. **Implementación actual en el dashboard**
  - En `public/comandas.html` existe ya una **agrupación en el cliente**: toggle “Agrupado / Individual” que agrupa comandas por `clienteId + mesaNum` y construye filas `tipo: 'grupo'` o `tipo: 'individual'`. Los “grupos” se calculan en frontend, **no** desde el modelo Pedido del backend.
  - **Objetivo de evolución:** que la tabla use como fuente de “grupos” los **Pedidos** del backend (cuando las rutas estén montadas), y que las comandas sueltas o de pedidos de una sola comanda se muestren como filas individuales, alineando así la vista con el modelo de datos y con la App de Mozos.

### Relación con la App de Mozos

- En la **App de Mozos** (Las-Gambusinas), el flujo de toma de pedidos puede apoyarse en **Pedidos**:
  - Al abrir una mesa o tomar el primer pedido: **obtener o crear** un Pedido abierto para esa mesa (`Pedido.obtenerOcrearPedidoAbierto(mesaId, mozoId)` en el modelo; equivalente en `pedido.repository.js`).
  - Cada nueva comanda creada desde la app se **asocia a ese Pedido** (agregar su ObjectId al array `comandas` del Pedido y actualizar totales).
  - Si el pedido es de **una sola comanda** (una visita, un ticket), igualmente puede vivir en un Pedido con `comandas.length === 1`; el dashboard puede mostrarlo como fila individual o como grupo según criterio de UX.
- **Sincronización backend–dashboard:**
  - El backend debe exponer **Pedidos** (y opcionalmente un endpoint que devuelva “filas” ya mezcladas: grupos + individuales) para que la tabla unificada del dashboard refleje la misma estructura que usa la app de mozos.
  - Eventos Socket.io (p. ej. en namespace `/admin`) pueden incluir notificaciones de “pedido actualizado” o “comanda agregada a pedido” para actualizar la tabla en tiempo real.

### Endpoints implicados


| Método | Ruta                        | Uso                                                                                                      |
| ------ | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/api/comanda/fecha/:fecha` | Comandas del día (ya usado por dashboard y cocina).                                                      |
| GET    | `/api/pedidos`              | Listar pedidos activos (filtros: estado, mesa, fecha). **Requiere montar** `pedidoRoutes` en `index.js`. |
| GET    | `/api/pedidos/:id`          | Pedido por ID con comandas pobladas.                                                                     |
| GET    | `/api/pedidos/mesa/:mesaId` | Pedido abierto de una mesa (para mozos y para lógica de “agregar comanda a pedido”).                     |


Opcional: **GET /api/comanda/vista-tabla/:fecha** (o similar) que devuelva un único listado de “filas” (grupos + individuales) ya ordenado, para que el dashboard no tenga que combinar en el cliente.

### Resumen

- **Grupos de comandas** = modelo **Pedido** en el backend (una mesa, varias comandas, estado y totales).
- **Tabla unificada** = una sola tabla que muestra Pedidos (como filas grupo) y comandas sueltas o de un solo ítem (como filas individuales), ordenada por tipo de pedido y criterios de negocio.
- **App Mozos:** usa (o usará) Pedidos para asociar comandas a una misma visita/mesa; el dashboard debe consumir los mismos Pedidos y comandas para mantener coherencia.

---

## 🔗 Integración con Otras Aplicaciones

- **App Mozos:** GET /api/comanda/fecha/:fecha, GET /api/mesas, GET /api/platos, GET /api/areas, POST /api/comanda, PUT comanda y platos, PUT eliminar-plato, PUT eliminar-platos, POST /api/mozos/auth, POST /api/boucher, etc. Socket namespace `/mozos`, rooms `mesa-{mesaId}`. **Relación con grupos:** la app puede usar el modelo Pedido (obtener/crear pedido abierto por mesa, asociar comandas al pedido); el dashboard de comandas debe reflejar esos mismos Pedidos como “grupos” en la tabla unificada (ver [Comandas y Grupos de Comandas (Pedidos)](#comandas-y-grupos-de-comandas-pedidos)).
- **App Cocina:** GET /api/comanda/fecha/:fecha o fechastatus, PUT plato estado, PUT revertir. Socket namespace `/cocina`, room `fecha-YYYY-MM-DD`. **Relación con Cocineros:** la app puede usar `GET /api/cocineros/:id/config` al iniciar sesión para cargar la configuración personalizada del cocinero; los filtros de platos y comandas se aplican en el cliente; `configTableroKDS` define la apariencia visual del tablero KDS. Ver [Cocineros y Configuración KDS](#cocineros-y-configuración-kds).
- **Dashboard (JWT):** Login en `/login` o `/dashboard/login.html` → POST /api/admin/auth (username, password=DNI). Token en localStorage; GET /api/admin/verify para validar. Redirección a `/` (index.html) o acceso a GET /dashboard (lasgambusinas-dashboard.html). Carga de datos vía GET /api/mesas, /api/boucher/fecha/:fecha, /api/comanda, /api/mozos (dashboard.js o lógica en index.html). Socket namespace `/admin` para reportes y plato-menu-actualizado. Ver [Dashboard Administrativo](#dashboard-administrativo).
- **Panel Admin (admin.html):** CRUD vía /api (mesas, áreas, mozos, platos con complementos, comandas con edición de platos, bouchers, clientes); reportes por fecha; auditoría con filtros; cierre de caja con histórico y export PDF/Excel; Socket `/admin` para plato-menu-actualizado y reportes en tiempo real. **Módulo Cocineros:** gestión de cocineros (`GET /api/cocineros`), configuración KDS, métricas de rendimiento, asignación de roles.

---

## ⚙️ Variables de Entorno y Despliegue

Recomendadas en `.env`:

- **DBLOCAL:** URI MongoDB (ej. `mongodb://localhost:27017/lasgambusinas`).
- **PORT:** Puerto (default 3000).
- **IP:** IP del servidor (opcional, para logs y health).
- **JWT_SECRET:** Clave para tokens del dashboard.
- **REDIS_ENABLED:** true/false.
- **REDIS_URL** (o REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_PREFIX).
- **ALLOWED_ORIGINS:** Lista separada por comas de orígenes CORS.
- **NODE_ENV:** development | production.
- **APP_VERSION:** Versión en `/health`.
- **LOG_LEVEL:** info, warn, error, debug.

Scripts en `package.json`: `start`, `dev` (nodemon), `start:pm2`, `stop:pm2`, `reload:pm2`, `restart:pm2`, `logs:pm2`, `migrate:estados`, `migrate:platos-tipos`, `clean:duplicate-platos`, `docker:build`, `docker:up`, `docker:down`, `test`, `test:watch`.

---

## 🧪 Testing y Scripts

- **Jest:** `test` y `test:watch`; `testMatch`: `**/tests/**/*.test.js`; `collectCoverageFrom` en `src/**/*.js` (excl. database y socket).
- **Scripts de migración:** `migrate:estados`, `migrate:platos-tipos`, `clean:duplicate-platos`.
- **Utils de migración:** `migrateEstados.js`, `migratePlatosTipos.js`, `migratePlatoIds.js`, `cleanDuplicatePlatos.js`.

---

## 📌 Problemas Resueltos y Pendientes

### Resueltos (documentados en codebase)

- **Modelo Comanda status:** El enum incluye `cancelado` (comanda.model.js), coherente con comandas vacías tras eliminar-platos.
- **Plato nombreLower:** Campo único y pre-save para búsquedas y consistencia.
- **Health /metrics:** Incluyen estadísticas de platos (porTipo, porCategoria) y responseTime.

### Pendientes / Mejoras

- **Redis Adapter Socket.io:** Dependencia instalada (`@socket.io/redis-adapter`) pero no aplicada en `index.js`; para multi-instancia habría que configurar el adapter explícitamente.
- **Rutas cierre de caja:** Existen dos módulos (cierreCajaController con rutas como /estado, /generar y cierreCajaRestauranteController con /cierre-caja/*). admin.html usa solo `/api/cierre-caja/`*. Documentar claramente cuál es el estándar para nuevos desarrollos.
- **Rutas de Pedidos:** El controlador y el repository de Pedidos existen (`pedidoController.js`, `pedido.repository.js`) pero el router **no está montado** en `index.js`. Para que el dashboard consuma grupos de comandas vía API hay que añadir `pedidoRoutes` al array `routes`. Opcional: vincular la creación de comandas (en `comanda.repository.js`) con `Pedido.obtenerOcrearPedidoAbierto` y agregar la comanda al pedido, para que la tabla unificada y la App de Mozos compartan la misma fuente de verdad (ver [Comandas y Grupos de Comandas (Pedidos)](#comandas-y-grupos-de-comandas-pedidos)).
- **Modelo Zona no existe:** La página `cocineros.html` gestiona zonas KDS pero el modelo `zona.model.js` **no está creado** en el backend. Se referencia en `cocinerosController.js` pero no existe el archivo. **Acción requerida:** Crear el modelo Zona con los campos documentados.
- **Endpoint de zonas no implementado:** No hay rutas CRUD para zonas (crear, listar, actualizar, eliminar). La página `cocineros.html` asume que existen pero el backend no las sirve.

---

## 💡 Sugerencias y Mejoras Futuras

### Mejoras en la Página de Cocineros (cocineros.html)

#### 1. Implementación del Backend para Zonas

**Prioridad: Alta**

Crear el modelo y endpoints para gestión de zonas:

```javascript
// src/database/models/zona.model.js
const zonaSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: String,
  color: { type: String, default: '#d4af37' },
  icono: { type: String, default: 'tools-kitchen' },
  filtrosPlatos: {
    modoInclusion: { type: Boolean, default: false },
    categoriasPermitidas: [String],
    tiposPermitidos: [String],
    platosPermitidos: [Number]
  },
  filtrosComandas: {
    areasPermitidas: [String],
    mesasEspecificas: [Number],
    soloPrioritarias: { type: Boolean, default: false }
  },
  activo: { type: Boolean, default: true },
  creadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Mozos' }
}, { timestamps: true });

// Endpoints necesarios
// GET    /api/zonas           - Listar zonas
// POST   /api/zonas           - Crear zona
// PUT    /api/zonas/:id       - Actualizar zona
// DELETE /api/zonas/:id       - Eliminar zona
```

#### 2. Evento Socket.io para Actualización de Configuración

**Prioridad: Alta**

Implementar en `src/socket/events.js`:

```javascript
// Agregar a las funciones globales
global.emitConfigCocineroActualizada = (cocineroId, config) => {
  // Emitir al room específico del cocinero
  cocinaNamespace.to(`cocinero-${cocineroId}`).emit('config-cocinero-actualizada', {
    cocineroId,
    config,
    timestamp: new Date()
  });
  
  // También emitir al namespace admin para actualización de UI
  adminNamespace.emit('cocinero-config-actualizada', { cocineroId });
};
```

#### 3. Métricas por Zona

**Prioridad: Media**

Agregar métricas agregadas por zona:

```javascript
// GET /api/zonas/:id/metricas
{
  zona: "Parrilla",
  cocinerosAsignados: 3,
  platosPreparados: 156,
  tiempoPromedio: 12.5,
  porcentajeDentroSLA: 89
}
```

### Mejoras en la App de Cocina

#### 1. Sincronización Bidireccional de Configuración

**Prioridad: Media**

Actualmente la configuración se carga al iniciar sesión. Implementar:

- **Pull periódico:** Re-cargar configuración cada 5 minutos
- **Push en cambios:** Socket.io ya escucha `config-cocinero-actualizada`, aplicar cambios en tiempo real
- **Persistencia inteligente:** Combinar config del servidor con preferencias locales del dispositivo

#### 2. Vista Previa de Zonas

**Prioridad: Media**

Agregar tab o selector para cambiar entre zonas asignadas:

```jsx
// Nuevo componente: ZoneSelector.jsx
const ZoneSelector = ({ zonas, onZoneChange }) => {
  return (
    <div className="zone-tabs">
      {zonas.map(zona => (
        <button 
          key={zona._id}
          onClick={() => onZoneChange(zona)}
          className="zone-tab"
          style={{ borderColor: zona.color }}
        >
          <Icon name={zona.icono} />
          {zona.nombre}
        </button>
      ))}
    </div>
  );
};
```

#### 3. Indicador de Platos Ocultos

**Prioridad: Baja**

Mostrar cuántos platos están ocultos por los filtros:

```jsx
const FilterStats = ({ comandasOriginales, comandasFiltradas }) => {
  const ocultos = calcularEstadisticasFiltrado(comandasOriginales, comandasFiltradas);
  
  return (
    <div className="filter-stats">
      <span>Filtrando {ocultos.platosOcultos} platos</span>
      <span>{ocultos.comandasOcultas} comandas ocultas</span>
    </div>
  );
};
```

#### 4. Historial de Métricas Personales

**Prioridad: Baja**

Agregar vista de histórico en la App de Cocina:

```javascript
// GET /api/cocineros/:id/historico
{
  hoy: { platos: 23, tiempoPromedio: 14.2 },
  ayer: { platos: 45, tiempoPromedio: 13.8 },
  semana: { platos: 234, tiempoPromedio: 14.0 },
  mes: { platos: 987, tiempoPromedio: 14.3 }
}
```

### Mejoras de Arquitectura

#### 1. Namespace Socket.io por Cocinero

**Prioridad: Media**

Crear rooms específicos para cada cocinero en el namespace `/cocina`:

```javascript
// Al conectar
socket.on('connection', (socket) => {
  const cocineroId = socket.handshake.auth.cocineroId;
  if (cocineroId) {
    socket.join(`cocinero-${cocineroId}`);
  }
});

// Emitir cambios de configuración solo al cocinero afectado
emitConfigCocineroActualizada(cocineroId, config);
```

#### 2. Cache Redis para Configuración KDS

**Prioridad: Baja**

Evitar consultas frecuentes a MongoDB:

```javascript
// Al cargar configuración
const cachedConfig = await redisCache.get(`kds-config:${cocineroId}`);
if (cachedConfig) return cachedConfig;

const config = await ConfigCocinero.findOne({ usuarioId: cocineroId });
await redisCache.set(`kds-config:${cocineroId}`, config, 300); // 5 min TTL
```

#### 3. Auditoría de Cambios de Configuración

**Prioridad: Media**

Registrar quién cambia la configuración y cuándo:

```javascript
// Modelo: ConfigCocineroHistory
{
  configId: ObjectId,
  cambiadoPor: ObjectId, // Admin que hizo el cambio
  cambios: Object,       // Diferencia antes/después
  fecha: Date
}
```

### Funcionalidades Futuras

#### 1. Turnos y Horarios de Cocineros

Asignar horarios de trabajo y validar que los cocineros solo vean comandas durante su turno.

#### 2. Notificaciones Push

Enviar notificaciones a dispositivos móviles cuando:

- Se asigna una nueva zona al cocinero
- Hay comandas prioritarias sin atender
- La configuración KDS ha sido modificada por un supervisor

#### 3. Dashboard de Supervisión en Tiempo Real

Vista para supervisores que muestre:

- Qué cocineros están conectados
- Cuántos platos pendientes tiene cada uno
- Alertas cuando un cocinero excede tiempo SLA promedio
- Distribución de carga de trabajo

#### 4. Reportes Exportables

Generar PDFs/Excel con:

- Métricas de rendimiento por cocinero/zona
- Comparativa entre períodos
- Rankings históricos

---

## 🔧 Herramientas y Tecnologías Recomendadas

### Herramientas de Desarrollo

| Herramienta | Uso | Estado |
|-------------|-----|--------|
| **VS Code** | IDE principal | Recomendado |
| **Postman** | Testing de API | Recomendado |
| **MongoDB Compass** | Visualización de BD | Recomendado |
| **PM2** | Gestión de procesos en producción | Implementado |
| **Docker** | Containerización | Configurado |
| **Jest** | Testing automatizado | Implementado |

### Herramientas de Monitoreo

| Herramienta | Uso | Estado |
|-------------|-----|--------|
| **Sentry** | Monitoreo de errores | Opcional (configurado) |
| **Winston** | Logging estructurado | Implementado |
| **Prometheus** | Métricas | Implementado (`/metrics`) |
| **Socket.io Admin UI** | Monitoreo de WebSockets | Disponible |

### Tecnologías Frontend del Dashboard

| Tecnología | Uso | Ubicación |
|------------|-----|-----------|
| **Tailwind CSS** | Estilos y diseño responsive | Todas las páginas |
| **Alpine.js** | Reactividad ligera | Dashboard y modales |
| **Chart.js** | Gráficos estadísticos | Reportes y KPIs |
| **Socket.io-client** | Tiempo real | Todas las páginas |
| **Tabler Icons** | Iconografía | cocineros.html |

---

## 🚀 Roadmap de Desarrollo

### Fase Actual (v2.8) - Marzo 2026

- ✅ Sistema Multi-Cocinero v7.2.1 completo
- ✅ Autenticación JWT en Socket.io
- ✅ Rooms por zona
- ✅ Cosmos Search (⌘K)
- ✅ Auditoría de platos dejados
- ✅ Modelo Zona implementado
- ✅ Sistema de reservas

### Próximas Implementaciones

#### Corto Plazo (1-2 meses)

1. **Implementar modelo Zona** con endpoints CRUD completos
2. **Montar rutas de Pedidos** en index.js para habilitar API de grupos de comandas
3. **Mejorar documentación de API** con Swagger/OpenAPI
4. **Tests automatizados** para endpoints críticos

#### Medio Plazo (3-6 meses)

1. **Notificaciones push** para apps móviles
2. **Dashboard de supervisión** en tiempo real
3. **Sistema de turnos** para cocineros
4. **Reportes avanzados** con exportación programada

#### Largo Plazo (6-12 meses)

1. **Multi-sucursal** con sincronización entre locales
2. **App de clientes** para pedidos online
3. **Integración con sistemas contables**
4. **IA para predicción de demanda**

---

## 💡 Sugerencias para el Equipo de Desarrollo

### Mejoras de Código

1. **Unificar respuestas de API**: Crear un helper estándar para respuestas HTTP
   ```javascript
   // src/utils/responseHelper.js
   const ApiResponse = {
     success: (res, data, status = 200) => res.status(status).json({ success: true, data }),
     error: (res, message, status = 400, errors = null) => 
       res.status(status).json({ success: false, message, errors })
   };
   ```

2. **Validación centralizada**: Usar Joi o Zod para validación de esquemas
   ```javascript
   // src/validators/comanda.validator.js
   const Joi = require('joi');
   const comandaSchema = Joi.object({
     mozos: Joi.string().required(),
     mesas: Joi.string().required(),
     platos: Joi.array().min(1).required()
   });
   ```

3. **Documentación automática**: Implementar Swagger UI
   ```bash
   npm install swagger-ui-express yamljs
   ```

### Mejoras de Arquitectura

1. **Microservicios**: Separar servicios de notificaciones, reportes y auditoría
2. **Event Sourcing**: Para trazabilidad completa de cambios
3. **GraphQL**: Como alternativa a REST para consultas complejas
4. **Webhooks**: Para integraciones con sistemas externos

### Mejoras de Seguridad

1. **Rate limiting por usuario**: No solo por IP
2. **Encriptación de datos sensibles**: DNI, teléfonos en MongoDB
3. **Auditoría de accesos**: Log de cada login/logout
4. **2FA**: Para cuentas de administrador

### Mejoras de Performance

1. **Índices compuestos**: Optimizar consultas frecuentes
   ```javascript
   // En comanda.model.js
   comandaSchema.index({ mesa: 1, status: 1, createdAt: -1 });
   ```

2. **Paginación en todos los listados**: Reducir carga de datos
3. **Compresión de respuestas**: Usar `compression` middleware
4. **CDN para archivos estáticos**: En producción

---

## 💰 Sistema de Propinas para Mozos

**Versión:** 1.0  
**Documentación completa:** `docs/SISTEMA_PROPINAS_MOZOS_DOCUMENTACION.md`

### Descripción General

El Sistema de Propinas permite registrar y gestionar las propinas recibidas por el personal de salón. Se activa después de que una mesa es pagada (estado "pagado") y soporta múltiples tipos de propina.

### Modelo de Datos

**Colección:** `propinas`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `propinaId` | Number | ID auto-incremental |
| `mesaId` | ObjectId | Referencia a la mesa |
| `numMesa` | Number | Snapshot del número de mesa |
| `boucherId` | ObjectId | Referencia al boucher |
| `boucherNumber` | Number | Snapshot del número de boucher |
| `mozoId` | ObjectId | Mozo que recibe la propina |
| `nombreMozo` | String | Snapshot del nombre |
| `montoPropina` | Number | Monto final calculado |
| `tipo` | String | "monto", "porcentaje" o "ninguna" |
| `montoFijo` | Number | Si tipo = "monto" |
| `porcentaje` | Number | Si tipo = "porcentaje" (0-100) |
| `totalBoucher` | Number | Total sobre el que se calculó |
| `nota` | String | Nota opcional (max 200 chars) |
| `fechaRegistro` | Date | Timestamp de registro |
| `registradoPor` | ObjectId | Usuario que registró |
| `activo` | Boolean | Soft delete |

### Índices

```javascript
{ mozoId: 1, fechaRegistro: -1 }  // Reportes por mozo
{ mesaId: 1, fechaRegistro: -1 }  // Historial por mesa
{ boucherId: 1 }                   // Relación con boucher
{ fechaRegistro: -1 }              // Listado general
{ activo: 1, fechaRegistro: -1 }   // Filtrar activos
```

### Endpoints API REST

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/propinas` | Crear nueva propina |
| GET | `/api/propinas` | Listar con filtros |
| GET | `/api/propinas/:id` | Obtener por ID |
| GET | `/api/propinas/mesa/:mesaId` | Propinas de una mesa |
| GET | `/api/propinas/mozo/:mozoId` | Propinas de un mozo |
| GET | `/api/propinas/resumen/dia` | Resumen del día |
| GET | `/api/propinas/mozos-dashboard` | Datos para dashboard |
| PUT | `/api/propinas/:id` | Actualizar propina |
| DELETE | `/api/propinas/:id` | Eliminar (soft delete) |

### Validaciones

- ✅ Mesa debe estar en estado "pagado"
- ✅ Mozo, mesa y boucher deben existir
- ✅ Porcentaje entre 0 y 100
- ✅ Monto no negativo

### Página Dashboard: `mozos.html`

**Ubicación:** `public/mozos.html`

**Versión:** 2.0 - Sistema de Metas implementado

#### Estructura de Secciones

| Sección | Tab | Descripción |
|---------|-----|-------------|
| **Principal** | `principal` | Tabla de mozos con métricas, filtros y gestión CRUD |
| **Rendimiento** | `rendimiento` | Gráficos de ventas, propinas, heatmap de productividad |
| **Metas** | `propinas` | Sistema de metas con KPIs, tabla de cumplimiento, ranking |

#### Características Principales

- **KPIs:** Total Mozos, Presencia del equipo, Ventas del período, Líder de ventas
- **Tabla de mozos** con métricas en tiempo real
- **Filtros:** Período (hoy/7 días/mes/personalizado), Estado, Búsqueda
- **Vistas:** Tabla, Tarjetas, Mapa de mesas
- **Modales:** Crear/editar mozo, Detalle con estadísticas
- **Actualización en tiempo real** vía Socket.io

#### Sistema de Metas de Mozos (NUEVO v2.0)

La sección de Metas permite al administrador gestionar objetivos del equipo:

**Tipos de Metas Soportadas:**

| Tipo | Descripción | Ejemplo |
|------|-------------|---------|
| `ventas` | Total facturado | S/. 500/día |
| `mesas_atendidas` | Mesas cerradas con pago | 12 mesas/turno |
| `tickets_generados` | Bouchers procesados | 15 tickets/día |
| `ticket_promedio` | Valor promedio por ticket | S/. 45 mínimo |
| `propinas_promedio` | Propina promedio por ticket | S/. 8 mínimo |

**Estados de Cumplimiento:**

| Estado | Criterio | Color |
|--------|----------|-------|
| `sin_iniciar` | Avance = 0%, mozo fuera de turno | Gris |
| `en_progreso` | Avance 1-49% | Azul |
| `en_riesgo` | Avance < 50% | Naranja |
| `encaminado` | Avance 60-89% | Verde claro |
| `cumplido` | Avance ≥ 100% | Verde |
| `superado` | Avance > 120% | Dorado |

**KPIs de Gestión:**

- Metas activas en el período
- Mozos cumpliendo (≥80%)
- Mozos en riesgo (<50%)
- Cumplimiento promedio del equipo
- Meta más próxima a vencer

**Componentes de la Sección Metas:**

1. **Tabla de cumplimiento** - Por mozo con proyecciones y tendencias
2. **Ranking de cumplimiento** - Top performers con medallas
3. **Distribución del equipo** - Gráfico donut por estado
4. **Recomendaciones automáticas** - Sugerencias contextuales
5. **Modal de nueva meta** - Crear metas individuales o por equipo
6. **Plantillas predefinidas** - 6 plantillas listas para usar
7. **Drawer de detalle** - Vista completa de un mozo

**Plantillas Disponibles:**

| Plantilla | Tipo | Valor | Aplicación |
|-----------|------|-------|------------|
| Meta diaria mañana | Ventas | S/. 400 | Turno mañana |
| Meta diaria noche | Ventas | S/. 600 | Turno noche |
| Rotación de mesas | Mesas | 12 | Todos |
| Ticket promedio mínimo | Ticket | S/. 45 | Todos |
| Meta semanal | Ventas | S/. 2,500 | Todos |
| Propina promedio | Propinas | S/. 8 | Todos |

**Algoritmo de Proyección:**

```javascript
// Cálculo de proyección inteligente
proyeccion = {
  ritmoActual: valorActual / tiempoTranscurrido,
  valorProyectado: ritmoActual * tiempoTotalPeriodo,
  alcanzara: valorProyectado >= valorObjetivo,
  brecha: valorObjetivo - valorProyectado
};
```

**Alertas Automáticas:**

- Mozos por debajo del 40% de avance
- Mozos que no alcanzarán la meta según proyección
- Mozos que superaron la meta (oportunidad de reconocimiento)

### Integración con App Mozos

El flujo post-pago incluye la opción de registrar propina:

1. Mozo genera boucher → mesa estado "pagado"
2. Modal opciones post-pago: [Imprimir] [Liberar Mesa] **[Registrar Propina]**
3. Modal propina con opciones: Sin propina | Monto fijo | Porcentaje (10%, 15%, 20%)
4. POST `/api/propinas` → evento Socket `propina-registrada`
5. Dashboard actualizado en tiempo real

### Eventos WebSocket

**Namespace `/mozos`:**
- `propina-registrada` → Emitido al registrar propina
- `propina-actualizada` → Emitido al actualizar propina
- `propina-eliminada` → Emitido al eliminar propina

**Namespace `/admin`:**
- `propina-registrada` → Actualizar contadores y gráficos
- `propina-actualizada` → Refrescar datos
- `propina-eliminada` → Actualizar contadores
- `mozos-conectados` → Lista de mozos online
- `mozo-rendimiento-update` → Métricas actualizadas

### Integración con Reportes

- **GET /api/reportes/mozos-performance** incluye `propinasTotal`, `promedioPropina`, `porcentajePropinaVsVentas`
- **Cierre de caja** incluye sección de propinas por mozo
- **PDF de cierre** muestra desglose de propinas

### Archivos del Sistema

| Archivo | Propósito |
|---------|-----------|
| `src/database/models/propina.model.js` | Modelo Mongoose de Propina |
| `src/repository/propina.repository.js` | Lógica de datos de propinas |
| `src/controllers/propinaController.js` | Endpoints REST de propinas |
| `public/mozos.html` | Página dashboard con sistema de metas |

### Documentación Detallada

Para información completa del sistema de mozos y metas, ver:
- **`docs/Sistemademozos_md.md`** - Documentación completa del sistema de mozos (v2.0)

---

## 🐛 Debugging de Datos - Metodología

### Lección Aprendida: Caso de los Complementos Faltantes (Marzo 2026)

#### El Problema

Los complementos seleccionados de los platos (`complementosSeleccionados`, `notaEspecial`) no se enviaban al frontend en el endpoint `GET /api/comanda/fecha/:fecha`. El mozo no podía ver información crítica como término de carne, acompañamientos o salsas elegidas por el cliente.

#### Causa Raíz

La **proyección de MongoDB** `PROYECCION_RESUMEN_MESA` en `src/repository/comanda.repository.js` NO incluía los campos:
- `platos.complementosSeleccionados`
- `platos.notaEspecial`
- `platos.plato`
- `platos.platoId`

Aunque el modelo tenía los campos y el frontend estaba preparado para mostrarlos, **los datos nunca salieron del backend**.

#### Solución

```javascript
// ANTES - Proyección incompleta
const PROYECCION_RESUMEN_MESA = {
    'platos._id': 1,
    'platos.estado': 1,
    'platos.eliminado': 1,
    'platos.anulado': 1
};

// DESPUÉS - Proyección corregida
const PROYECCION_RESUMEN_MESA = {
    cantidades: 1,
    'platos._id': 1,
    'platos.platoId': 1,
    'platos.estado': 1,
    'platos.eliminado': 1,
    'platos.anulado': 1,
    'platos.complementosSeleccionados': 1,
    'platos.notaEspecial': 1,
    'platos.plato': 1
};
```

### Archivos Clave para Debugging

| Archivo | Cuándo revisarlo |
|---------|------------------|
| `src/database/models/*.model.js` | Verificar que el campo existe en el schema |
| `src/repository/*.repository.js` | Verificar PROYECCIONES si faltan datos en GET |
| `src/controllers/*.controller.js` | Verificar lógica de endpoints |

### Checklist de Debugging de Datos

```
□ 1. ¿El modelo tiene el campo? → models/*.model.js
□ 2. ¿El POST guarda el campo? → Ver payload enviado
□ 3. ¿El GET retorna el campo? → curl/Postman al endpoint
□ 4. ¿Hay proyección? → repository.js (buscar .select())
□ 5. ¿La proyección incluye el campo? → Agregar si falta
```

### Patrón Común: Proyecciones MongoDB

MongoDB usa proyecciones para optimizar queries. Si un campo no está en la proyección, **nunca llegará al frontend**.

```javascript
// ❌ ERROR: Proyección muy restrictiva
query.select({ 'platos.estado': 1 });

// ✅ CORRECTO: Incluir campos necesarios
query.select({
    'platos.estado': 1,
    'platos.complementosSeleccionados': 1,
    'platos.notaEspecial': 1
});
```

### Verificar Datos con curl

```bash
# Petición directa al endpoint
curl http://localhost:3000/api/comanda/fecha/2026-03-29 | jq '.[0].platos[0]'

# Si el campo no aparece, revisar proyección en repository
```

### Regla de Oro

**Cuando un dato no aparece en el frontend, la causa más probable es que nunca salió del backend.** Verificar siempre las proyecciones en el repository antes de buscar errores en el frontend.

---

## 📚 Referencias Cruzadas

- **DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md:** Arquitectura global, endpoints detallados, modelos, reglas de negocio, WebSockets, FASE 5/6/7.
- **APP_MOZOS_DOCUMENTACION_COMPLETA.md:** Uso de la API y Socket desde la app de mozos.
- **APP_COCINA_DOCUMENTACION_COMPLETA.md:** Uso de la API y Socket desde la app de cocina.
- **Sistemademozos_md.md:** Documentación completa del sistema de mozos con metas v2.0.

---

*Documento generado para el proyecto Las Gambusinas — Backend Node.js/Express/MongoDB/Socket.io. Versión 2.12, marzo 2026.*

**Incluye:**
- **Bug corregido**: Proyecciones de MongoDB - campos faltantes en `PROYECCION_RESUMEN_MESA` causaban que complementos no llegaran al frontend
- Sistema de Mozos v2.0 con Metas: tipos de metas (ventas, mesas, tickets, ticket promedio, propinas), estados de cumplimiento semaforizados, proyección inteligente, ranking, recomendaciones automáticas
- Sistema de Propinas para Mozos v1.0: gestión completa de propinas con modelo Propina, endpoints API REST, página mozos.html en dashboard, integración con App Mozos
- Corrección v7.4.1: Al finalizar comanda se emiten eventos plato-actualizado por cada plato (sincronización en tiempo real con App de Mozos)
- Sistema de Finalización de Platos y Comandas v7.4 (documentación completa de endpoints, eventos Socket.io, impacto entre aplicaciones)
- Sistema Multi-Cocinero v7.2.1 (identificación de cocinero en procesamiento, auditoría de platos dejados)
- Autenticación JWT en Socket.io con rooms por zona
- Cosmos Search (⌘K) para búsqueda unificada
- Documentación completa del panel admin.html: complementos en platos, cierre de caja con estadísticas y export, reportes, auditoría, comandas editables
- Página cocineros.html: gestión de cocineros y zonas KDS con métricas de rendimiento
- Integración completa con App de Cocina: filtros KDS, eventos Socket.io, autenticación JWT
- Sistema de reservas con timeout automático
- Sección de sugerencias, herramientas y roadmap de desarrollo