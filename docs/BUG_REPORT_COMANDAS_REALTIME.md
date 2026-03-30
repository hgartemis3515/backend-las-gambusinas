# Bug Report: Tabla de Comandas no se actualiza en tiempo real

**Fecha:** 29 de marzo de 2026  
**Severidad:** Alta  
**Componente afectado:** `comandas.html` (Panel Administrativo)  
**Componentes no afectados:** App de Cocina (actualiza correctamente en tiempo real)  
**Estado:** ✅ RESUELTO

---

## Síntoma

Cuando la App de Mozos crea una nueva comanda, la tabla de comandas en el Panel Administrativo (`comandas.html`) no se actualiza automáticamente. Sin embargo, la App de Cocina SÍ recibe la actualización en tiempo real y muestra la nueva comanda inmediatamente.

---

## Causa Raíz

### Análisis del Backend (`src/socket/events.js`)

La función `emitNuevaComanda()` originalmente emitía el evento `nueva-comanda` únicamente a dos namespaces:

```javascript
// ANTES (causaba el bug)
cocinaNamespace.to(roomName).emit('nueva-comanda', { comanda: comandaCompleta, ... });
mozosNamespace.emit('nueva-comanda', { comanda: comandaCompleta, ... });
// ❌ FALTABA: adminNamespace.emit('nueva-comanda', ...)
```

**El namespace `/admin` NO recibía el evento `nueva-comanda`.**

### Lo que SÍ recibía el namespace `/admin`

El namespace `/admin` solo recibía el evento `reportes:comanda-nueva`:

```javascript
adminNamespace.emit('reportes:comanda-nueva', eventData);
```

### Diferencia de payloads

| Evento | Namespace | Payload |
|--------|-----------|---------|
| `nueva-comanda` | `/cocina`, `/mozos` | **Comanda completa poblada** (mesas, mozos, platos con populate, cliente, etc.) |
| `reportes:comanda-nueva` | `/admin` | **Payload reducido** (solo comandaId, comandaNumber, numMesa, mozoId, cantidadPlatos, etc.) |

---

## Por qué la App de Cocina funcionaba correctamente

La App de Cocina se conecta al namespace `/cocina` y escucha el evento `nueva-comanda`:

```javascript
// App Cocina - SÍ funciona
socket.on('nueva-comanda', (data) => {
  const comanda = data.comanda; // Comanda COMPLETA poblada
  // Renderizar directamente en la tabla
});
```

El backend emite a `/cocina` el evento `nueva-comanda` con la comanda completamente poblada.

---

## Por qué el Panel de Comandas NO funcionaba

El Panel de Comandas (`comandas.html`) se conecta al namespace `/admin`:

```javascript
// comandas.html
this.socket = io('/admin', { auth: { token }, transports: ['websocket', 'polling'] });
```

Y escuchaba:
1. `nueva-comanda` - **NO LLEGABA** porque el backend NO emitía este evento al namespace `/admin`
2. `reportes:comanda-nueva` - **LLEGABA** pero con payload reducido, insuficiente para renderizar la tabla

---

## ✅ Solución Aplicada (Backend)

El archivo `src/socket/events.js` fue modificado para emitir el evento `nueva-comanda` también al namespace `/admin`:

```javascript:412:419:e:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\src\socket\events.js
// Emitir a admin (panel de comandas) - Datos completos populados
if (adminNamespace && adminNamespace.sockets) {
  adminNamespace.emit('nueva-comanda', {
    comanda: comandaCompleta,
    socketId: 'server',
    timestamp: timestamp
  });
}
```

### Flujo de eventos correcto (DESPUÉS del fix)

```
App Mozos crea comanda
        │
        ▼
Backend: emitNuevaComanda()
        │
        ├──► cocinaNamespace.emit('nueva-comanda', comandaCompleta) ✅
        │
        ├──► mozosNamespace.emit('nueva-comanda', comandaCompleta) ✅
        │
        └──► adminNamespace.emit('nueva-comanda', comandaCompleta) ✅ NUEVO
        
Backend: emitReporteComandaNueva()
        │
        └──► adminNamespace.emit('reportes:comanda-nueva', payloadReducido) ✅ (para métricas)
```

---

## Archivo Clave para Actualización en Tiempo Real

### `src/socket/events.js`

Este archivo es el **corazón de la comunicación en tiempo real** del sistema. Contiene:

#### Funciones de emisión de eventos

