# 🚀 Optimizaciones de Flujo de Datos - Las Gambusinas

**Fecha:** Enero 2025  
**Versión:** 2.1

---

## 📋 Resumen de Optimizaciones

Este documento describe todas las optimizaciones implementadas para mejorar el flujo de datos y eliminar errores de sincronización en el sistema POS restaurante.

---

## ✅ 1. Timestamps Automáticos en Repository

### Cambios Realizados

- **Actualizado:** `cambiarStatusComanda()` ahora actualiza timestamps **siempre** al cambiar de estado
- **Mejorado:** Los timestamps se establecen automáticamente sin verificar si ya existen

### Comportamiento

```javascript
// Antes: Solo establecía timestamp si no existía
if (nuevoStatus === 'en_espera' && !comandaActual.tiempoEnEspera) {
  updateData.tiempoEnEspera = timestamp;
}

// Ahora: Siempre actualiza al cambiar de estado
if (nuevoStatus === 'en_espera') {
  updateData.tiempoEnEspera = timestampActual;
}
```

### Timestamps Actualizados

- `tiempoEnEspera` → cuando status = 'en_espera'
- `tiempoRecoger` → cuando status = 'recoger'
- `tiempoEntregado` → cuando status = 'entregado'
- `tiempoPagado` → cuando status = 'pagado'

---

## ✅ 2. Simplificación de recalcularEstadoMesa

### Cambios Realizados

- **Simplificado:** Lógica de prioridad clara y documentada
- **Mejorado:** Logging estructurado con Winston
- **Optimizado:** Menos código, más legible

### Prioridad Simplificada

```
en_espera > recoger > entregado > pagado
```

### Lógica

1. Si hay comandas `en_espera` → mesa = `pedido`
2. Si hay comandas `recoger` → mesa = `preparado`
3. Si hay comandas `entregado` → mesa = `preparado`
4. Si no hay comandas activas → mesa = `libre`

### Código

```javascript
// Prioridad clara y simple
if (comandasEnEspera.length > 0) {
  nuevoEstadoMesa = 'pedido';
} else if (comandasRecoger.length > 0) {
  nuevoEstadoMesa = 'preparado';
} else if (comandasEntregadas.length > 0) {
  nuevoEstadoMesa = 'preparado';
} else {
  nuevoEstadoMesa = 'libre';
}
```

---

## ✅ 3. Estandarización de Soft-Delete

### Cambios Realizados

- **Eliminado:** Campo `eliminada` del modelo (duplicado)
- **Estandarizado:** Solo usar `IsActive: false` para soft-delete
- **Actualizado:** Todas las queries usan `IsActive` en lugar de `eliminada`

### Modelo Actualizado

```javascript
// ANTES: Dos campos para soft-delete
eliminada: Boolean,
IsActive: Boolean

// AHORA: Solo IsActive
IsActive: {
  type: Boolean,
  default: true
}
```

### Queries Actualizadas

```javascript
// Antes
const query = { eliminada: { $ne: true } };

// Ahora
const query = { IsActive: { $ne: false } };
```

### Campos Mantenidos (para auditoría)

- `fechaEliminacion` - Fecha de eliminación
- `motivoEliminacion` - Motivo de eliminación
- `eliminadaPor` - Usuario que eliminó

---

## ✅ 4. Eventos Socket.io Mejorados

### Cambios Realizados

- **Mejorado:** Todos los eventos emiten datos completos populados
- **Agregado:** Logging estructurado con Winston
- **Mejorado:** Manejo de errores en eventos

### Eventos Actualizados

Todos los eventos ahora incluyen:

```javascript
{
  comanda: comandaCompleta, // Con populate completo
  mesa: mesaActualizada,    // Con populate de área
  mozo: mozoCompleto,       // Con todos los datos
  platos: platosPopulados,  // Con nombres y precios
  timestamp: ISOString,
  socketId: 'server'
}
```

### Eventos Mejorados

- ✅ `nueva-comanda` - Datos completos populados
- ✅ `comanda-actualizada` - Datos completos populados
- ✅ `plato-actualizado` - Datos completos populados
- ✅ `mesa-actualizada` - Datos completos populados
- ✅ `comanda-revertida` - Datos completos populados

### Logging

```javascript
// Antes
console.log('Evento emitido');

// Ahora
logger.info('Evento emitido', {
  comandaNumber: comanda.comandaNumber,
  roomName,
  timestamp
});
```

---

## ✅ 5. Cálculo de precioTotal en Backend

### Cambios Realizados

- **Agregado:** Campo `precioTotal` al modelo
- **Implementado:** Cálculo automático en pre-save hook
- **Mejorado:** Backend como fuente única de verdad

### Modelo Actualizado

```javascript
precioTotal: {
  type: Number,
  default: 0,
  index: true
}
```

### Cálculo Automático

```javascript
// Pre-save hook calcula automáticamente
comandaSchema.pre('save', async function (next) {
  if (this.platos && this.platos.length > 0) {
    let precioTotal = 0;
    for (let i = 0; i < this.platos.length; i++) {
      const plato = await platoModel.findById(this.platos[i].plato);
      const cantidad = this.cantidades[i] || 1;
      precioTotal += plato.precio * cantidad;
    }
    this.precioTotal = precioTotal;
  }
  next();
});
```

### Ventajas

- ✅ Backend calcula siempre el precio correcto
- ✅ Frontend solo muestra, no calcula
- ✅ Evita discrepancias entre frontend y backend
- ✅ PrecioTotal siempre actualizado

---

## ✅ 6. Reconexión WebSocket Robusta

### Cambios Realizados

