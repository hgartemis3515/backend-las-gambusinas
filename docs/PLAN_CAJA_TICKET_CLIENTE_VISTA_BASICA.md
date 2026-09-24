# PLAN — Rol Caja, Cobro Directo, Ticket de Cliente (Para llevar) y Vista Básica de Comanda

> Creado: 23/09/2026 · Estado: planificado (pendiente de implementación)

---

## 0. Resumen ejecutivo

Se implementan 4 mejoras conectadas entre sí:

| # | Mejora | Apps afectadas |
|---|--------|----------------|
| 1 | **Rol Caja**: privilegios de cobro directo + sección "Caja" en configuracion.html + control de la tabla de tickets/PPA | Backend, app mozos, appcocina, dashboard |
| 2 | **Ticket de cliente** en comandas "Para llevar": código secuencial diario (reinicia cada día) o nombre opcional del cliente | App mozos, Backend, appcocina (KDS), impresión |
| 3 | **Impresión comanda de mozo**: incluir cliente (#código o nombre) solo en comandas para llevar | App mozos, dashboard |
| 4 | **Vista Básica** (default) y **Vista Avanzada** en el modal "Ver comanda" de comandas.html | Dashboard |

Principio de seguridad: **el rol siempre se valida en el backend** (JWT), nunca se confía en lo que envía el cliente.

---

## 1. FASE 1 — Rol Caja y cobro directo desde app de mozos

### 1.1 Situación actual (levantado del código)

- El rol `cajero` **ya existe**: `backend-LasGambusinas/src/database/models/roles.model.js` línea 10 (`ROLES_SISTEMA`), con permisos de supervisor + exclusivos de caja (`ver-cierre-caja`, `ejecutar-cierre-caja`, líneas 102 y 124).
- App de mozos: el login guarda `user.rol` y `user.permisos` en AsyncStorage (`Las-Gambusinas/Pages/Login/Login.js` líneas 530–547).
- El pago del mozo va por `POST /api/boucher` (`PagosScreen.js` líneas 1597–1645) → `boucherController.js:160` → `boucherPagoService.js:655 crearTicketAprobacion` (crea ticket `pendiente_aprobacion`, origen `pago`, sourceApp `mozos`).
- La aprobación se hace desde appcocina: `PUT /api/aprobacion/:id/aprobar` (`aprobacionController.js:433` → `aprobacionComanda.service.js:320 aprobarTicketUnificado` → `ticketAprobacion.repository.js:301 aprobarTicket` / `claimTicketForApproval` línea 71).
- La tabla de tickets/PPA de appcocina usa `useTablaAprobacion.js` (línea 438 `aprobarItem`) y `TicketsPpaPage.jsx` (botones "Cobrar" líneas 709–729).

### 1.2 Cambios

#### Backend

| Archivo | Cambio |
|---|---|
| `src/database/models/configuracion.model.js` | Nueva sección `caja: { cobroDirectoMozos: Boolean (default true), autoAprobarCobroCaja: Boolean (default true) }` |
| `src/controllers/configuracionController.js` | Validar/persistir la sección `caja` en `PUT /configuracion` (línea 155) y devolverla en `GET /configuracion` (línea 61) |
| `src/middleware/` (nuevo o existente) | Middleware `authMozoOpcional`: decodifica el JWT del header `Authorization` y adjunta `req.usuario = { _id, name, rol }` a `/boucher` y `/pago-adelantado`. Si no hay token, sigue funcionando como hoy (compatibilidad) |
| `src/services/boucherPagoService.js` (`crearTicketAprobacion` línea 655) | Nuevo parámetro `cobroDirectoCaja`. Si `req.usuario.rol === 'cajero'` (o `admin`) **y** config `caja.cobroDirectoMozos` está activa → el ticket se crea con `estado: 'aprobado'` + `aprobadoPor/aprobadoPorNombre/fechaAprobacion` y se ejecutan **los mismos efectos que la aprobación manual** (platos → `pagado`, comanda → `pagado`, liberar mesa si corresponde, sockets `ticket-ppa-aprobado`/`comanda-aprobada`). Reutilizar `ticketAprobacion.repository.aprobarTicket` en vez de duplicar lógica |
| `src/controllers/boucherController.js` (línea 160) y `src/controllers/pagoAdelantadoController.js` (línea 36) | Pasar el rol del usuario autenticado al service; rechazar `cobroDirecto` si el rol no es cajero/admin (403) |
| `src/controllers/aprobacionController.js` | Reforzar `PUT /aprobacion/:id/aprobar` (línea 433), `/rechazar` y `/reportar` para exigir rol `admin | supervisor | cajero` (middleware `checkPermission` de `adminAuth.js`) — la tabla "siempre la maneja caja y administradores como supervisores" |

> **Regla clave**: el backend NUNCA acepta "soy caja" desde el body; lo deduce del JWT. El flag del body solo indica intención.

#### App de mozos (`Las-Gambusinas`)

| Archivo | Cambio |
|---|---|
| `Pages/navbar/screens/PagosScreen.js` | Leer `userInfo.rol` (ya viene del login). Si `rol === 'cajero'` o `'admin'`: título del botón cambia de **"Solicitar Pago (n)"** (línea 2876) a **"Cobrar (n)"**; el modal de confirmación (línea 2105) dice "Cobrar" en vez de "Solicitar Pago", con texto "El cobro se aprueba automáticamente"; el payload incluye `cobroDirectoCaja: true` en `procesarPagoConCliente` (líneas 1597–1645) |
| `Pages/ComandaDetalleScreen.js` | El botón "Pagar" (línea 2561) funciona igual; opcional: badge "Cobro directo (caja)" cuando el rol es cajero para que el mozo-cajero sepa que no pasará por aprobación |
| `Components/.../ModalPagoExitoso.js` | Mensaje de éxito distinto para caja: "Cobro aprobado" (no "enviado a aprobación") |

#### Appcocina (tabla tickets y pagos adelantados)

| Archivo | Cambio |
|---|---|
| `src/components/pages/TicketsPpaPage.jsx` | Ocultar botones "Cobrar"/"Rechazar"/"Reportar" (líneas 709–729) si el rol del usuario logueado no es `admin | supervisor | cajero`; mostrar chip de solo-lectura en ese caso |
| `src/hooks/useTablaAprobacion.js` | Bloquear `aprobarItem`/rechazo en cliente si rol no autorizado (defensa en profundidad; el backend ya valida) |
| Login/Auth de appcocina | Confirmar que el objeto de sesión expone `rol` (usar `userRole` que ya existe en `comandastyle.jsx`) |

#### Dashboard — configuracion.html

| Archivo | Cambio |
|---|---|
| `backend-LasGambusinas/public/configuracion.html` | Nueva pestaña **"Caja"**: añadir `{ id:'caja', label:'Caja', icon:'🧾' }` al array `tabs` (líneas 1619–1632) y panel `x-show="cfgTab==='caja'"` con: (a) toggle *Cobro directo desde app de mozos (rol caja)*, (b) toggle *Aprobar automáticamente el ticket al cobrar caja*, (c) texto explicativo de que la tabla de tickets/PPA es manejada por caja/admin/supervisores. Se guarda con el `guardarConfig()` existente (línea 2185 → `PUT /configuracion`) |

### 1.3 Criterios de aceptación

1. Usuario con rol `cajero` paga en el app de mozos → el ticket se crea **ya aprobado**, no aparece pendiente en la tabla de appcocina, y cocina/mozos reciben los sockets de aprobado.
2. Usuario con rol `mozos` sigue viendo "Solicitar Pago" y su ticket queda `pendiente_aprobacion` (comportamiento actual intacto).
3. Un mozo normal que intente enviar `cobroDirectoCaja: true` → backend lo ignora/rechaza (ticket pendiente).
4. Solo `admin`, `supervisor` y `cajero` pueden aprobar/rechazar desde la tabla de tickets (UI deshabilitada + 403 del backend para otros roles).
5. La pestaña "Caja" en configuracion.html guarda y persiste sus toggles.

---

## 2. FASE 2 — Ticket de cliente en comandas "Para llevar"

### 2.1 Diseño de datos

**Nuevo en `src/database/models/comanda.model.js`:**

```javascript
// Ticket de cliente (para llevar): número secuencial diario o nombre opcional
numeroTicketCliente: { type: Number, default: null },     // secuencial diario, null si no aplica
clienteNombreParaLlevar: { type: String, default: null, trim: true }, // nombre opcional que reemplaza al código en impresión
```

**Nueva utilidad `src/utils/numeroTicketCliente.js`** (clona el patrón de `numeroComandaDia.js`):

- Colección cursor propia: `ticket_cliente_counters`.
- `siguienteNumeroTicketCliente(dia)`: `findOneAndUpdate({ _id: dia }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` → **el reset diario es automático** (la clave del cursor es el día operativo `YYYY-MM-DD` de `diaOperativoRestaurante.js`, ciclo 04:00–04:00 como el resto del sistema). Día nuevo = documento nuevo = secuencia desde 1.
- `asignarTicketClienteEnDoc(doc)`: se llama en el `pre('save')` de comanda cuando `isNew` **y** la comanda lleva platos `para_llevar` o `extra_llevar` (o `sinMesa === true`), asignando `numeroTicketCliente`.
- `backfillNumeroTicketClienteHoy()`: reparación al arranque (mismo patrón que `backfillNumeroComandaDia`).
- Gancho en `index.js`: llamar al backfill dentro de `whenConnected` (como ya se hace con los otros dos numeradores, líneas ~659–671 de `index.js`).

> Nota: el número se asigna **siempre** (aunque haya nombre), así el nombre solo *reemplaza la visualización*; si el usuario borra el nombre, queda el código.

### 2.2 App de mozos — UI en OrdenesScreen

| Archivo | Cambio |
|---|---|
| `Pages/navbar/screens/OrdenesScreen.js` | Cuando el switch **"Para llevar"** está activo (`tipoServicioModal === 'para_llevar'`, líneas 299–300), renderizar **encima del campo Observaciones** (estado línea 291): (1) etiqueta "Cliente" y (2) input opcional "Nombre del cliente (opcional)". Nuevo estado `nombreClienteParaLlevar` |
| Payload `comandaData` (líneas 1352–1372) | Añadir `clienteNombreParaLlevar: nombreClienteParaLlevar.trim() || null` al `POST /comanda` (línea 1385). El `numeroTicketCliente` lo asigna el backend |
| Preview en pantalla | Mostrar en vivo "Ticket de cliente: #N (o nombre)" — el número definitivo lo confirma el backend al crear la comanda (por carrera, el número exacto se muestra en la respuesta) |

### 2.3 KDS (appcocina) — Observaciones

Regla del usuario:
- Si solo hay **número** → se muestra en la zona de observaciones de la tabla KDS.
- Si hay **nombre** → el nombre va en observaciones (KDS) **y** en la comanda impresa.

| Archivo | Cambio |
|---|---|
| `appcocina/src/components/Principal/comandastyle.jsx` (líneas 6188–6199) y `ComandastylePerso.jsx` (líneas 5517–5528) | Junto al bloque de `observaciones`, renderizar chip: `🎟️ Cliente: {nombre}` si `clienteNombreParaLlevar`, si no `🎟️ Cliente: #N` si `numeroTicketCliente`. Solo cuando la comanda tiene platos para llevar |
| `backend/src/socket/events.js` (`emitNuevaComanda` línea 542, `emitComandaActualizada` línea 643) | Asegurar que los dos campos nuevos viajan en el payload (el populate del modelo los incluye al ser campos de comanda) |

### 2.4 Impresión — ticket de mozo (solo para llevar)

| Archivo | Cambio |
|---|---|
| `Las-Gambusinas/utils/comandaHtml.js` (`mapComandasATicket` línea 451) | Mapear `numeroTicketCliente` y `clienteNombreParaLlevar` desde la comanda |
| `Las-Gambusinas/utils/comandaHtml.js` (render, cerca de las líneas 288–305 donde hoy van cliente/DNI y observaciones) | Nueva línea en el ticket **solo si la comanda es para llevar**: `Cliente: #N` (código) o `Cliente: <nombre>` (si se llenó el nombre). En la impresión de comanda grupal, una línea por comanda que sea para llevar |
| `backend-LasGambusinas/public/js/comanda-print/comandaHtml.js` (módulo compartido del dashboard) | Mismo cambio para la impresión desde comandas.html |

---

## 3. FASE 3 — Vista Básica / Avanzada en comandas.html ("Ver comanda")

### 3.1 Diseño

- Modal `ver-comanda` (línea 819 de `public/comandas.html`): en la **parte superior** del modal, segment **TIPO DE VISTA: [ Básica ] [ Avanzada ]** (default **Básica**).
- La **Avanzada** es el contenido actual completo (info general, reserva, tickets generados, timeline) → se envuelve en `x-show="vistaComanda==='avanzada'"`.
- La **Básica** es nueva, con solo:

```
┌─────────────────────────────────────────────┐
│  Comanda #N          [Básica | Avanzada]    │
│  Mozo: <nombre>   ·   Enviada: <fecha/hora> │
│  ─────────────────────────────────────────  │
│  Plato            Precio   Cant   Total     │
│  Pollo a la brasa  55.00     1      55.00   │
│  ...            (estado: 🟡 recoger)        │
│  ─────────────────────────────────────────  │
│  TOTAL                          S/ 177.00   │
└─────────────────────────────────────────────┘
```

- **Adaptación grupal**: cuando el modal se abre sobre un grupo de comandas (lo que hoy pasa vía tickets con varias comandas), la Básica repite el bloque por comanda (número + mozo + platos + subtotal) y muestra un **TOTAL GENERAL** al final.
- Estados de plato como chips de color ya usados en el dashboard (pedido/recoger/salio/entregado/pagado).
- Platos `eliminado/anulado` se ocultan (igual que en el KDS).
- El total respeta descuentos ya aplicados (`totalCalculado` / lógica `resolverBrutoYNeto` si el modal consume tickets).
- Persistir la elección en `localStorage` (`comandas_vistaComanda`) para que cada usuario conserve su preferencia; **default siempre Básica** la primera vez.

### 3.2 Cambios concretos

| Archivo | Cambio |
|---|---|
| `public/comandas.html` | (a) Estado Alpine `vistaComanda: 'basica'`; (b) header con toggle; (c) envolver contenido actual en bloque avanzada; (d) nuevo bloque básico reutilizando `selectedComanda` (y `comandaTickets` si hay grupo); (e) helper `platosVisiblesBasicos(comanda)` que filtre `eliminado/anulado` y calculo `precio × cantidad`; (f) fecha de envío = `tiempoEnEspera || createdAt` (formateado `dd/mm HH:mm`) |

---

## 4. FASE 4 — Pruebas y verificación

### Backend (jest)

1. `tests/numeroTicketCliente.test.js` (nuevo): secuencia desde 1, reinicio al cambiar de día, solo para comandas para llevar, backfill.
2. `tests/boucherCobroDirecto.test.js` (nuevo): con rol `cajero` → ticket `aprobado` + efectos de aprobación; con rol `mozos` → ticket `pendiente_aprobacion` aunque el body pida cobro directo; con config apagada → siempre pendiente.
3. `tests/aprobacionRoles.test.js` (nuevo): `PUT /aprobacion/:id/aprobar` responde 403 para rol `mozos`.
4. Ejecutar y NO romper: `npx jest tests/saldoPendienteComanda.test.js tests/numero-comanda-dia.test.js` (los suites verdes actuales).

### Manual (checklist de cierre)

- [ ] Login mozos como cajero → cobrar → ticket aparece aprobado en tabla de appcocina sin intervención.
- [ ] Login mozos como mozo normal → flujo "Solicitar Pago" idéntico al actual.
- [ ] Configuración → pestaña Caja → toggles guardan y afectan el comportamiento.
- [ ] Comanda para llevar sin nombre → KDS muestra "🎟️ Cliente: #1"; nuevo día → el contador vuelve a 1.
- [ ] Comanda para llevar con nombre "Juan" → KDS muestra "🎟️ Cliente: Juan" y el ticket impreso dice `Cliente: Juan`.
- [ ] Impresión de comanda de mozo: la línea de cliente sale **solo** en comandas para llevar.
- [ ] comandas.html → Ver comanda → abre en Básica por defecto; toggle a Avanzada muestra todo lo actual; funciona con grupos de comandas.

---

## 5. Orden de implementación sugerido

| Orden | Trabajo | Depende de |
|---|---|---|
| 1 | Backend: modelo comanda + util `numeroTicketCliente` + asignación/backfill (Fase 2.1) | — |
| 2 | Backend: config `caja` + middleware JWT + cobro directo + roles en aprobación (Fase 1 backend) | — |
| 3 | App mozos: campos cliente en OrdenesScreen + textos de "Cobrar" (Fases 1 y 2) | 1, 2 |
| 4 | appcocina: chips de cliente en KDS + gating de la tabla por rol (Fases 1 y 2) | 1, 2 |
| 5 | configuracion.html: pestaña Caja (Fase 1) | 2 |
| 6 | Impresión mozo + dashboard comanda-print (Fase 2.4) | 1 |
| 7 | comandas.html Vista Básica/Avanzada (Fase 3) | — |
| 8 | Pruebas jest + verificación manual (Fase 4) | todo |

## 6. Riesgos y consideraciones

- **Compatibilidad hacia atrás**: comandas viejas sin `numeroTicketCliente` → `null`, el KDS simplemente no muestra el chip.
- **Carreras de numeración**: usar `findOneAndUpdate` atómico (patrón ya probado en `numeroComandaDia.js`), nunca `find + save`.
- **No duplicar aprobación**: el cobro directo de caja debe ejecutar la aprobación **una sola vez** (idempotencia de `claimTicketForApproval` ya existe, línea 71 — reutilizarla).
- **Roles en appcocina**: verificar que la sesión de appcocina realmente expone el rol; si no, extender el login de cocina para incluirlo.
- **Día operativo**: el reinicio diario del ticket de cliente usa el mismo día operativo 04:00 del restaurante, coherente con comandas y cierres de caja.
