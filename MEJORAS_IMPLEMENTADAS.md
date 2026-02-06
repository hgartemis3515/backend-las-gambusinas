# 🚀 Mejoras Implementadas en el Backend - Las Gambusinas

**Fecha:** Enero 2025  
**Versión:** 2.0

---

## 📋 Resumen de Cambios

Este documento describe todas las mejoras implementadas en el backend del sistema Las Gambusinas según los requisitos solicitados.

---

## ✅ 1. Sistema de Logging Centralizado con Winston

### Cambios Realizados

- **Instalado:** `winston` package
- **Creado:** `src/utils/logger.js` - Sistema de logging centralizado
- **Creado:** Directorio `logs/` para almacenar logs

### Características

- Logs estructurados en formato JSON
- Archivos rotativos (máximo 5MB, 5 archivos)
- Separación de logs: `error.log` (solo errores) y `combined.log` (todos los logs)
- Formato legible en consola para desarrollo
- Niveles de log configurables via `LOG_LEVEL` env variable

### Uso

```javascript
const logger = require('./src/utils/logger');

logger.info('Mensaje informativo', { data: 'adicional' });
logger.error('Error crítico', { error: error.message, stack: error.stack });
logger.warn('Advertencia', { context: 'información' });
```

---

## ✅ 2. Manejo de Errores Estructurado

### Cambios Realizados

- **Creado:** `src/utils/errorHandler.js` - Utilidades para manejo de errores
- **Formato estándar:** `{ error: "mensaje", code: 500, data: [] }`
- **Actualizado:** Todos los controllers principales para usar el nuevo formato

### Formato de Respuesta de Error

```json
{
  "error": "Mensaje de error descriptivo",
  "code": 400,
  "data": []
}
```

### Clase AppError

```javascript
const { AppError } = require('./src/utils/errorHandler');

throw new AppError('Mensaje de error', 400, datosAdicionales);
```

### Función handleError

```javascript
const { handleError } = require('./src/utils/errorHandler');

try {
  // código
} catch (error) {
  handleError(error, res, logger);
}
```

### Controllers Actualizados

- ✅ `comandaController.js` - Todos los endpoints
- ✅ Manejo de errores consistente en todos los métodos

---

## ✅ 3. Validación Estricta de Platos/Cantidades

### Cambios Realizados

- **Eliminado:** Ajuste automático de arrays desincronizados
- **Agregado:** Validación estricta que **rechaza** si `platos.length !== cantidades.length`
- **Actualizado:** Modelo de comanda con validación en pre-save hook

### Ubicaciones Actualizadas

1. **`comanda.model.js`** - Pre-save hook rechaza desincronización
2. **`comanda.repository.js`** - `agregarComanda()` rechaza si no coinciden
3. **`comanda.repository.js`** - `editarConAuditoria()` rechaza si no coinciden
4. **`comanda.repository.js`** - `eliminarPlatosCompletamente()` lanza error si hay desincronización después de eliminar

### Comportamiento

**Antes:**
```javascript
// Ajustaba automáticamente
if (platos.length !== cantidades.length) {
  // Ajustar arrays...
}
```

**Ahora:**
```javascript
// Rechaza con error
if (platos.length !== cantidades.length) {
  throw new AppError(
    `Desincronización: ${platos.length} platos pero ${cantidades.length} cantidades. Deben coincidir.`,
    400
  );
}
```

---

## ✅ 4. Validación de Transiciones de Estado

### Cambios Realizados

- **Creado:** Función `validarTransicionEstado()` en `comanda.repository.js`
- **Actualizado:** `cambiarStatusComanda()` con validación de transiciones

### Transiciones Permitidas

```
en_espera → recoger
recoger → entregado
entregado → pagado
cualquier_estado → en_espera (revertir)
```

### Transiciones Rechazadas

- ❌ `pagado` → `en_espera` (excepto revertir explícito)
- ❌ `entregado` → `recoger`
- ❌ `recoger` → `en_espera` (excepto revertir)
- ❌ Cualquier otra transición inválida

### Ejemplo de Error

