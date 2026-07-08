# Plan de implementación — Verificación de tickets antes del cierre de caja

**Versión:** 1.0  
**Fecha:** Julio 2026  
**Alcance:** Dashboard (`cierre-caja.html`, `roles.html`), Backend Las Gambusinas (`backend-gambusinas`)  
**Documentación relacionada:**
- [USUARIOS_ROLES_PERMISOS.md](./USUARIOS_ROLES_PERMISOS.md) — sistema de roles y permisos
- [../gambusinas/docs/PLAN_PAGOS_ADELANTADOS.md](../gambusinas/docs/PLAN_PAGOS_ADELANTADOS.md) — tickets de pago adelantado (TPA)
- [../gambusinas/docs/PLAN_PLANTILLA_COMANDAS_APROBACION_Y_REPORTE.md](../gambusinas/docs/PLAN_PLANTILLA_COMANDAS_APROBACION_Y_REPORTE.md) — tickets de aprobación de comanda
- [../docs/BUG_PAGOS_PARCIALES_APROBACION_COCINA.md](../docs/BUG_PAGOS_PARCIALES_APROBACION_COCINA.md) — flujo de pagos parciales y bandeja unificada

---

## 1. Resumen ejecutivo

### Objetivo

Antes de confirmar el **cierre de caja**, la cajera debe revisar una **tabla de comprobación** con todos los tickets del período (pagos adelantados y tickets de comandas del flujo de cocina). Debe poder confirmar cada ticket individualmente o todos a la vez, abrir el detalle completo (comandas, mozo, cocinero, boucher) y **solo entonces** ejecutar el cierre irreversible.

### Valor de negocio

| Necesidad | Descripción |
|-----------|-------------|
| Cajera | Comprobar que todos los cobros del turno/período están correctos antes de cerrar |
| Administración | Trazabilidad de quién verificó cada ticket y cuándo se cerró la caja |
| Operación | Evitar que tickets de cierres anteriores reaparezcan; solo entran los nuevos del período |

### Resultado esperado

| Actor | Experiencia |
|-------|-------------|
| **Cajero** | Ve el módulo Cierre de Caja, abre la tabla de verificación, confirma tickets y cierra caja |
| **Administrador** | Mismo acceso que cajero + historial y estadísticas de cierres |
| **Otros roles** | No ven el módulo ni pueden acceder a las APIs de cierre |

### Archivos principales afectados

| Archivo | Cambio |
|---------|--------|
| `public/cierre-caja.html` | Flujo en 2 pasos: verificación de tickets → confirmación de cierre |
| `public/roles.html` | Nuevos permisos asignables en la UI de roles |
| `public/assets/js/shared.js` | Ocultar enlace del sidebar según permiso |
| `src/database/models/roles.model.js` | Definición de permisos y defaults por rol |
| `src/database/models/mozos.model.js` | Sincronizar permisos fundamentales |
| `src/database/models/ticketAprobacion.model.js` | Campo `verificacionCierre` |
| `src/database/models/ticketPagoAdelantado.model.js` | Campo `verificacionCierre` |
| `src/controllers/cierreCajaRestauranteController.js` | Endpoints de verificación + validación en POST cierre |
| `src/middleware/adminAuth.js` | Proteger rutas con `checkPermission` |

---

## 2. Estado actual del sistema

### 2.1 Flujo de cierre hoy

1. La cajera pulsa **Cerrar Caja** en `cierre-caja.html`.
2. Se muestra un modal con resumen (período, comandas pendientes, monto).
3. Al confirmar, se ejecuta `POST /api/cierre-caja`.
4. El backend marca las comandas con `incluidoEnCierre` (referencia al documento de cierre).

**Limitación:** no existe paso intermedio de verificación ticket por ticket.

### 2.2 Fuentes de datos de tickets

| Modelo | Colección | Tipos | Uso en cocina |
|--------|-----------|-------|---------------|
| `TicketAprobacion` | `ticketsAprobacion` | `comanda_completa`, `pago_parcial` | Bandeja unificada — comandas cobradas que cocina aprueba |
| `TicketPagoAdelantado` | `ticketsPagoAdelantado` | PPA (adelantados) | Bandeja unificada — pagos adelantados para llevar |

