# Complementos con Cantidades v2.0 - Documentación Técnica

## Resumen

Esta implementación extiende el sistema de complementos para permitir selección por cantidades, no solo por opciones marcadas. Ahora los grupos de complementos pueden definir límites de unidades totales, mínimos obligatorios, y máximo por opción.

**Fecha:** Marzo 2026  
**Versión:** 2.0

---

## Contrato de Datos

### 1. Estructura de Grupo de Complemento (Plato)

```javascript
{
  grupo: String,                    // Nombre del grupo: "Sabores Pachamanca"
  obligatorio: Boolean,             // Si requiere al menos una selección
  seleccionMultiple: Boolean,       // LEGACY: equivale a maxUnidadesGrupo > 1
  modoSeleccion: 'opciones' | 'cantidades',  // Nuevo: tipo de interacción
  
  // ===== NUEVOS CAMPOS v2.0 =====
  maxUnidadesGrupo: Number | null,  // Máximo total de unidades en el grupo
                                     // null = sin límite
                                     // 1 = selección única (radio button)
                                     // N = hasta N unidades totales
  
  minUnidadesGrupo: Number | null,  // Mínimo de unidades requeridas
                                     // null = 0 (opcional) 
                                     // 1+ = mínimo obligatorio
  
  maxUnidadesPorOpcion: Number | null, // Máximo por opción individual
                                         // null = sin límite
                                         // N = máximo N de una misma opción
  
  permiteRepetirOpcion: Boolean,    // Si una opción puede repetirse
  // ===== FIN NUEVOS CAMPOS =====
  
  opciones: [String]                // ["Pollo", "Res", "Cerdo"]
}
```

### 2. Estructura de Complemento Seleccionado (Comanda)

```javascript
{
  grupo: String,      // "Sabores Pachamanca"
  opcion: String,     // "Pollo"
  cantidad: Number    // NUEVO: 1, 2, 3... (default: 1)
}
```

---

## Ejemplos de Configuración

### Ejemplo 1: Grupo Obligatorio de Una Sola Opción

```javascript
{
  grupo: "Término de Cocción",
  obligatorio: true,
  seleccionMultiple: false,
  modoSeleccion: "opciones",
  maxUnidadesGrupo: 1,
  minUnidadesGrupo: 1,
  maxUnidadesPorOpcion: 1,
  permiteRepetirOpcion: false,
  opciones: ["Tres cuartos", "Medio", "Bien hecho"]
}
```
**Comportamiento:** El usuario DEBE elegir exactamente una opción. Equivale a un radio button.

### Ejemplo 2: Grupo Opcional de Múltiples Opciones

```javascript
{
  grupo: "Extras",
  obligatorio: false,
  seleccionMultiple: true,
  modoSeleccion: "cantidades",
  maxUnidadesGrupo: 3,
  minUnidadesGrupo: 0,
  maxUnidadesPorOpcion: 2,
  permiteRepetirOpcion: true,
  opciones: ["Queso extra", "Tocino", "Aguacate"]
}
```
**Comportamiento:** El usuario puede elegir hasta 3 unidades totales. Puede elegir "Queso extra x2" + "Tocino x1", pero no "Queso extra x3" porque maxUnidadesPorOpcion = 2.

### Ejemplo 3: Grupo Obligatorio con Cantidad Exacta

```javascript
{
  grupo: "Sabores Pachamanca",
  obligatorio: true,
  seleccionMultiple: true,
  modoSeleccion: "cantidades",
  maxUnidadesGrupo: 2,
  minUnidadesGrupo: 2,
  maxUnidadesPorOpcion: 2,
  permiteRepetirOpcion: true,
  opciones: ["Pollo", "Res", "Cerdo"]
}
```
**Comportamiento:** El usuario DEBE elegir exactamente 2 unidades. Puede ser "Pollo x2" o "Pollo x1 + Res x1".

---

## Compatibilidad Legacy

### Datos Antiguos (sin campos de cantidad)

Los platos y comandas existentes sin los nuevos campos funcionan automáticamente:

```javascript
// LEGACY: Solo tiene estos campos
{
  grupo: "Proteína",
  obligatorio: true,
  seleccionMultiple: false,
  opciones: ["Pollo", "Res"]
}

// Se normaliza automáticamente a:
{
  grupo: "Proteína",
  obligatorio: true,
  seleccionMultiple: false,
  modoSeleccion: "opciones",           // Inferido
  maxUnidadesGrupo: 1,                  // Inferido de !seleccionMultiple
  minUnidadesGrupo: 1,                  // Inferido de obligatorio
  maxUnidadesPorOpcion: 1,              // Inferido
  permiteRepetirOpcion: false,          // Inferido
  opciones: ["Pollo", "Res"],
  _esLegacy: true
}
```

### Complementos Seleccionados Legacy

```javascript
// LEGACY: Sin campo cantidad
{
  grupo: "Proteína",
  opcion: "Pollo"
}

// Se normaliza a:
{
  grupo: "Proteína",
  opcion: "Pollo",
  cantidad: 1,
  _esLegacy: true
}
```

---

## Ejemplos de Payload

### Crear Comanda con Complementos

