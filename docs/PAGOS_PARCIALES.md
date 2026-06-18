# Pagos parciales por plato — App Mozos + Backend

**Versión:** 1.0  
**Fecha:** Junio 2026  
**Apps:** App Mozos v1.0.7+, Backend Las Gambusinas

## Resumen

Permite cobrar **un subconjunto de platos** de una o más comandas en la misma mesa. Cada cobro genera un **boucher independiente** (`esPagoParcial: true` cuando aplica). La comanda solo pasa a `pagado` / `IsActive: false` cuando **todos** sus platos activos están en estado `pagado`.

## Contrato API

### `POST /api/boucher`

#### Pago total (legacy, sin cambios)

```json
{
  "mesaId": "...",
  "mozoId": "...",
  "clienteId": "...",
  "comandasIds": ["..."],
  "observaciones": "opcional"
}
```

#### Pago parcial por platos

```json
{
  "mesaId": "...",
  "mozoId": "...",
  "clienteId": "...",
  "platosSeleccionados": [
    {
      "comandaId": "...",
      "platoIndex": 0,
      "platoSubdocId": "opcional — _id del subdocumento plato",
      "cantidad": 1
    }
  ],
  "observaciones": "opcional"
}
```

#### Respuesta (ambos flujos)

```json
{
  "_id": "...",
  "boucherNumber": 1,
  "total": 25.5,
  "boucher": { "...": "documento completo" },
  "resumen": {
    "mesaPagadaCompletamente": false,
    "totalPendiente": 40.0,
    "cantidadComandasPendientes": 1,
    "comandas": [ "..." ],
    "mesa": { "_id": "...", "nummesa": 5, "estado": "preparado" }
  }
}
```

El spread del boucher en la raíz mantiene compatibilidad con clientes que leían `response.data` directamente.

## Reglas de negocio

| Regla | Detalle |
|-------|---------|
| Platos cobrables | Solo `estado === 'entregado'`, no eliminados ni anulados |
| Marca de plato pagado | `estado: 'pagado'`, `tiempos.pagado` |
| Cantidad parcial | Si `cantidad` &lt; `cantidades[index]`, se reduce cantidad; el plato sigue `entregado` hasta pagar el resto |
| Comanda completa | `status: 'pagado'`, `IsActive: false` |
| Comanda parcial | `status: 'entregado'`, `IsActive: true` |
| Mesa | `recalcularEstadoMesa` tras cada pago; `estado: 'pagado'` solo si no quedan platos pendientes |
| Pedido abierto | Se cierra solo si `mesaPagadaCompletamente` |
| Descuentos | En parcial se prorratea `montoDescuento` por subtotal seleccionado / subtotal comanda |

## Agrupación de bouchers y ciclo de servicio

Cada **visita** a una mesa se agrupa en un **Pedido** (`pedido.model.js`). Comandas y bouchers se filtran por el ciclo actual:

| Estado mesa | Ciclo usado |
|-------------|-------------|
| Servicio en curso / pagos parciales | Pedido `abierto` de la mesa |
| `pagado` / `pagando` | Último pedido `pagado` (`fechaPago` más reciente) |
| Sin pedido (legacy) | Comandas pagadas del mismo día (zona Lima) |

**Endpoints afectados:** `GET /comanda/mesa/:id/pagadas`, `GET /boucher/by-mesa/:id`, `GET /comanda/mesa/:id/bouchers-parciales`.

Cada **boucher** guarda `pedido` (ObjectId). Los 3 vouchers de un pago en partes comparten el mismo `pedido` y solo esos se listan en Pagos.

Al **liberar** la mesa (`→ libre`), los bouchers activos se marcan `isActive: false` y los pedidos `abierto` pasan a `cancelado`.

Consultar bouchers de una comanda:

```
db.bouchers.find({ comandas: ObjectId("...") })
```

Campo `esPagoParcial` en el modelo distingue tickets parciales en reportes.

## Frontend (PagosScreen)

- `utils/pagoParcialHelpers.js` — selección, totales preview, payload
- Checkbox por plato + **Seleccionar todo / Deseleccionar todo**
- Totales del pago actual según selección
- Tras pago parcial: actualiza `comandas` y `totalRestante` desde `resumen`; modal de éxito para imprimir; vuelve a selección si queda pendiente

## Pruebas manuales

1. **Pago total:** seleccionar todos los platos → un boucher → mesa pagada.
2. **Dos parciales:** pagar mitad de platos, luego el resto → dos bouchers, misma comanda en `comandas[]` de ambos.
3. **Propina:** registrar propina sobre el boucher del parcial (`POST /api/propinas`).

## Archivos modificados

| Repo | Archivo |
|------|---------|
| backend | `src/services/boucherPagoService.js` (nuevo) |
| backend | `src/controllers/boucherController.js` |
| backend | `src/repository/comanda.repository.js` |
| backend | `src/database/models/boucher.model.js` |
| gambusinas | `utils/pagoParcialHelpers.js` (nuevo) |
| gambusinas | `Pages/navbar/screens/PagosScreen.js` |