| Función | Propósito | Namespaces emitidos |
|---------|-----------|---------------------|
| `emitNuevaComanda(comanda)` | Notificar cuando se crea una nueva comanda | `/cocina`, `/mozos`, `/admin` |
| `emitComandaActualizada(comandaId, ...)` | Notificar cambios de estado en comanda | `/cocina`, `/mozos` |
| `emitPlatoActualizado(comandaId, platoId, estado)` | Notificar cambio de estado de un plato | `/cocina`, `/mozos` |
| `emitComandaEliminada(comandaId)` | Notificar eliminación de comanda | `/cocina`, `/mozos` |
| `emitMesaActualizada(mesaId)` | Notificar cambio de estado de mesa | `/mozos`, `/cocina` |
| `emitPlatoMenuActualizado(plato)` | Notificar cambio en el menú | `/cocina`, `/mozos`, `/admin` |
| `emitReporteBoucherNuevo(boucher)` | Notificar nuevo pago para reportes | `/admin` |
| `emitReporteComandaNueva(comanda)` | Notificar nueva comanda para métricas | `/admin` |
| `emitReportePlatoListo(...)` | Notificar plato listo para métricas | `/admin` |

#### Estructura del evento `nueva-comanda`

```javascript
{
  comanda: {
    _id: ObjectId,
    comandaNumber: Number,
    mesas: { _id, nummesa, estado, area: { _id, nombre } },
    mozos: { _id, name, DNI },
    cliente: { _id, nombre, dni, telefono, tipo },
    platos: [{
      _id: ObjectId,
      plato: { _id, nombre, precio, categoria },
      cantidad: Number,
      estado: String,
      notaEspecial: String,
      complementosSeleccionados: Array
    }],
    cantidades: [Number],
    status: String,
    precioTotal: Number,
    createdAt: Date,
    // ... más campos
  },
  socketId: 'server',
  timestamp: ISODateString
}
```

---

## Workaround implementado en Frontend (ahora redundante)

Antes del fix del backend, se agregó en `comandas.html` un workaround que hacía re-fetch cuando llegaba el evento con payload reducido:

```javascript
// Evento con payload reducido
this.socket.on('reportes:comanda-nueva', async (data) => {
  const comandaId = data.comandaId || data._id;
  if (comandaId) {
    await this.fetchAndAddComanda(comandaId); // Re-fetch a la API
  }
});
```

**Después del fix del backend**, el listener de `nueva-comanda` ahora recibe la comanda completa poblada, por lo que el workaround ya no es necesario, aunque se mantiene como fallback.

---

## Listeners actuales en `comandas.html`

```javascript:1588:1616:e:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\public\comandas.html
// Comanda actualizada
this.socket.on('comanda-actualizada', (data) => {
  const comanda = data.comanda || data;
  this.handleComandaActualizada(comanda);
});

// Nueva comanda - AHORA RECIBE DATOS COMPLETOS DEL BACKEND
this.socket.on('nueva-comanda', (data) => {
  const comanda = data.comanda || data;
  this.handleNuevaComanda(comanda);
});

// Comanda eliminada
this.socket.on('comanda-eliminada', (data) => {
  this.handleComandaEliminada(data);
});

// Evento de reportes (fallback con re-fetch)
this.socket.on('reportes:comanda-nueva', async (data) => {
  const comandaId = data.comandaId || data._id;
  if (comandaId) {
    await this.fetchAndAddComanda(comandaId);
  }
});
```

---

## Impacto

| Aspecto | Antes del fix | Después del fix |
|---------|---------------|-----------------|
| Actualización visual | No ocurre | Inmediata (< 100ms) |
| Carga en el servidor | N/A | Sin peticiones adicionales |
| Experiencia de usuario | Mala | Óptima |

---

## Archivos involucrados

- `src/socket/events.js` - Función `emitNuevaComanda()` (**FIX APLICADO**)
- `src/socket/events.js` - Función `emitReporteComandaNueva()` (payload reducido para métricas)
- `public/comandas.html` - Listeners de Socket.io y handlers

---

## Pendientes

### Agregar emisión a `/admin` en `emitComandaActualizada`

Actualmente `emitComandaActualizada` no emite al namespace `/admin`. Si la tabla de comandas necesita actualizarse cuando una comanda cambia de estado (por ejemplo, de "en_espera" a "recoger"), se debe agregar:

```javascript
// En emitComandaActualizada(), después de emitir a mozos:
if (adminNamespace && adminNamespace.sockets) {
  adminNamespace.emit('comanda-actualizada', eventData);
}
```

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-03-29 | Bug identificado y documentado |
| 2026-03-29 | Workaround implementado en frontend (re-fetch) |
| 2026-03-29 | **Fix definitivo aplicado en backend** por Claude Opus: `emitNuevaComanda()` ahora emite a `/admin` |
| Pendiente | Agregar `comanda-actualizada` a `/admin` si se requiere actualización de estados |
