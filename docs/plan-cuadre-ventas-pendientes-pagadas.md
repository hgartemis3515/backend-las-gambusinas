# Plan: cuadrar Ventas Pendientes y Ventas Pagadas

Día operativo medido: **5 de octubre de 2026** (04:00 Lima a 04:00 del día siguiente).
Fuente: Mongo del local, la misma función que alimenta cocina, el dashboard, reportes y mozos.

## Regla que debe quedar

Los dos cuadros usan el mismo dinero que se ve en pantalla, una sola vez por comanda.

| Cuadro | De dónde sale | Importe |
| --- | --- | --- |
| Ventas Pendientes | Suma de los totales de las comandas del filtro **Pendientes** en Tablas de tickets y Pagos Adelantados | El total que `comandas.html` muestra en esa comanda (`totalNetoComanda`) |
| Ventas Pagadas | Suma de los totales de las comandas del filtro **Cobrados** | El mismo total de `comandas.html` |

Filtro Pendientes = ticket con estado `pendiente_aprobacion`.
Filtro Cobrados = ticket con estado `aprobado`.

Con el mismo rango de fechas, esas dos sumas tienen que coincidir con:

- el pie **Total ventas** de esa pestaña en cocina
- el **Total visto** de `comandas.html` al filtrar Pagado (pagadas) y el resto abierto del mismo día (pendientes)
- el dashboard (`index.html`), reportes y el desglose por mozo, porque los cuatro llaman a `desgloseVentasPorAprobacion`

Entregar no cobra. Una comanda `entregado` o `en_espera` con ticket pendiente sigue en Pendientes.
Un pago adelantado ya cobrado y aprobado no vuelve a pendientes.

## Qué está pasando hoy

El cuadro de cocina no suma la tabla. Pide `GET /api/aprobacion/desglose-ventas`, y esa ruta clasifica cada comanda con `filaEsVentaPagada`.

Esa función, en `backend-LasGambusinas/src/utils/desgloseVentasTickets.js`, hace esto antes de mirar el ticket:

```js
if (fila && fila.soloPagoAdelantado) return false;
```

`soloPagoAdelantado` es verdadero cuando todos los platos activos tienen `pagoAdelantado.cobrado` o un ticket de adelanto aprobado. Esas comandas ya están **pagadas** (status `pagado`, ticket `aprobado`, y salen en Cobrados y en el filtro Pagado de `comandas.html`). El cuadro las vuelve a meter en Ventas Pendientes y las resta de Ventas Pagadas.

El argumento `{ tablaTickets: true }` que manda el controller no se usa.

Durante la medición entró la comanda **#3997** (S/ 76, Heidy, mesa 5, en espera). El hueco de los adelantos no se movió: sigue siendo **S/ 178**.

| | Ventas Pendientes | Ventas Pagadas | Total |
| --- | ---: | ---: | ---: |
| Cuadro actual (desglose) | 485 | 602 | 1 087 |
| Filtro de la tabla de tickets | 307 | 780 | 1 087 |
| `comandas.html` (total de la comanda) | 307 abiertas | 780 pagadas | 1 087 |

307 = #3995 S/ 85 (entregada, ticket pendiente) + #3996 S/ 146 (en espera) + #3997 S/ 76 (en espera).
780 = todas las comandas con status `pagado`. El filtro Cobrados suma exactamente 780. El cuadro de pagadas se queda en 602 porque le faltan los 178.

## Los 104 soles

No hay una comanda de hoy cuyo total sea 104, ni un ticket activo de 104. El dinero que no cuadra son cuatro comandas ya cobradas que el cuadro trata como pendientes:

| Comanda | Mozo | Mesa | Total | Ticket | Dónde se ve de verdad |
| --- | --- | --- | --- | ---: | --- |
| #3988 | Martha | 9 | 70 | #2808 aprobado | Cobrados y Pagado en `comandas.html` |
| #3994 | Ari | para llevar | 33 | #2820 aprobado | Igual |
| #3992 | Ari | para llevar | 1 | #2817 aprobado | Igual |
| #3990 | Heidy | 10 | 74 | #2810 aprobado | Igual |

Martha S/ 70 + Ari S/ 33 + Ari S/ 1 = **S/ 104**.
Esos 104 más la #3990 de Heidy (S/ 74) = **S/ 178**, que es el hueco completo entre el cuadro y la tabla.

