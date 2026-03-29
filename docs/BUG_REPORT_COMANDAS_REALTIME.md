# Bug Report: Tabla de Comandas no se actualiza en tiempo real

**Fecha:** 29 de marzo de 2026  
**Severidad:** Alta  
**Componente afectado:** `comandas.html` (Panel Administrativo)  
**Componentes no afectados:** App de Cocina (actualiza correctamente en tiempo real)

---

## Síntoma

Cuando la App de Mozos crea una nueva comanda, la tabla de comandas en el Panel Administrativo (`comandas.html`) no se actualiza automáticamente. Sin embargo, la App de Cocina SÍ recibe la actualización en tiempo real y muestra la nueva comanda inmediatamente.

---

## Causa Raíz

### Análisis del Backend (`src/socket/events.js`)

La función `emitNuevaComanda()` emite el evento `nueva-comanda` únicamente a dos namespaces:

```javascript:396:410:e:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\src\socket\events.js
// Emitir a cocina (room por fecha)
cocinaNamespace.to(roomName).emit('nueva-comanda', {
  comanda: comandaCompleta,
  socketId: 'server',
  timestamp: timestamp
});

// Emitir a mozos (todos los mozos conectados) - Datos completos populados
if (mozosNamespace && mozosNamespace.sockets) {
  mozosNamespace.emit('nueva-comanda', {
    comanda: comandaCompleta,
    socketId: 'server',
    timestamp: timestamp
  });
}
```

**El namespace `/admin` NUNCA recibe el evento `nueva-comanda`.**

### Lo que SÍ recibe el namespace `/admin`

El namespace `/admin` solo recibe el evento `reportes:comanda-nueva`:

```javascript:1237:e:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\src\socket\events.js
adminNamespace.emit('reportes:comanda-nueva', eventData);
```

### Diferencia de payloads

| Evento | Namespace | Payload |
|--------|-----------|---------|
| `nueva-comanda` | `/cocina`, `/mozos` | **Comanda completa poblada** (mesas, mozos, platos con populate, cliente, etc.) |
| `reportes:comanda-nueva` | `/admin` | **Payload reducido** (solo comandaId, comandaNumber, numMesa, mozoId, cantidadPlatos, etc.) |

### Ejemplo del payload que llega al Panel Admin

```javascript
{
  comandaId: '69c8d345d640b4fb1f0083a5',
  comandaNumber: 507,
  fecha: '2026-03-29',
  fechaCreacion: '2026-03-29T07:22:45.315Z',
  numMesa: 13,
  mozoId: '69a51896782a5785d39b1232',
  nombreMozo: 'Juan',
  cantidadPlatos: 2,
  platos: [{ nombre: '...', cantidad: 1, estado: 'pedido' }],
  timestamp: '2026-03-29T07:22:45.581Z'
}
```

Este payload NO contiene:
- `mesas` poblado con `{ nummesa, area, nombreCombinado }`
- `platos[].plato` poblado con `{ nombre, precio, categoria }`
- `mozos` poblado con `{ name, DNI }`
- `cliente` poblado

---

## Por qué la App de Cocina funciona correctamente

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

## Por qué el Panel de Comandas NO funciona

El Panel de Comandas (`comandas.html`) se conecta al namespace `/admin`:

```javascript
// comandas.html
this.socket = io('/admin', { auth: { token }, transports: ['websocket', 'polling'] });
```

Y escucha dos eventos:

1. `nueva-comanda` - **NUNCA LLEGA** porque el backend NO emite este evento al namespace `/admin`
2. `reportes:comanda-nueva` - **LLEGA** pero con payload reducido

---

## Flujo de eventos incorrecto

```
App Mozos crea comanda
        │
        ▼
Backend: emitNuevaComanda()
        │
        ├──► cocinaNamespace.emit('nueva-comanda', comandaCompleta) ✅ Funciona
        │
        ├──► mozosNamespace.emit('nueva-comanda', comandaCompleta) ✅ Funciona
        │
        └──► adminNamespace.emit('reportes:comanda-nueva', payloadReducido) ❌ Payload incompleto
        
        FALTA: adminNamespace.emit('nueva-comanda', comandaCompleta)
```

---

## Solución implementada en el frontend

Como workaround temporal, se modificó `comandas.html` para:

1. Detectar cuando el payload de `reportes:comanda-nueva` es incompleto
2. Hacer un re-fetch a `GET /api/comanda/:id` para obtener la comanda completa
3. Insertar la comanda en la tabla con Alpine.js reactivity

```javascript
// Evento con payload reducido
this.socket.on('reportes:comanda-nueva', async (data) => {
  const comandaId = data.comandaId || data._id;
  if (comandaId) {
    await this.fetchAndAddComanda(comandaId); // Re-fetch a la API
  }
});

// Función que obtiene comanda completa
async fetchAndAddComanda(comandaId) {
  const comanda = await apiGet(`/comanda/${comandaId}`);
  if (comanda && !comanda.error && comanda._id) {
    // Agregar a la tabla con reactividad forzada
    this.comandas = [normalizada, ...this.comandas];
    this.processGrouping();
    this.filterComandas();
  }
}
```

---

## Solución recomendada (Backend)

La solución correcta y definitiva es modificar `emitNuevaComanda()` en el backend para emitir también al namespace `/admin`:

```javascript
// En src/socket/events.js, dentro de emitNuevaComanda()

// Agregar después de emitir a mozos:
if (adminNamespace && adminNamespace.sockets) {
  adminNamespace.emit('nueva-comanda', {
    comanda: comandaCompleta,
    socketId: 'server',
    timestamp: timestamp
  });
}
```

Esto eliminaría la necesidad del re-fetch en el frontend y haría que el sistema sea verdaderamente en tiempo real.

---

## Impacto

| Aspecto | Antes del fix | Después del fix frontend |
|---------|---------------|-------------------------|
| Actualización visual | No ocurre | Ocurre con ~200-500ms de delay (re-fetch) |
| Carga en el servidor | N/A | 1 petición HTTP adicional por comanda |
| Experiencia de usuario | Mala | Aceptable, pero no óptima |

---

## Archivos involucrados

- `src/socket/events.js` - Función `emitNuevaComanda()` (causa raíz)
- `src/socket/events.js` - Función `emitReporteComandaNueva()` (payload reducido)
- `public/comandas.html` - Listeners de Socket.io y handlers (workaround)

---

## Lecciones aprendidas

1. **Consistencia de eventos:** Todos los namespaces relevantes deben recibir los mismos eventos con el mismo payload cuando se trata de actualizaciones de entidades principales.

2. **Separación de propósitos:** El evento `reportes:comanda-nueva` está diseñado para actualización de métricas/reportes, no para actualización de la tabla de comandas. Debería existir un evento `nueva-comanda` separado para la tabla.

3. **Testing cross-namespace:** Verificar que todos los clientes conectados a diferentes namespaces reciban las actualizaciones que necesitan.

---

## Historial

| Fecha | Cambio |
|-------|--------|
| 2026-03-29 | Bug identificado y documentado |
| 2026-03-29 | Workaround implementado en frontend (re-fetch) |
| Pendiente | Fix definitivo en backend (emitir `nueva-comanda` a `/admin`) |
