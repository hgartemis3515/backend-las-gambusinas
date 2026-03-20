# Implementación Backend v7.1 - Sistema Multi-Cocinero

**Fecha:** Marzo 2026  
**Versión:** 7.1

---

## Resumen de Cambios en Backend

Este documento resume las implementaciones realizadas en el backend para soportar el sistema multi-cocinero y la configuración KDS v7.1.

---

## 1. Middleware de Autenticación JWT para Socket.io

### Archivo Creado
`src/middleware/socketAuth.js`

### Funcionalidades Implementadas

#### Autenticación por Namespace

| Namespace | Middleware | Roles Permitidos |
|-----------|------------|------------------|
| `/cocina` | `authenticateCocina` | cocinero, admin, supervisor |
| `/mozos` | `authenticateMozos` | mozos, admin, supervisor |
| `/admin` | `authenticateAdmin` | admin, supervisor |

#### Características de Seguridad

1. **Validación JWT**: Verifica firma y expiración del token
2. **Múltiples fuentes de token**:
   - `auth.token` (recomendado)
   - `handshake.headers.authorization` (Bearer token)
3. **Verificación de roles**: Solo roles permitidos pueden conectarse
4. **Advertencia de expiración**: Notifica cuando el token está próximo a expirar
5. **Rate limiting**: Previene spam de eventos (configurable)

#### Información Adjuntada al Socket

```javascript
socket.user = {
  id: payload.id,
  name: payload.name,
  rol: payload.rol,
  permisos: payload.permisos || [],
  aliasCocinero: payload.aliasCocinero
};
```

---

## 2. Rooms por Zona en Socket.io

### Eventos Implementados

| Evento | Descripción | Parámetros |
|--------|-------------|------------|
| `join-zona` | Unirse a room de zona específica | `zonaId` |
| `leave-zona` | Salir de room de zona | `zonaId` |
| `join-mis-zonas` | Unirse a todas las zonas asignadas | (ninguno) |
| `joined-zona` | Confirmación de join | `{ zonaId, roomName }` |
| `joined-mis-zonas` | Confirmación de mis zonas | `{ zonas, todas }` |
| `zona-error` | Error de acceso a zona | `{ zonaId, error }` |

### Validación de Acceso

- **Admin/Supervisor**: Pueden unirse a cualquier zona
- **Cocinero**: Solo puede unirse a zonas que tiene asignadas
- **Validación en tiempo real**: Se consulta la BD al momento del join

### Ejemplo de Uso (Frontend)

```javascript
// Unirse a una zona específica
socket.emit('join-zona', 'zona-parrilla-id');

// Unirse a todas las zonas asignadas automáticamente
socket.emit('join-mis-zonas');

// Escuchar confirmación
socket.on('joined-zona', (data) => {
  console.log('Unido a zona:', data.zonaId);
});
```

---

## 3. Nuevos Eventos Socket.io

### Eventos de Zona

```javascript
// Emitir nueva comanda a zona específica
global.emitNuevaComandaToZona(zonaId, comanda);
```

### Eventos de Conflicto

```javascript
// Emitir cuando hay conflicto de procesamiento
global.emitConflictoProcesamiento(
  comandaId, 
  platoId, 
  cocineroActual, 
  cocineroIntentando
);
```

### Eventos de Liberación Automática

```javascript
// Emitir cuando un cocinero se desconecta
global.emitLiberacionAutomatica(cocineroId, platosLiberados);
```

### Helper para Zonas

```javascript
// Obtener zonas de un cocinero
const zonas = await global.getZonasCocinero(cocineroId);
```

---

## 4. Endpoints de Procesamiento (Ya Implementados)

### Controlador
`src/controllers/procesamientoController.js`

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `PUT` | `/api/comanda/:id/plato/:platoId/procesando` | Cocinero toma un plato |
| `DELETE` | `/api/comanda/:id/plato/:platoId/procesando` | Cocinero libera un plato |
| `PUT` | `/api/comanda/:id/plato/:platoId/finalizar` | Cocinero finaliza un plato |
| `PUT` | `/api/comanda/:id/procesando` | Cocinero toma toda la comanda |
| `DELETE` | `/api/comanda/:id/procesando` | Cocinero libera la comanda |

### Códigos de Respuesta

| Código | Significado |
|--------|-------------|
| `200` | Operación exitosa |
| `400` | Parámetros faltantes |
| `403` | Sin permisos |
| `404` | Recurso no encontrado |
| `409` | Conflicto (ya procesado por otro) |
| `500` | Error del servidor |

---

## 5. Endpoints de Configuración de Cocineros

### Controlador
`src/controllers/cocinerosController.js`

### Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/cocineros` | Listar cocineros |
| `GET` | `/api/cocineros/:id` | Obtener cocinero por ID |
| `GET` | `/api/cocineros/:id/config` | Obtener configuración KDS |
| `PUT` | `/api/cocineros/:id/config` | Actualizar configuración KDS |
| `GET` | `/api/cocineros/:id/zonas` | Obtener zonas asignadas |
| `PUT` | `/api/cocineros/:id/zonas` | Asignar zonas |
| `GET` | `/api/cocineros/:id/metricas` | Métricas de rendimiento |
| `POST` | `/api/cocineros/:id/asignar-rol` | Asignar rol de cocinero |
| `POST` | `/api/cocineros/:id/quitar-rol` | Quitar rol de cocinero |

---

## 6. Eventos Socket.js Emitidos

### Namespace /cocina

| Evento | Cuándo se Emite | Datos |
|--------|-----------------|-------|
| `nueva-comanda` | Nueva comanda creada | `{ comanda, timestamp }` |
| `comanda-actualizada` | Estado de comanda cambió | `{ comandaId, comanda, timestamp }` |
| `plato-actualizado` | Estado de plato cambió | `{ comandaId, platoId, nuevoEstado }` |
| `plato-procesando` | Cocinero toma plato | `{ comandaId, platoId, cocinero }` |
| `plato-liberado` | Cocinero libera plato | `{ comandaId, platoId, cocineroId }` |
| `comanda-procesando` | Cocinero toma comanda | `{ comandaId, cocinero }` |
| `comanda-liberada` | Cocinero libera comanda | `{ comandaId, cocineroId }` |
| `config-cocinero-actualizada` | Config KDS actualizada | `{ cocineroId, cambios }` |
| `conflicto-procesamiento` | Conflicto al tomar plato | `{ comandaId, platoId, procesadoPor }` |
| `liberacion-automatica` | Desconexión de cocinero | `{ cocineroId, platosLiberados }` |
| `nueva-comanda-zona` | Nueva comanda en zona | `{ comanda, zonaId }` |
| `token-expiring-soon` | Token próximo a expirar | `{ message }` |

---

## 7. Modelo de Datos Extendido

### Plato en Comanda

```javascript
{
  platoId: String,
  plato: { type: Schema.Types.ObjectId, ref: 'platos' },
  estado: String, // 'pedido', 'en_espera', 'recoger', 'entregado'
  cantidad: Number,
  
  // Campos multi-cocinero v7.1
  procesandoPor: {
    cocineroId: { type: Schema.Types.ObjectId, ref: 'mozos' },
    nombre: String,
    alias: String,
    timestamp: Date
  },
  procesadoPor: {
    cocineroId: { type: Schema.Types.ObjectId, ref: 'mozos' },
    nombre: String,
    alias: String,
    timestamp: Date
  }
}
```

### Comanda

```javascript
{
  // ... campos existentes ...
  
  // Multi-cocinero v7.1
  procesandoPor: {
    cocineroId: { type: Schema.Types.ObjectId, ref: 'mozos' },
    nombre: String,
    alias: String,
    timestamp: Date
  },
  zonaAsignada: { type: Schema.Types.ObjectId, ref: 'zonas' }
}
```

---

## 8. Configuración Requerida

### Variables de Entorno

```env
JWT_SECRET=las-gambusinas-secret-key-2024
JWT_EXPIRES_IN=8h
```

### Inicialización en Server.js

```javascript
const socketAuth = require('./middleware/socketAuth');

// Aplicar middleware de autenticación
cocinaNamespace.use(socketAuth.authenticateCocina);
mozosNamespace.use(socketAuth.authenticateMozos);
adminNamespace.use(socketAuth.authenticateAdmin);
```

---

## 9. Pendientes para Futuras Versiones

### Alta Prioridad
- [ ] Tests unitarios para `socketAuth.js`
- [ ] Tests de integración para eventos Socket.io
- [ ] Monitoreo de conexiones activas por zona

### Media Prioridad
- [ ] Limite de reconexiones por room para evitar memory leaks
- [ ] Log detallado de eventos para debugging
- [ ] Métricas de latencia de eventos

### Baja Prioridad
- [ ] Soporte para múltiples dispositivos por cocinero
- [ ] Sincronización offline/online con cola de eventos
- [ ] Notificaciones push para eventos críticos

---

## 10. Troubleshooting

### Error: "Autenticación requerida"
- Verificar que el token JWT se envía en `auth.token` o header `Authorization`
- Verificar que el token no ha expirado

### Error: "No tiene permisos para acceder a la cocina"
- Verificar que el usuario tiene rol `cocinero`, `admin` o `supervisor`
- Verificar permisos en la colección `mozos`

### Error: "No tiene acceso a esta zona"
- Verificar que la zona está en `zonaIds` del cocinero
- Los admin/supervisor tienen acceso a todas las zonas

### Socket no recibe eventos de zona
- Verificar que se ejecutó `join-zona` o `join-mis-zonas`
- Verificar que la zona está activa (`activo !== false`)

---

**Documento actualizado:** Marzo 2026  
**Versión:** 7.1