La bandeja unificada ya expone `GET /api/aprobacion/pendientes` (ver `aprobacionController.js` y `useTablaAprobacion.js` en App Cocina). Este plan **reutiliza la misma lógica de unificación**, pero orientada al **período de cierre** y con estado de **confirmación por cajero**.

### 2.3 Permisos actuales

- Existe un permiso único: `cierre-caja` (“Realizar cierre de caja diario”).
- Por defecto lo tienen: **admin**, **supervisor** y **cajero**.
- El sidebar muestra “Cierre Caja” a todos los usuarios del dashboard sin filtrar por permiso.
- Las rutas de `cierreCajaRestauranteController.js` **no aplican** `checkPermission` de forma consistente.

### 2.4 Requisito de acceso (negocio)

> El cierre de caja solo lo pueden ver el **cajero** y el **administrador**.

Implica:
- Quitar `cierre-caja` del rol `supervisor` por defecto.
- Restringir página, sidebar y APIs a quien tenga el permiso correspondiente.

---

## 3. Flujo funcional propuesto

### 3.1 Diagrama general

```
[Cajera: Cerrar Caja]
        │
        ▼
[Paso 1: Tabla de verificación de tickets]
        │
        ├── Ver listado (adelantados + comandas del período)
        ├── Confirmar ticket individual
        ├── Confirmar todos
        └── Abrir detalle (comandas, mozo, cocinero, boucher)
        │
        ▼
   ¿Todos confirmados?
        │
   No ──┴── Sí (o sin tickets en período)
        │
        ▼
[Paso 2: Resumen + Confirmar cierre irreversible]
        │
        ▼
[POST /api/cierre-caja]
        │
        ▼
[Marcar tickets y comandas con incluidoEnCierre]
```

### 3.2 Paso 1 — Tabla de comprobación

**Cuándo se abre:** al pulsar el botón **Cerrar Caja** (reemplaza el modal de confirmación directa actual).

**Contenido:** todos los tickets del período pendientes de cierre, unificados:

| Fuente | Etiqueta en UI |
|--------|----------------|
| `TicketPagoAdelantado` | Adelantado |
| `TicketAprobacion` tipo `comanda_completa` | Comanda |
| `TicketAprobacion` tipo `pago_parcial` | Pago parcial |

**Criterio de inclusión en la tabla:**

- `createdAt` dentro del período: desde `ultimoCierre.periodoFin` hasta `now` (misma lógica que el cierre actual).
- `verificacionCierre.incluidoEnCierre` es `null` o no existe.
- `isActive: true` (tickets no anulados).

**Columnas sugeridas:**

| Columna | Descripción |
|---------|-------------|
| # Ticket | `ticketNumber` |
| Tipo | Adelantado / Comanda / Parcial |
| Mesa | `numMesa` |
| Mozo | `nombreMozo` |
| Comandas | `comandasNumbers` (ej. `#42, #43`) |
| Total | `total` con moneda |
| Estado cocina | `pendiente_aprobacion` / `aprobado` / `reportado` / `rechazado` |
| Verificado | Badge o checkbox de confirmación cajero |
| Acciones | Ver detalle · Confirmar |

**Acciones de la barra superior:**

- Contador: `X de Y confirmados`
- **Confirmar todos** — marca todos los pendientes del período como verificados por la cajera actual
- **Continuar al cierre** — habilitado solo si `X === Y` (incluye caso `Y === 0`)

### 3.3 Detalle de un ticket

Panel lateral o sub-modal al pulsar **Ver detalle**:

| Sección | Datos |
|---------|-------|
| Encabezado | # ticket, tipo, fecha, estado cocina, estado verificación cajero |
| Mesa y servicio | Número de mesa, área (si disponible) |
| Personal | Mozo; cocinero(s) por plato (`procesadoPor`, `cocinero` en comanda/boucher) |
| Cliente | Nombre, DNI (si aplica) |
| Pago | Método, subtotal, IGV, total, voucherId, monto recibido, vuelto |
| Comandas | Lista de comandas con número, estado y platos |
| Platos | Nombre, cantidad, precio, complementos, nota, cocinero asignado |
| Boucher | Referencia al voucher contable (no se modifica en verificación) |

**Reutilizar:**

- `ticketAprobacionRepository.obtenerTicketPorId`
- `ticketAprobacionRepository.obtenerTicketImprimible`
- Populate de comandas con `platos`, `mozos`, `procesadoPor` / datos de cocinero en líneas

**Acción en detalle:** botón **Confirmar este ticket** (cierra detalle y actualiza fila en tabla).

### 3.4 Paso 2 — Confirmación de cierre

Equivalente al modal actual (`abrirModalCerrarCaja` → `ejecutarCierreCaja`), con:

- Advertencia de proceso irreversible
- Resumen de período, comandas y monto
- Campo de notas opcionales
- Botón **Confirmar cierre** que llama a `POST /api/cierre-caja`

**Precondición en backend:** no debe quedar ningún ticket del período con `verificacionCierre.confirmado === false`.

### 3.5 Regla: solo tickets nuevos en el siguiente cierre

Tras ejecutar un cierre:

1. Todos los tickets confirmados reciben `verificacionCierre.incluidoEnCierre = cierreId`.
2. Las comandas siguen marcándose con `incluidoEnCierre` (comportamiento actual).
3. En el próximo cierre, la consulta de verificación **excluye** tickets ya incluidos.

Los tickets del cierre anterior **no deben aparecer** en la tabla de comprobación del siguiente cierre.

---

## 4. Modelo de datos

### 4.1 Nuevo bloque en tickets

Agregar en `TicketAprobacion` y `TicketPagoAdelantado`:

```javascript
verificacionCierre: {
  confirmado: {
    type: Boolean,
    default: false,
    index: true,
  },
  confirmadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    default: null,
  },
  confirmadoPorNombre: {
    type: String,
    default: null,
  },
  confirmadoAt: {
    type: Date,
    default: null,
  },
  incluidoEnCierre: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CierreCajaRestaurante',
    default: null,
    index: true,
  },
}
```

### 4.2 Semántica de campos

| Campo | Significado |
|-------|-------------|
| `confirmado` | La cajera revisó y dio conformidad (reversible hasta ejecutar el cierre) |
| `confirmadoPor` / `confirmadoPorNombre` / `confirmadoAt` | Auditoría de quién y cuándo confirmó |
| `incluidoEnCierre` | Ticket ya formó parte de un cierre ejecutado; no vuelve a listarse |

### 4.3 Índices recomendados

```javascript
{ 'verificacionCierre.incluidoEnCierre': 1, createdAt: -1 }
{ 'verificacionCierre.confirmado': 1, createdAt: -1 }
```

### 4.4 Migración de datos existentes

Script único para tickets históricos:

```javascript
// ticketsAprobacion y ticketsPagoAdelantado
{ $set: { verificacionCierre: { confirmado: false, incluidoEnCierre: null } } }
```

Tickets de cierres pasados (si se desea consistencia retrospectiva): opcionalmente marcar `incluidoEnCierre` según comandas ya cerradas en el mismo período (decisión de negocio; no obligatorio en v1).

### 4.5 Caso borde: boucher sin ticket

Si existe un boucher en el período sin `TicketAprobacion` ni `TicketPagoAdelantado` asociado, incluir una fila tipo **Comanda directa** agrupada por boucher para no dejar cobros fuera de la comprobación.

---

## 5. API — Endpoints nuevos y cambios

### 5.1 Endpoints de verificación