Cada una tiene todos los platos con `pagoAdelantado.cobrado: true` y `estadoTicket: aprobado`. Por eso `soloPagoAdelantado` las saca de pagadas. El plato y el total del ticket son el mismo número que `comandas.html`: no es un plato fantasma ni un doble conteo de tickets.

Hay un documento histórico de **S/ 104** que no entra en el cuadro de hoy y no debe reactivarse:

- Ticket **#2573**, comanda **#3796**, Gabriel, mesa 4, creada el 2 de octubre de 2026.
- Total S/ 104. La comanda ya está `pagado` desde el 2 de octubre a las 20:11.
- El ticket quedó con estado `pendiente_aprobacion`, pero `isActive: false`. La bandeja de pendientes solo lista `isActive: true`, así que no aparece en Pendientes de hoy.

## Qué cambiar

1. **Clasificar como la tabla, no como la marca de adelanto.**
   En `filaEsVentaPagada`:
   - Ticket más reciente `aprobado` → Ventas Pagadas, aunque todos los platos tengan pago adelantado.
   - Ticket más reciente `pendiente_aprobacion` → Ventas Pendientes. Entregar no pasa esta comanda a pagadas.
   - Sin ticket activo en el rango: status `pagado` o `completado` → pagadas; el resto de la comanda vigente → pendientes.
   - Quitar el `return false` inmediato de `soloPagoAdelantado`.
   - Seguir contando la comanda una vez, con el total de la fila de `comandas.html`, no la suma de tickets viejos.

2. **Un solo importe.**
   El monto es `totalNetoComanda` / el total de `listarFilasEstadisticas` (hoy ya coinciden en estas comandas: delta 0). No sumar `ticket.total` de reintentos, ni el saldo vivo encima del total.

3. **El cuadro de cocina y el pie de la tabla usan esa misma suma.**
   `TicketsPpaPage` ya pinta el API. Al corregir el API, Ventas Pendientes queda igual al pie de Pendientes y Ventas Pagadas igual al pie de Cobrados, para el mismo periodo (Hoy, Día, Noche, 7 días).
   El respaldo `resumenKpisTickets` no debe sumar `pendienteCobro` ni `restoPendiente` al cuadro: eso mete soles que no están en la columna Total. El texto "Pendiente: S/ …" de la fila puede quedarse como detalle.

4. **El pie no duplica un grupo.**
   `totalVentasFilasTabla` suma los tickets del grupo. Si dos tickets son la misma comanda (adelanto + comanda completa), el pie infla. El pie debe sumar una vez el total de cada comanda, igual que `comandas.html`.

5. **Actualizar el test que hoy fija el error.**
   `tests/desglose-ventas-tickets.test.js`, caso "tabla de tickets: entregado y solo pago adelantado quedan pendientes", espera que un adelanto de S/ 70 con status `pagado` y ticket `aprobado` siga en pendientes. Ese caso pasa a pagadas. Entregada y por aprobar siguen en pendientes.

6. **No tocar el ticket #2573.**
   Sigue inactivo. La comanda #3796 ya está pagada.

Con esto, dashboard, reportes, mozos y propinas quedan alineados: los cuatro usan `desgloseVentasPorAprobacion`.

## Cómo comprobarlo

Correr, con el backend apuntando a la base local:

```bash
node scripts/investigar-cuadre-ventas.js 2026-10-05
```

Después del cambio, en el día de hoy:

- `desglose.ventasPendientes` = suma de tickets `pendiente_aprobacion` del día (307 con la #3997 incluida; sube si entran comandas nuevas).
- `desglose.ventasAprobadas` = suma de comandas `pagado` / filtro Cobrados (780, más lo que se cobre después).
- `brechas.desglosePag_vs_ticketsCobr` = 0.
- `brechas.desglosePend_vs_ticketsPend` = 0.
- Las cuatro comandas #3988, #3990, #3992 y #3994 salen en pagadas, no en pendientes.

En pantalla, mismo periodo en cocina y en `comandas.html`:

- Filtro Pendientes, pie Total ventas = cuadro Ventas Pendientes.
- Filtro Cobrados, pie Total ventas = cuadro Ventas Pagadas.
- Filtro Pagado de `comandas.html`, Total visto = Ventas Pagadas.
- Total visto del día en `comandas.html` = Ventas Pendientes + Ventas Pagadas.