```json
{
  "error": "Transición inválida: no se puede cambiar de \"pagado\" a \"en_espera\"",
  "code": 400,
  "data": []
}
```

---

## ✅ 5. Configuración CORS con Variables de Entorno

### Cambios Realizados

- **Actualizado:** `index.js` - CORS configurado con `process.env.ALLOWED_ORIGINS`
- **Removido:** Wildcard `'*'` de Socket.io CORS
- **Agregado:** Validación de origen en CORS middleware

### Variables de Entorno

Crear archivo `.env` en `Backend-LasGambusinas/`:

```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.18.11:3000
PORT=3000
LOG_LEVEL=info
NODE_ENV=development
```

### Orígenes por Defecto (si no hay .env)

- `http://localhost:3000`
- `http://localhost:3001`
- `http://192.168.18.11:3000`
- `http://192.168.18.11:3001`
- `http://192.168.18.127:3000`
- `http://192.168.18.127:3001`

### Headers Permitidos

- `Content-Type`
- `Authorization`
- `X-User-Id` (nuevo)
- `X-Device-Id` (nuevo)
- `X-Source-App` (nuevo)

---

## ✅ 6. Campos de Auditoría Agregados a Modelos

### Modelo Comanda - Campos Agregados

```javascript
{
  // Timestamps de cambios de estado
  tiempoEnEspera: Date,
  tiempoRecoger: Date,
  tiempoEntregado: Date,
  tiempoPagado: Date,
  
  // Auditoría
  updatedAt: Date,
  createdBy: ObjectId (ref: 'mozos'),
  updatedBy: ObjectId (ref: 'mozos'),
  deviceId: String,
  sourceApp: String (enum: ['mozos', 'cocina', 'admin', 'api']),
  
  // Historial mejorado
  historialEstados: [{
    status: String,
    statusAnterior: String,  // NUEVO
    timestamp: Date,
    usuario: ObjectId,
    accion: String,
    deviceId: String,        // NUEVO
    sourceApp: String,        // NUEVO
    motivo: String           // NUEVO
  }]
}
```

### Status Enum Actualizado

```javascript
status: {
  enum: ['en_espera', 'recoger', 'entregado', 'pagado']  // 'pagado' agregado
}
```

---

## ✅ 7. Timestamps de Cambios de Estado

### Cambios Realizados

- **Actualizado:** `cambiarStatusComanda()` guarda timestamps automáticamente
- **Actualizado:** `agregarComanda()` establece `tiempoEnEspera` al crear
- **Actualizado:** Historial de estados con información completa

### Comportamiento

Cuando se cambia el estado de una comanda:

1. Se valida la transición
2. Se guarda el timestamp correspondiente:
   - `tiempoEnEspera` → cuando status = 'en_espera'
   - `tiempoRecoger` → cuando status = 'recoger'
   - `tiempoEntregado` → cuando status = 'entregado'
   - `tiempoPagado` → cuando status = 'pagado'
3. Se actualiza `historialEstados` con:
   - Estado anterior y nuevo
   - Usuario que hizo el cambio
   - Device ID y Source App
   - Timestamp preciso
   - Motivo (opcional)

### Uso en Controller

```javascript
router.put('/comanda/:id/status', async (req, res) => {
  const { nuevoStatus, motivo } = req.body;
  const usuario = req.headers['x-user-id'] || req.body.usuarioId;
  const deviceId = req.headers['x-device-id'] || req.body.deviceId;
  const sourceApp = req.headers['x-source-app'] || req.body.sourceApp || 'api';
  
  const options = { usuario, deviceId, sourceApp, motivo };
  const updatedComanda = await cambiarStatusComanda(id, nuevoStatus, options);
  // ...
});
```

---

## 📝 Archivos Modificados

### Nuevos Archivos

- ✅ `src/utils/logger.js` - Sistema de logging
- ✅ `src/utils/errorHandler.js` - Manejo de errores
- ✅ `logs/` - Directorio para logs
- ✅ `MEJORAS_IMPLEMENTADAS.md` - Este documento

### Archivos Modificados