| Método | Ruta | Descripción | Permiso |
|--------|------|-------------|---------|
| `GET` | `/api/cierre-caja/verificacion/tickets` | Lista unificada del período pendiente de cierre | `ver-cierre-caja` |
| `GET` | `/api/cierre-caja/verificacion/tickets/:id` | Detalle con comandas, mozo, cocineros, boucher. Query: `tipo=COMANDA\|ADELANTADO` | `ver-cierre-caja` |
| `PUT` | `/api/cierre-caja/verificacion/tickets/:id/confirmar` | Confirma un ticket | `ver-cierre-caja` |
| `PUT` | `/api/cierre-caja/verificacion/tickets/confirmar-todos` | Confirma todos los pendientes del período | `ver-cierre-caja` |
| `GET` | `/api/cierre-caja/verificacion/estado` | `{ total, confirmados, pendientes, puedeCerrar }` | `ver-cierre-caja` |

**Query params de listado (opcionales):** `tipo`, `mesa`, `mozo`, `soloPendientes=true`.

### 5.2 Respuesta de listado (ejemplo)

```json
{
  "success": true,
  "periodoInicio": "2026-07-07T23:00:00.000Z",
  "periodoFin": "2026-07-08T16:00:00.000Z",
  "resumen": {
    "total": 12,
    "confirmados": 8,
    "pendientes": 4,
    "puedeCerrar": false
  },
  "tickets": [
    {
      "id": "...",
      "ticketNumber": 1042,
      "tipo": "ADELANTADO",
      "numMesa": 5,
      "nombreMozo": "Juan Pérez",
      "comandasNumbers": [312],
      "total": 45.50,
      "estadoCocina": "aprobado",
      "verificacionCierre": {
        "confirmado": false,
        "confirmadoPorNombre": null,
        "confirmadoAt": null
      }
    }
  ]
}
```

### 5.3 Cambios en endpoints existentes

| Endpoint | Cambio |
|----------|--------|
| `POST /api/cierre-caja` | Validar permiso `ejecutar-cierre-caja`; rechazar si hay tickets sin confirmar; al guardar, setear `incluidoEnCierre` en tickets confirmados |
| `GET /api/cierre-caja/estado/actual` | Incluir contadores de verificación (`ticketsPendientesVerificar`, `ticketsConfirmados`) |
| `GET /api/cierre-caja/historial` | Proteger con `ver-cierre-caja` |
| `GET /api/cierre-caja/:id` | Proteger con `ver-cierre-caja` |

### 5.4 Servicio sugerido

`src/services/cierreCajaVerificacion.service.js`

Responsabilidades:

- Calcular período desde último cierre
- Unificar `TicketAprobacion` + `TicketPagoAdelantado` (+ bouchers huérfanos si aplica)
- Confirmar individual / masivo
- Evaluar `puedeCerrar`
- Marcar tickets al ejecutar cierre

Reutilizar patrones de `aprobacionComanda.service.js` para detección de tipo de ticket.

---

## 6. Permisos y roles

### 6.1 División del permiso actual

Reemplazar el permiso monolítico `cierre-caja` por dos permisos granulares:

| ID | Nombre | Grupo | Descripción |
|----|--------|-------|-------------|
| `ver-cierre-caja` | Ver Cierre de Caja | Backend/Dashboard | Acceder al módulo, historial, KPIs y tabla de verificación de tickets |
| `ejecutar-cierre-caja` | Ejecutar Cierre de Caja | Backend/Dashboard | Confirmar el cierre irreversible del período |

**Migración:** usuarios/roles con `cierre-caja` reciben ambos permisos nuevos. El permiso `cierre-caja` puede mantenerse como alias deprecated durante una versión o eliminarse en migración de BD.

### 6.2 Defaults por rol del sistema

| Rol | ver-cierre-caja | ejecutar-cierre-caja |
|-----|:-------------:|:--------------------:|
| admin | ✅ | ✅ |
| cajero | ✅ | ✅ |
| supervisor | ❌ | ❌ |
| cocinero | ❌ | ❌ |
| mozos | ❌ | ❌ |
| capitanMozos | ❌ | ❌ |

Los roles personalizados asignan permisos desde `roles.html` como cualquier otro permiso del grupo Backend/Dashboard.

### 6.3 Cambios en `roles.html`

No requiere cambios estructurales: la página carga permisos desde `GET /api/roles/permisos`. Solo hay que:

1. Registrar los dos permisos nuevos en `PERMISOS_FUNDAMENTALES` (`roles.model.js`).
2. Actualizar `PERMISOS_POR_ROL_SISTEMA` (quitar `cierre-caja` de supervisor; asignar los nuevos a admin y cajero).
3. Opcional: en la descripción del permiso `ver-cierre-caja`, aclarar que incluye la tabla de comprobación de tickets.

### 6.4 Protección de UI

| Ubicación | Regla |
|-----------|-------|
| `cierre-caja.html` `init()` | Redirigir si no tiene `ver-cierre-caja` (admin siempre pasa) |
| Botón **Cerrar Caja** | Visible solo con `ejecutar-cierre-caja` |
| `shared.js` — `pages.cierre` | No mostrar en sidebar sin `ver-cierre-caja` |
| APIs | `adminAuth` + `checkPermission(...)` en cada ruta de cierre |

---

## 7. Cambios en `cierre-caja.html`

### 7.1 Estado Alpine nuevo

```javascript
ticketsVerificacion: [],
ticketDetalle: null,
verificacion: {
  total: 0,
  confirmados: 0,
  pendientes: 0,
  puedeCerrar: false,
},
pasoCierre: 1,           // 1 = verificación, 2 = confirmación final
loadingVerificacion: false,
modalDetalleAbierto: false,
```

### 7.2 Métodos nuevos

| Método | Acción |
|--------|--------|
| `abrirModalCerrarCaja()` | Cargar verificación y abrir Paso 1 |
| `cargarTicketsVerificacion()` | `GET /cierre-caja/verificacion/tickets` |
| `confirmarTicket(id, tipo)` | `PUT .../confirmar` |
| `confirmarTodosTickets()` | `PUT .../confirmar-todos` |
| `abrirDetalleTicket(id, tipo)` | `GET .../tickets/:id` |
| `continuarACierreFinal()` | Validar `puedeCerrar` y mostrar Paso 2 |
| `ejecutarCierreCaja()` | Sin cambio sustancial; backend valida de nuevo |

### 7.3 KPIs en página principal

Agregar o adaptar tarjeta:

- **Tickets por verificar** — desde `/verificacion/estado` o `/estado/actual` ampliado
- Mantener **Comandas pendientes** y **Monto pendiente** actuales

### 7.4 UX

- Fila confirmada: estilo `success-glow` o badge verde
- Fila pendiente: destacar en naranja
- Botón **Cerrar Caja** del header: si hay pendientes, al abrir ir directo a Paso 1
- Toast al confirmar ticket individual o masivo
- Deshabilitar **Continuar al cierre** con tooltip: “Confirme todos los tickets primero”

---

## 8. Auditoría

Registrar en `auditoriaAcciones`:

| Acción | Cuándo |
|--------|--------|
| `TICKET_VERIFICADO_CIERRE` | Confirmación individual |
| `TICKETS_VERIFICADOS_CIERRE_MASIVO` | Confirmar todos |
| `CIERRE_CAJA_EJECUTADO` | Al completar POST cierre (metadata: cantidad tickets verificados, usuario, período) |

Metadata sugerida por ticket:

```javascript
{
  ticketId,
  ticketNumber,
  tipo: 'ADELANTADO' | 'COMANDA' | 'PAGO_PARCIAL',
  numMesa,
  total,
  cierreId, // solo en cierre ejecutado
}
```

---

## 9. Reglas de negocio

1. **Verificación ≠ cierre:** confirmar un ticket es revisión operativa; el cierre es contable e irreversible.
2. **Bloqueo de cierre:** si existe al menos un ticket del período con `confirmado: false`, `POST /cierre-caja` responde `400` o `403` con mensaje claro.
3. **Período:** mismo criterio que hoy — desde `ultimoCierre.periodoFin` hasta la fecha/hora del cierre.
4. **Tickets reportados por cocina:** siguen en la tabla; la cajera debe verificarlos o escalar antes de cerrar (no se excluyen automáticamente).
5. **Tickets de días anteriores no cerrados:** si `incluidoEnCierre` es null, aparecen en el próximo cierre (deuda pendiente).
6. **Desconfirmar ticket:** no contemplado en v1 (solo antes del cierre final, recargando sin confirmar si se cierra el modal sin cerrar caja).
7. **Reapertura de cierre:** si existe flujo de reabrir cierre, definir si revierte `incluidoEnCierre` en tickets (fuera de alcance v1; documentar como decisión pendiente).