```json
POST /api/comanda
{
  "mozos": "507f1f77bcf86cd799439011",
  "mesas": "507f1f77bcf86cd799439012",
  "platos": [
    {
      "plato": "507f1f77bcf86cd799439013",
      "estado": "en_espera",
      "complementosSeleccionados": [
        { "grupo": "Sabores Pachamanca", "opcion": "Pollo", "cantidad": 2 },
        { "grupo": "Guarnición", "opcion": "Ensalada", "cantidad": 1 }
      ],
      "notaEspecial": "Sin sal"
    }
  ],
  "cantidades": [1],
  "observaciones": ""
}
```

### Editar Plato en Comanda Existente

```json
PUT /api/comanda/:id/editar-platos
{
  "platos": [
    {
      "plato": "507f1f77bcf86cd799439013",
      "estado": "pedido",
      "complementosSeleccionados": [
        { "grupo": "Sabores Pachamanca", "opcion": "Res", "cantidad": 1 },
        { "grupo": "Sabores Pachamanca", "opcion": "Pollo", "cantidad": 1 }
      ],
      "notaEspecial": ""
    }
  ]
}
```

---

## Reglas de Validación

### 1. Obligatoriedad
- Si `obligatorio = true`, debe cumplir `totalUnidades >= minUnidadesGrupo`
- Si `minUnidadesGrupo` es null y `obligatorio = true`, se asume mínimo 1

### 2. Límite Máximo del Grupo
- `totalUnidades <= maxUnidadesGrupo` (si maxUnidadesGrupo no es null)
- `totalUnidades` = suma de todas las `cantidad` en el grupo

### 3. Límite Máximo por Opción
- Para cada opción: `opcion.cantidad <= maxUnidadesPorOpcion`

### 4. Opciones Válidas
- Cada `opcion` debe existir en el array `opciones` del grupo

### 5. Repetición de Opciones
- Si `permiteRepetirOpcion = false`, no puede haber `cantidad > 1`

---

## Mensajes de Error de Validación

| Error | Mensaje |
|-------|---------|
| Grupo obligatorio vacío | "El grupo '[grupo]' es obligatorio. Debes seleccionar al menos [min] unidad(es)." |
| Mínimo no alcanzado | "En '[grupo]' debes seleccionar al menos [min] unidad(es). Actual: [actual]." |
| Máximo excedido | "En '[grupo]' excediste el máximo de [max] unidad(es). Actual: [actual]." |
| Opción no válida | "La opción '[opcion]' no existe en el grupo '[grupo]'." |
| Máximo por opción excedido | "En '[grupo]', la opción '[opcion]' excede el máximo de [max] unidad(es)." |
| Opción no repetible | "En '[grupo]' no se permite repetir la misma opción." |

---

## Archivos Modificados

### Backend

| Archivo | Cambio |
|---------|--------|
| `src/database/models/plato.model.js` | Agregados campos de cantidad en schema `complementos` |
| `src/database/models/comanda.model.js` | Agregado campo `cantidad` en `complementosSeleccionados` |
| `src/database/models/complementoPlantilla.model.js` | Agregados campos de cantidad en plantillas |
| `src/utils/validadorComplementos.js` | **NUEVO** Servicio de validación centralizado |

### Frontend Admin (Dashboard)

| Archivo | Cambio |
|---------|--------|
| `public/platos.html` | UI para configurar cantidades en grupos de complementos |

### App Mozos (React Native)

| Archivo | Cambio |
|---------|--------|
| `Components/ModalComplementos.js` | UI de selección con +/- para cantidades |
| `Pages/navbar/screens/OrdenesScreen.js` | Normalización de complementos con cantidad |
| `Pages/ComandaDetalleScreen.js` | Soporte para edición con cantidades |

### App Cocina (React)

| Archivo | Cambio |
|---------|--------|
| `src/components/Principal/PlatoPreparacion.jsx` | Visualización de "xN" en cantidades |

---

## Guía de Migración

### Para Nuevos Platos

1. Configurar `modoSeleccion = 'cantidades'` si se quiere selección por cantidades
2. Definir `maxUnidadesGrupo` según las reglas de negocio
3. Establecer `minUnidadesGrupo` para grupos obligatorios con cantidad exacta

### Para Platos Existentes

Los platos existentes funcionan sin cambios. Para actualizar:

1. Editar el plato desde el admin
2. Configurar los nuevos campos de cantidad
3. Guardar

Las comandas antiguas se seguirán mostrando correctamente (con `cantidad: 1` implícito).

---

## Consideraciones de Performance

1. **Índices:** Los nuevos campos no requieren índices adicionales
2. **Validación:** Se ejecuta en el backend antes de guardar, con O(n) donde n = número de complementos
3. **Compatibilidad:** La normalización legacy es lazy, solo se aplica cuando se accede a los datos

---

## Testing Recomendado

1. **Creación de plato** con complementos por cantidades
2. **Creación de comanda** con complementos x2, x3
3. **Edición de comanda** modificando cantidades
4. **Visualización en cocina** mostrando "Pollo x2"
5. **Compatibilidad legacy** con platos y comandas antiguas