- ✅ `index.js` - CORS con variables de entorno, logger
- ✅ `src/database/models/comanda.model.js` - Campos de auditoría, validación
- ✅ `src/repository/comanda.repository.js` - Validaciones, timestamps, logging
- ✅ `src/controllers/comandaController.js` - Manejo de errores estructurado
- ✅ `package.json` - Dependencia `winston` agregada

---

## 🔧 Configuración Requerida

### 1. Variables de Entorno

Crear `.env` en la raíz de `Backend-LasGambusinas/`:

```env
# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.18.11:3000

# Servidor
PORT=3000
NODE_ENV=development

# Logging
LOG_LEVEL=info
```

### 2. Instalación de Dependencias

```bash
cd Backend-LasGambusinas
npm install
```

### 3. Directorio de Logs

El directorio `logs/` se crea automáticamente, pero asegúrate de que tenga permisos de escritura.

---

## 🚨 Cambios que Afectan al Frontend

### 1. Formato de Errores

**Antes:**
```json
{ "message": "Error message" }
```

**Ahora:**
```json
{
  "error": "Error message",
  "code": 400,
  "data": []
}
```

### 2. Headers Opcionales (Recomendados)

Para mejor auditoría, enviar estos headers:

```
X-User-Id: <mozo_id>
X-Device-Id: <device_id>
X-Source-App: mozos|cocina|admin
```

### 3. Validación de Platos/Cantidades

El backend ahora **rechaza** comandas donde `platos.length !== cantidades.length`. Asegúrate de que el frontend siempre envíe arrays sincronizados.

### 4. Transiciones de Estado

El backend valida transiciones. Asegúrate de que el frontend solo intente transiciones válidas:

- ✅ `en_espera` → `recoger`
- ✅ `recoger` → `entregado`
- ✅ `entregado` → `pagado`
- ✅ Cualquier estado → `en_espera` (revertir)

---

## 🧪 Testing

### Probar Validación de Platos/Cantidades

```bash
# Debe fallar
POST /api/comanda
{
  "platos": [{"plato": "id1"}, {"plato": "id2"}],
  "cantidades": [1]  // ❌ Desincronizado
}
```

### Probar Transiciones de Estado

```bash
# Debe fallar
PUT /api/comanda/:id/status
{
  "nuevoStatus": "en_espera"  // ❌ Si la comanda está en "pagado"
}
```

### Probar CORS

```bash
# Desde origen no permitido debe fallar
curl -H "Origin: http://malicious-site.com" http://localhost:3000/api/comanda
```

---

## 📊 Métricas y Logs

### Logs Disponibles

- `logs/error.log` - Solo errores
- `logs/combined.log` - Todos los logs

### Información Registrada

- ✅ Cambios de estado de comandas
- ✅ Creación de comandas
- ✅ Errores de validación
- ✅ Intentos de transiciones inválidas
- ✅ Desincronizaciones detectadas

---

## 🔄 Migración de Datos Existentes

### Notas Importantes

1. **Comandas Existentes:** Las comandas existentes no tendrán los nuevos campos de timestamps. Se establecerán cuando cambien de estado.

2. **Historial:** El historial de estados existente se mantiene, pero los nuevos cambios incluirán los campos adicionales.

3. **Validación:** Las comandas existentes con desincronización no se corregirán automáticamente. Se detectarán y rechazarán en futuras actualizaciones.

---

## ✅ Checklist de Implementación

- [x] Instalar Winston
- [x] Crear sistema de logging
- [x] Crear error handler estructurado
- [x] Refactorizar controllers
- [x] Validar platos/cantidades (rechazar)
- [x] Validar transiciones de estado
- [x] Configurar CORS con env
- [x] Agregar campos de auditoría al modelo
- [x] Guardar timestamps de cambios
- [x] Actualizar cambiarStatusComanda
- [x] Documentar cambios

---

## 📞 Soporte

Para preguntas o problemas con estas mejoras, revisar:

1. Logs en `logs/error.log` y `logs/combined.log`
2. Respuestas de error estructuradas del API
3. Validaciones en el modelo de comanda

---

**Fin del Documento**

