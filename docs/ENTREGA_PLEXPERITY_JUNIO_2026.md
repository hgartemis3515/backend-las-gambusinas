# Entrega a Plexperity — Backend Las Gambusinas

**Fecha:** 17 de junio de 2026  
**Repositorio:** `backend-gambusinas`  
**Rama principal:** `main`  
**Documentación de referencia:** [BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md](./automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md)

---

## 1. Resumen ejecutivo

Desde la última entrega documentada (abril 2026), el backend recibió mejoras operativas centradas en **notificaciones push para mozos**, **estabilidad del login**, **higiene de despliegue** y **emisión Socket.io dirigida al mozo asignado**. El sistema sigue siendo Node.js + Express + MongoDB + Socket.io (+ Redis opcional).

| Área | Estado |
|------|--------|
| Push notifications (Expo) | Operativo |
| Login mozos (timeouts) | Corregido |
| Socket.io JWT por namespace | Operativo (sin cambios estructurales en este período) |
| Seguridad API (deny-by-default) | Pendiente — ver reporte automático |
| `.env` en repositorio | Eliminado; usar `.env.example` |

---

## 2. Cambios por fecha

### Junio 2026

#### 2.1 Fix login mozos — timeout en autenticación (`82db814`)

**Problema:** Con muchos registros en la colección `mozos`, `autenticarMozo` hacía `find({})` en cada intento de login, provocando timeouts en el cliente (App Mozos).

**Solución:** Búsqueda acotada con `$or` por `name`, `usuarioWeb`, `nombres` y prefijo de primer nombre. Solo si no hay candidatos se hace fallback al escaneo completo.

**Archivo:** `src/repository/mozos.repository.js` — función `autenticarMozo`.

**Impacto en integraciones:** Ningún cambio de contrato en `POST /api/mozos/login`. Mejora de rendimiento y fiabilidad.

---

### Mayo 2026

#### 2.2 Notificaciones push funcionales (`58f0a9b`)

**Qué hace:** Cuando cocina marca un plato o comanda como `recoger`, el backend envía push remoto al mozo asignado vía **Expo Push API** (`expo-server-sdk`).

**Archivos principales:**

| Archivo | Rol |
|---------|-----|
| `src/services/pushNotifications.js` | Servicio de envío, deduplicación 10 s, mensajes personalizados |
| `src/socket/events.js` | Integración con eventos `plato-actualizado`, `comanda-actualizada`; emisión a room `mozo-{id}` |
| `src/controllers/comandaController.js` | Hooks de notificación en cambios de estado |
| `src/controllers/procesamientoController.js` | Notificación al finalizar plato en cocina |

**Flujo:**

```
Cocina marca plato → recoger
    → events.js emite Socket a room mozo-{mozoId}
    → pushNotifications.notifyPlatoListo() / notifyComandaLista()
    → Expo Push API → dispositivo del mozo
```

**Endpoint de registro de token (sin cambios de contrato):**

```
POST /api/mozos/push-token
Body: { pushToken, pushPlatform?, pushDeviceId? }
Auth: JWT del mozo
```

**Campos en modelo `mozos`:** `pushToken`, `pushPlatform`, `pushDeviceId`, `pushTokenUpdatedAt`.

**Deduplicación:** Evita doble push cuando se emiten `plato-actualizado` y `plato-actualizado-batch` para el mismo plato (ventana 10 s).

**Documentación relacionada:** [SISTEMA-NOTIFICACIONES.md](./SISTEMA-NOTIFICACIONES.md), [USUARIOS_ROLES_PERMISOS.md](./USUARIOS_ROLES_PERMISOS.md).

---

### Abril 2026

#### 2.3 Modo operativo y higiene de entorno (`4bda521`, `2fe16b1`)

- **`.env` de producción** dejó de versionarse; se añadió `.env.example` con variables documentadas.
- **`data/*.json`** (datos locales de desarrollo) excluidos del repositorio.
- **`index.js`:** Ajustes de arranque y configuración para entorno productivo estable.
- **`configuracionController.js`:** Pequeños ajustes de lectura de configuración para apps cliente.

#### 2.4 Plan Launcher Windows (`27c2a1a`)

Documentación de plan para launcher nativo Windows en `docs/PLAN_LAUNCHER_NATIVO_WINDOWS.md`. No afecta API ni Socket.io actuales.

#### 2.5 Cambios acumulados abril (ya en docs v2.20, incluidos por contexto)