- **Creado:** `src/utils/socketReconnect.js` - Manager de reconexión
- **Implementado:** Backoff exponencial
- **Agregado:** Manejo de errores mejorado

### Características

- **Backoff Exponencial:** Delay aumenta exponencialmente
- **Límite de Intentos:** Configurable (default: infinito)
- **Delay Máximo:** 30 segundos (configurable)
- **Reconexión Automática:** Después de desconexión

### Uso en Frontend

```javascript
const SocketReconnectManager = require('./utils/socketReconnect');

const socket = io('http://localhost:3000/cocina');
const reconnectManager = new SocketReconnectManager(socket, {
  maxReconnectAttempts: 10,
  initialDelay: 1000,
  maxDelay: 30000
});

reconnectManager.onConnect = () => {
  console.log('Conectado y listo');
};
```

### Configuración

```javascript
{
  maxReconnectAttempts: 10,  // Máximo de intentos
  initialDelay: 1000,        // Delay inicial (1 segundo)
  maxDelay: 30000            // Delay máximo (30 segundos)
}
```

---

## ✅ 7. Tests Unitarios Básicos

### Cambios Realizados

- **Instalado:** Jest y Supertest
- **Creado:** `tests/comanda.repository.test.js`
- **Configurado:** Jest en package.json

### Tests Implementados

```javascript
describe('validarTransicionEstado', () => {
  test('debe permitir en_espera -> recoger', () => {
    expect(validarTransicionEstado('en_espera', 'recoger')).toBe(true);
  });
  
  test('debe rechazar pagado -> recoger', () => {
    expect(validarTransicionEstado('pagado', 'recoger')).toBe(false);
  });
});
```

### Ejecutar Tests

```bash
npm test              # Ejecutar todos los tests
npm run test:watch    # Modo watch
```

---

## 📝 Archivos Modificados

### Nuevos Archivos

- ✅ `src/utils/socketReconnect.js` - Manager de reconexión WebSocket
- ✅ `tests/comanda.repository.test.js` - Tests unitarios
- ✅ `OPTIMIZACIONES_FLUJO_DATOS.md` - Este documento

### Archivos Modificados

- ✅ `src/database/models/comanda.model.js` - Campo precioTotal, eliminado eliminada
- ✅ `src/repository/comanda.repository.js` - Timestamps, soft-delete, recalcularEstadoMesa
- ✅ `src/socket/events.js` - Logging estructurado, datos completos
- ✅ `package.json` - Scripts de test, Jest config

---

## 🔄 Flujos Optimizados

### Flujo 1: Crear Comanda

1. Mozo crea comanda (POST `/api/comanda`)
2. Backend calcula `precioTotal` automáticamente
3. Backend establece `tiempoEnEspera` automáticamente
4. Backend emite `nueva-comanda` con datos completos populados
5. Cocina recibe evento con todos los datos

### Flujo 2: Actualizar Plato

1. Cocina actualiza plato (PUT `/api/comanda/:id/plato/:platoId/estado`)
2. Backend valida transición
3. Backend emite `plato-actualizado` con datos completos
4. Mozos reciben evento con comanda completa populada

### Flujo 3: Pagar Comanda

1. Mozo paga comanda (PUT `/api/comanda/:id/status` con `pagado`)
2. Backend valida transición
3. Backend establece `tiempoPagado` automáticamente
4. Backend recalcula estado de mesa (simplificado)
5. Backend emite `comanda-actualizada` y `mesa-actualizada`

### Flujo 4: Liberar Mesa

1. Sistema detecta que no hay comandas activas
2. `recalcularEstadoMesa` establece estado a `libre`
3. Backend emite `mesa-actualizada` con datos completos
4. Mozos reciben actualización en tiempo real

---

## 🧪 Testing

### Tests Unitarios

```bash
npm test
```

### Tests Implementados

- ✅ Validación de transiciones de estado
- ✅ Más tests pueden agregarse siguiendo el mismo patrón

### Próximos Tests Sugeridos

- [ ] Test de cálculo de precioTotal
- [ ] Test de recalcularEstadoMesa
- [ ] Test de timestamps automáticos
- [ ] Test de soft-delete

---

## 📊 Métricas de Mejora

### Antes vs Después

| Métrica | Antes | Después |
|---------|-------|---------|
| Campos soft-delete | 2 (eliminada + IsActive) | 1 (IsActive) |
| Timestamps automáticos | Parcial | Completo |
| Datos en eventos Socket | Parcial | Completo |
| Cálculo precioTotal | Frontend | Backend |
| Reconexión WebSocket | Básica | Robusta (backoff) |
| Tests unitarios | 0 | Implementados |

---

## ✅ Checklist de Optimización

- [x] Timestamps automáticos al cambiar status
- [x] Simplificar recalcularEstadoMesa
- [x] Estandarizar soft-delete (solo IsActive)
- [x] Mejorar eventos Socket.io con datos completos
- [x] Calcular precioTotal en backend
- [x] Reconexión WebSocket robusta
- [x] Tests unitarios básicos
- [x] Documentación completa

---

## 🔧 Configuración

### Variables de Entorno

No se requieren nuevas variables de entorno para estas optimizaciones.

### Dependencias

```json
{
  "dependencies": {
    "winston": "^3.19.0"
  },
  "devDependencies": {
    "jest": "^30.2.0",
    "supertest": "^7.2.2"
  }
}
```

---

## 📞 Soporte

Para preguntas o problemas con estas optimizaciones:

1. Revisar logs en `logs/combined.log`
2. Ejecutar tests: `npm test`
3. Verificar eventos Socket.io en consola del servidor

---

**Fin del Documento**

