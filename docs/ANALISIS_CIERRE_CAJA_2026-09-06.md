# Cierre de caja 6/sep/2026: 7,711.50 vs 7,776.50

**Fecha:** 6 de septiembre de 2026  
**Pantallas:** `mozos.html` (ventas totales / pagadas) y cierre de caja  
**Cifra correcta del día:** **S/. 7,776.50**

## Qué se veía

| KPI | Mostraba | Debía ser | Diferencia |
|-----|----------|-----------|------------|
| Ventas totales / cierre | 7,711.50 | 7,776.50 | **−65.00** |
| Ventas pagadas | 7,810.50 | 7,776.50 | **+34.00** |

Los JSON de `data/` no se tocaron. El análisis es sobre Mongo (`lasgambusinas`).

## Causa del −65 (cierre / ventas totales)

El cierre solo sumaba comandas en `pagado` / `entregado` / `completado`.

La **comanda 938** (Carlos, mesa 27, S/. 65) está vigente, con `tiempoPagado`, pero quedó en `pendiente_aprobar`.

Pasó esto:

1. Carlos armó 938 (65) y un clon 939 (65) en el mismo pedido.
2. El cobro unió ambas en el ticket #410 (S/. 130).
3. Flor borró 939 (“clonado”).
4. Al anular tickets de 939 se apagó el ticket **entero**, también el de 938.
5. 938 quedó pagada en la práctica y fuera del cierre.

7,711.50 + 65 = **7,776.50**.

## Causa del +34 (ventas pagadas)

“Pagadas” sumaba `ticket.total` (último ticket por comanda), no el total de la comanda vigente.

Eso mete tickets de comandas **ya eliminadas** y no cuadra con parciales ni tickets de varias comandas.

Huérfanos activos del 6/sep (Melina / Geraldine):

| Ticket | Tipo | Comanda | Monto | Qué pasó |
|--------|------|---------|-------|----------|
| PPA #63 | Adelantado | **911** Melina | 151 | 911 se borró; se recreó como **912** (misma mesa 666, mismos platos, 151). El PPA de 911 siguió activo → **duplicado solo en la tabla de tickets**. |
| PPA #69 | Adelantado | **936** Melina | 46 | Borrada por “Clonado”. |
| #468 | Comanda | **974** Geraldine | 12 | Borrada por “clonacion”; el ticket se creó después desde el dashboard. |

El desglose por “último ticket” daba 7,810.50. La suma correcta es la de **comandas vigentes**.

## Duplicado 911 / 912 (Melina)

No hay dos comandas vigentes. 911 está `eliminada`. 912 es la vigente.

En **Tickets y pagos adelantados** se veían las dos porque el PPA #63 de 911 seguía `isActive`. En `comandas.html` 911 no salía (el listado oculta eliminadas).

## Qué se corrigió

1. **Cierre / ventas vendidas:** cuentan `pendiente_aprobar` y cualquier comanda vigente con `tiempoPagado`.
2. **Ventas pagadas:** salen de las mismas filas de comandas vigentes que reportes. Un ticket de comanda borrada ya no suma.
3. **Tabla de tickets:** no lista tickets cuyas comandas están todas eliminadas. 911 deja de duplicar a 912.
4. **Borrar comanda:** anula también PPA/aprobados buscando por ObjectId, string y `comandasNumbers`. Si el ticket cubre varias, solo se apaga cuando no queda ninguna vigente.
5. **`comandas.html`:** botón **Ver eliminadas** + filtro “Eliminada”. Ahí se ve 911 y se puede borrar el ticket huérfano (aunque esté aprobado).

## Cómo verificar hoy

1. Recargar backend / panel.
2. `mozos.html` período Hoy: ventas totales y pagadas = **7,776.50**.
3. Cierre de caja (estado actual) = **7,776.50**.
4. Tickets del día: una sola fila Melina 151 (912), sin 911.
5. Comandas → Ver eliminadas → buscar #911 para auditar el clon.
