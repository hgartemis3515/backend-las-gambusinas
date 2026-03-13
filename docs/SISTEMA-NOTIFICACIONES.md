# Sistema de Notificaciones - Las Gambusinas

## Resumen

Se ha implementado un sistema completo de notificaciones tipo toast para el dashboard administrativo de "Las Gambusinas". El sistema proporciona feedback visual inmediato, claro y consistente para todas las operaciones importantes del sistema.

## Arquitectura

### Estructura de Archivos

```
public/
├── assets/
│   └── js/
│       ├── notifications.js    # Módulo central de notificaciones (NUEVO)
│       └── shared.js            # Funciones helper y API (ACTUALIZADO)
├── configuracion.html           # Panel de configuración (ACTUALIZADO)
├── auditoria.html               # Página de auditoría (ACTUALIZADO)
├── index.html                   # Dashboard principal (ACTUALIZADO)
├── comandas.html                # Gestión de comandas (ACTUALIZADO)
├── platos.html                  # Gestión de platos (ACTUALIZADO)
├── mesas.html                   # Gestión de mesas (ACTUALIZADO)
├── bouchers.html                # Gestión de bouchers (ACTUALIZADO)
├── clientes.html                # Gestión de clientes (ACTUALIZADO)
├── cierre-caja.html             # Cierre de caja (ACTUALIZADO)
├── reportes.html                # Reportes (ACTUALIZADO)
├── roles.html                   # Gestión de roles (ACTUALIZADO)
├── usuarios.html                # Gestión de usuarios (ACTUALIZADO)
└── areas.html                   # Gestión de áreas (ACTUALIZADO)
```

## Categorías de Notificación

### 1. Success (Éxito) - Color Verde
Para operaciones CRUD exitosas: crear, editar, actualizar elementos.
- Icono: ✓
- Duración: 4 segundos
- Ejemplos: "Comanda creada", "Plato actualizado", "Mesa guardada"

### 2. Error - Color Rojo
Para fallos técnicos y errores de validación. **Siempre activo**.
- Icono: ✕
- Duración: 6 segundos
- Ejemplos: "Error de conexión", "Error del servidor", "Validación fallida"

### 3. Warning (Advertencia) - Color Naranja
Para acciones potencialmente peligrosas.
- Icono: ⚠
- Duración: 5 segundos
- Ejemplos: "Esta operación es irreversible", "Stock bajo"

### 4. Info (Información) - Color Azul
Para estados del sistema y actualizaciones.
- Icono: ℹ
- Duración: 3 segundos
- Ejemplos: "Conexión restaurada", "WebSocket reconectado"

### 5. Audit (Auditoría) - Borde Dorado
Para eventos sensibles de alto impacto. **Siempre activo**.
- Icono: 🔍
- Duración: 8 segundos
- Incluye enlace "Ver en Auditoría"
- Ejemplos: "Comanda eliminada", "Boucher anulado", "Cierre de caja generado"

## API de Notificaciones

### Métodos de Conveniencia

```javascript
// Notificación de éxito
GambusinasNotifications.success('Título', 'Mensaje opcional');

// Notificación de error
GambusinasNotifications.error('Título', 'Mensaje opcional');

// Notificación de advertencia
GambusinasNotifications.warning('Título', 'Mensaje opcional');

// Notificación informativa
GambusinasNotifications.info('Título', 'Mensaje opcional');

// Notificación de auditoría
GambusinasNotifications.audit({
  eventType: 'comanda_eliminada',
  title: 'Comanda #42 eliminada',
  message: 'Esta acción ha sido registrada',
  entityId: 'abc123',
  entityType: 'comanda',
  entityName: 'Comanda #42',
  showLink: true
});
```

### Notificación desde Respuesta de API

```javascript
const result = await apiPost('/comanda', data);
GambusinasNotifications.fromResponse(result, 'Operación completada');
```

### API Helpers con Notificaciones Automáticas

```javascript
// GET con notificación de error automática
const result = await apiGetWithNotify('/mesas', { silentError: false });

// POST con notificación de éxito/error
const result = await apiPostWithNotify('/platos', platoData, {
  successMessage: 'Plato creado correctamente',
  auditEvent: 'plato_agregado',
  entityType: 'plato'
});

// PUT con notificación
const result = await apiPutWithNotify('/mesas/123', mesaData, {
  successMessage: 'Mesa actualizada'
});

// DELETE con notificación de auditoría
const result = await apiDeleteWithNotify('/comanda/456', { motivo: 'Error en pedido' }, {
  successMessage: 'Comanda eliminada',
  auditEvent: 'comanda_eliminada',
  entityType: 'comanda'
});
```

### Helpers Específicos por Módulo

```javascript
// Comandas
await ComandaAPI.crear(data);
await ComandaAPI.editar(id, data);
await ComandaAPI.eliminar(id, motivo, comandaNumber);
await ComandaAPI.eliminarPlato(comandaId, platoId, motivo, platoNombre);

// Platos
await PlatoAPI.crear(data);
await PlatoAPI.editar(id, data);
await PlatoAPI.eliminar(id, nombre);

// Mesas
await MesaAPI.crear(data);
await MesaAPI.editar(id, data);
await MesaAPI.eliminar(id, numero);
await MesaAPI.cambiarEstado(id, estado, numero);

// Bouchers
await BoucherAPI.crear(data);
await BoucherAPI.anular(id, motivo);

// Cierre de Caja
await CierreCajaAPI.generar(data);
await CierreCajaAPI.reabrir(id);

// Configuración
await ConfiguracionAPI.guardar(data);
```