---

## 10. Plan de implementación por fases

| Fase | Entregable | Archivos |
|------|------------|----------|
| **1** | Permisos `ver-cierre-caja` y `ejecutar-cierre-caja`; quitar acceso supervisor | `roles.model.js`, `mozos.model.js`, migración permisos |
| **2** | Campo `verificacionCierre` en modelos de ticket + script migración | `ticketAprobacion.model.js`, `ticketPagoAdelantado.model.js` |
| **3** | Servicio y endpoints de verificación | `cierreCajaVerificacion.service.js`, `cierreCajaRestauranteController.js` |
| **4** | Validación y marcado en `POST /cierre-caja` | `cierreCajaRestauranteController.js` |
| **5** | UI: tabla, detalle, flujo 2 pasos | `cierre-caja.html` |
| **6** | Sidebar, guard de página, middleware API | `shared.js`, `adminAuth.js`, rutas en `index.js` |
| **7** | Pruebas manuales y ajuste KPIs | Checklist §11 |

---

## 11. Criterios de aceptación

- [ ] Al pulsar **Cerrar Caja**, se abre primero la tabla de tickets (adelantados + comandas).
- [ ] La cajera puede **confirmar uno a uno** o **confirmar todos**.
- [ ] Puede abrir el **detalle** con comandas, mozo, cocinero y boucher.
- [ ] El botón de cierre final solo se habilita cuando **todos** los tickets del período están confirmados.
- [ ] Tras un cierre ejecutado, esos tickets **no aparecen** en el siguiente cierre.
- [ ] Solo **admin** y **cajero** ven el módulo por defecto; supervisor no.
- [ ] En **roles.html** se pueden asignar `ver-cierre-caja` y `ejecutar-cierre-caja` a roles personalizados.
- [ ] El backend rechaza el cierre si falta alguna confirmación (doble validación UI + API).
- [ ] Las acciones de verificación quedan registradas en auditoría.

---

## 12. Riesgos y decisiones pendientes

| Tema | Opciones | Recomendación v1 |
|------|----------|------------------|
| Bouchers sin ticket | Ignorar / incluir como fila extra | Incluir como “Comanda directa” |
| Solo tickets aprobados por cocina | Filtrar por estado / mostrar todos | Mostrar **todos** del período (comprobación completa) |
| Permiso `cierre-caja` legacy | Mantener alias / eliminar | Alias deprecated una versión, luego eliminar |
| Reabrir cierre | Revertir tickets / no revertir | Documentar; no implementar en v1 |
| Rol personalizado “solo ver” | Solo `ver-cierre-caja` | Permitido vía roles.html |

---

## 13. Referencias de código

| Recurso | Ruta |
|---------|------|
| Página cierre de caja | `public/cierre-caja.html` |
| Gestión de roles | `public/roles.html` |
| Controller cierre restaurante | `src/controllers/cierreCajaRestauranteController.js` |
| Modelo comanda (`incluidoEnCierre`) | `src/database/models/comanda.model.js` |
| Ticket aprobación comanda | `src/database/models/ticketAprobacion.model.js` |
| Ticket pago adelantado | `src/database/models/ticketPagoAdelantado.model.js` |
| Bandeja unificada cocina | `src/controllers/aprobacionController.js` |
| Permisos y roles | `src/database/models/roles.model.js` |
| Middleware auth | `src/middleware/adminAuth.js` |
| Sidebar compartido | `public/assets/js/shared.js` |

---

*Documento de planificación — sin implementación. Actualizar versión al cerrar decisiones pendientes de §12.*