| Funcionalidad | Descripción breve |
|---------------|-----------------|
| Perfil de mozo | Endpoints y sincronización de foto/datos de perfil |
| Notificaciones dashboard | Modelo `Notificacion`, namespace `/admin`, UI en dashboard |
| Roles y permisos | Modelo unificado en `mozos.model.js`, 24 permisos |
| Supervisor cocina | Permisos y flujos de supervisión KDS |
| Sincronización tiempo real | Mesas, comandas y mapa en tiempo real |
| Reportes | Correcciones en reportes de cocineros y cierre |

---

## 3. Socket.io — comportamiento actual relevante para App Mozos

### Autenticación

Cada namespace exige JWT en handshake (`src/middleware/socketAuth.js`):

| Namespace | Roles permitidos |
|-----------|------------------|
| `/mozos` | mozos, admin, supervisor |
| `/cocina` | cocinero, admin, supervisor |
| `/admin` | admin, supervisor |

### Rooms en `/mozos`

| Room | Uso |
|------|-----|
| `mesa-{mesaId}` | Eventos de una mesa específica |
| `mozo-{mozoId}` | Eventos dirigidos al mozo asignado (nuevo enfoque mayo 2026) |

### Eventos que disparan push

| Evento Socket | Push asociado |
|---------------|---------------|
| Plato pasa a `recoger` | `notifyPlatoListo` — "Plato X listo para recoger. Mesa N" |
| Todos los platos activos en `recoger` | `notifyComandaLista` — comanda lista en cocina |

Catálogo completo de eventos: [App Mozos, App Cocina, Backend](../gambusinas/docs/App%20Mozos,%20App%20Cocina,%20Backend%20Las%20Gambusinas.md) (en repo `gambusinas`).

---

## 4. Endpoints sin cambio de contrato (referencia rápida)

Los siguientes endpoints siguen siendo la interfaz principal para App Mozos:

| Método | Ruta | Uso |
|--------|------|-----|
| POST | `/api/mozos/login` | Autenticación mozo |
| POST | `/api/mozos/push-token` | Registro token Expo Push |
| GET | `/api/comanda/fecha/:fecha` | Comandas del día |
| GET | `/api/configuracion/voucher-plantilla` | Plantilla de boucher |
| POST | `/api/boucher` | Crear boucher / pago |
| POST | `/api/propinas` | Registrar propina |
| PUT | `/api/comanda/:id/plato/:platoId/estado` | Cambiar estado plato (entregar) |

Documentación exhaustiva de endpoints: [DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md](./automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md).

---

## 5. Despliegue y configuración

### Variables de entorno nuevas o relevantes

Copiar desde `.env.example`. No commitear `.env` real.

| Variable | Descripción |
|----------|-------------|
| `JWT_SECRET` | Obligatoria en producción |
| `MONGODB_URI` | Conexión MongoDB |
| `REDIS_URL` | Opcional — adapter Socket.io multi-instancia |
| `PORT` | Puerto HTTP (default 3000) |

### Arranque

```bash
npm install
cp .env.example .env   # editar valores reales
npm start
```

Instrucciones detalladas: [INSTRUCCIONES_INICIO.md](./INSTRUCCIONES_INICIO.md).

---

## 6. Issues conocidos y deuda técnica

Documentados en [REPORTE_BACKEND_AUTOMATICO.md](./automated/REPORTE_BACKEND_AUTOMATICO.md) (última revisión marzo 2026):

- API REST sin autenticación deny-by-default en todos los routers.
- Credencial admin por defecto en bootstrap (`inicializarUsuarioAdmin`).
- Totales de comanda/pedido pueden incluir platos anulados en algunos flujos.
- Cierre de caja puede incluir comandas no pagadas.

**Recomendación para Plexperity:** Priorizar hardening de seguridad antes de exposición a internet pública.

---

## 7. Repositorios relacionados

| Repo | Documento de entrega |
|------|---------------------|
| App Mozos (`gambusinas`) | [ENTREGA_PLEXPERITY_JUNIO_2026.md](../../gambusinas/docs/ENTREGA_PLEXPERITY_JUNIO_2026.md) |
| App Cocina (`appcocina`) | Sin cambios documentados en este período para entrega Plexperity |

---

## 8. Commits de referencia (abril–junio 2026)

```
82db814 fix: acotar busqueda en autenticarMozo para evitar timeouts de login
58f0a9b Notificaciones funcionales
4bda521 gambusinas operativo
2fe16b1 chore: dejar de versionar .env de producción y data/*.json
27c2a1a Plan launcher
```

---

*Documento generado para handoff a Plexperity. Para detalle técnico completo del sistema, consultar la documentación automatizada en `docs/automated/`.*