## Eventos de Auditoría Soportados

| Evento | Categoría | Icono |
|--------|-----------|-------|
| `comanda_creada` | success | 📋 |
| `comanda_eliminada` | audit | 🗑️ |
| `ELIMINAR_ULTIMA_COMANDA` | audit | 🗑️ |
| `ELIMINAR_TODAS_COMANDAS` | audit | 🗑️ |
| `ELIMINAR_COMANDA_INDIVIDUAL` | audit | 🗑️ |
| `ELIMINAR_PLATO_COMANDA` | audit | 🗑️ |
| `PLATO_ANULADO_COCINA` | audit | 🚫 |
| `COMANDA_ANULADA_COCINA` | audit | 🚫 |
| `reversion_comanda` | audit | ↩️ |
| `plato_agregado` | success | ➕ |
| `plato_eliminado` | audit | 🗑️ |
| `mesa_creada` | success | 🪑 |
| `mesa_eliminada` | audit | 🗑️ |
| `pago_procesado` | success | 💳 |
| `boucher_anulado` | audit | 🚫 |
| `cierre_caja_generado` | audit | 💰 |
| `configuracion_actualizada` | warning | ⚙️ |

## Configuración de Usuario

La página de Configuración (`configuracion.html`) ahora incluye un panel completo para personalizar las notificaciones:

### Opciones Disponibles

1. **Categorías de Notificación**
   - Operaciones exitosas (activar/desactivar)
   - Errores (siempre activo)
   - Advertencias (activar/desactivar)
   - Información (activar/desactivar)
   - Auditoría (siempre activo)

2. **Apariencia**
   - Posición: esquina inferior derecha, superior izquierda, etc.
   - Duración por defecto: 3-8 segundos
   - Máximo visible: 3-10 notificaciones

3. **Opciones**
   - Pausar al pasar el mouse
   - Mostrar barra de progreso
   - Mostrar botón cerrar
   - Mostrar enlace a Auditoría

4. **Prueba de Notificaciones**
   - Botones para probar cada tipo de notificación

### Persistencia

Las preferencias se guardan en `localStorage` bajo la clave `gambusinas_notification_config`.

## Integración con Auditoría

### Navegación desde Notificación

Las notificaciones de auditoría incluyen un botón "Ver en Auditoría" que navega a la página de auditoría con filtros aplicados:

```
/auditoria.html?id=abc123&accion=comanda_eliminada
```

### Página de Auditoría Actualizada

La página `auditoria.html` ahora:
- Lee parámetros de URL desde notificaciones
- Aplica filtros automáticamente
- Puede cargar y mostrar un registro específico

## Cómo Probar el Sistema

1. **Desde Configuración**
   - Ir a Configuración → Notificaciones
   - Usar los botones de prueba para cada tipo

2. **En Operaciones Reales**
   - Crear una mesa: notificación verde "Mesa creada"
   - Eliminar una comanda: notificación dorada con enlace a auditoría
   - Error de red: notificación roja "Error de conexión"

3. **Verificar Auditoría**
   - Hacer clic en "Ver en Auditoría" desde una notificación
   - Confirmar que navega con filtros aplicados

## Personalización

### Agregar Nuevo Tipo de Evento

```javascript
// En notifications.js, agregar al EventCategoryMap:
'nuevo_evento': { category: 'audit', icon: '📌', label: 'Nuevo evento registrado' }
```

### Crear Notificación Personalizada

```javascript
GambusinasNotifications.create({
  category: 'success',
  title: 'Operación exitosa',
  message: 'Los datos se guardaron correctamente',
  icon: '✓',
  duration: 5000,
  action: {
    label: 'Ver detalles',
    onClick: () => window.location.href = '/detalles'
  }
});
```

## Notas Técnicas

- **Framework**: Alpine.js para reactividad
- **Estilos**: Tailwind CSS con tema oscuro
- **Animaciones**: CSS transitions + Sileo-style spring physics para entrada/salida
  - **Spring Physics**: Animaciones con efecto de rebote elástico realista
  - **Icon Bounce**: Animación del icono con efecto de aparición elástica
  - **Progress Shimmer**: Efecto de brillo deslizante en la barra de progreso
  - **Morphing Glow**: Efecto de brillo pulsante para notificaciones de auditoría
  - **Ripple Effect**: Efecto de onda al hacer click en la notificación
- **Colores**: Variables de Tailwind (`st-preparado`, `st-pagado`, etc.)
- **Z-index**: 9999 para estar sobre todo el contenido
- **Responsive**: Funciona en todos los tamaños de pantalla

### Animaciones por Categoría (Sileo-style)

| Categoría | Animación de Entrada | Efecto |
|-----------|---------------------|--------|
| Success | `toast-success-enter` | Spring bounce con rotación suave |
| Error | `toast-error-enter` | Spring con shake (vibración) |
| Warning | `toast-warning-enter` | Spring con wobble (oscilación) |
| Info | `toast-info-enter` | Spring suave y limpio |
| Audit | `toast-audit-enter` | Spring premium con glow dorado |

## Mantenimiento

Para modificar el sistema:
1. Editar `notifications.js` para lógica central
2. Editar `shared.js` para API helpers
3. Actualizar `configuracion.html` para nuevas opciones
4. Probar en todas las páginas afectadas
