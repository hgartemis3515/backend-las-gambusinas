# Plan: cuadrar Ventas Pendientes y Ventas Pagadas

Día operativo medido: **5 de octubre de 2026** (04:00 Lima a 04:00 del día siguiente).
Fuente: Mongo del local, la misma función que alimenta cocina, el dashboard, reportes y el panel de mozos.

El día de la venta es `createdAt` de la comanda. Una reserva pagada hoy para el sábado cuenta hoy. Una mesa abierta hoy y cobrada después de las 04:00 cuenta hoy. `fechaCocina` y `fechaAtencion` no mueven el dinero de día.

## Regla que debe quedar

Los dos cuadros usan el dinero de la comanda una sola vez. El total es el de `comandas.html` (`totalNetoComanda` / fila de `listarFilasEstadisticas`). Ese total se parte en Pagadas y Pendientes. Las dos partes suman el total. No se suma un ticket encima de otro, ni el saldo vivo encima del total.

| Qué está cubierto | Cubeta |
| --- | --- |
| Líneas con ticket activo `aprobado` (caja, forzado, pago adelantado o abono) | Ventas Pagadas |
| El resto del total: ticket `pendiente_aprobacion`, o platos vigentes aún sin ticket aprobado | Ventas Pendientes |

Entregar no cobra y no cambia de cubeta. Aprobar un pago adelantado tampoco espera a que la comanda pase a `pagado`.

Si el cobro cubre toda la comanda, va entera a una cubeta. Si cubre una parte, solo esa parte va a Pagadas.

Con el mismo rango de fechas:

- Ventas Pagadas = pie **Total ventas** del filtro **Cobrados** en la tabla de tickets.
- Ventas Pendientes = pie del filtro **Pendientes**, más el resto de comandas vigentes del día que todavía no tienen ticket. Ese resto se ve abierto en `comandas.html` y tiene que entrar al cuadro aunque la bandeja de Pendientes no tenga fila.
- Pendientes + Pagadas = **Total visto** del día en `comandas.html`.
- El filtro Pagado de `comandas.html` es el status `pagado`. Puede ser menor que Ventas Pagadas: una reserva o un para llevar ya aprobados siguen en cocina y aún no están `pagado`.
- Dashboard (`index.html`), reportes, `mozos.html` y propinas usan `desgloseVentasPorAprobacion`, así que quedan con las mismas dos cifras.

Filtro Pendientes de la tabla = ticket `pendiente_aprobacion`. Filtro Cobrados = ticket `aprobado`.

## Qué está pasando hoy

El cuadro de cocina no suma la tabla. Pide `GET /api/aprobacion/desglose-ventas`, y esa ruta clasifica cada comanda con `filaEsVentaPagada`.

Esa función, en `backend-gambusinas/src/utils/desgloseVentasTickets.js`, hace esto antes de mirar el ticket:

```js
if (fila && fila.soloPagoAdelantado) return false;
```

`soloPagoAdelantado` es verdadero cuando todos los platos activos tienen `pagoAdelantado.cobrado` o un ticket de adelanto aprobado. Esas comandas ya están cobradas (ticket `aprobado`; varias ya con status `pagado`, y salen en Cobrados y en el filtro Pagado de `comandas.html`). El cuadro las vuelve a meter en Ventas Pendientes y las resta de Ventas Pagadas.

El booleano también es corto para un adelanto parcial: un ticket `aprobado` de una sola línea se llevaría el total de la comanda a Pagadas, o un ticket viejo de la comanda completa lo devolvería entero a Pendientes.

El argumento `{ tablaTickets: true }` que manda el controller no se usa.

Durante la medición entró la comanda **#3997** (S/ 76, Heidy, mesa 5, en espera). El hueco de los adelantos no se movió: sigue siendo **S/ 178**.

| | Ventas Pendientes | Ventas Pagadas | Total |
| --- | ---: | ---: | ---: |
| Cuadro actual (desglose) | 485 | 602 | 1 087 |
| Filtro de la tabla de tickets | 307 | 780 | 1 087 |
| `comandas.html` (total de la comanda) | 307 abiertas | 780 pagadas | 1 087 |

307 = #3995 S/ 85 (entregada, ticket pendiente) + #3996 S/ 146 (en espera) + #3997 S/ 76 (en espera).
780 = todas las comandas con status `pagado`. El filtro Cobrados suma exactamente 780. El cuadro de pagadas se queda en 602 porque le faltan los 178.

## Los 178 soles

No hay una comanda de hoy cuyo total sea 178. El dinero que no cuadra son cuatro comandas ya cobradas que el cuadro trata como pendientes. Dos son para llevar.

| Comanda | Mozo | Mesa | Total | Ticket | Dónde se ve de verdad |
| --- | --- | --- | ---: | --- | --- |
| #3988 | Martha | 9 | 70 | #2808 aprobado | Cobrados y Pagado en `comandas.html` |
| #3994 | Ari | para llevar | 33 | #2820 aprobado | Igual |
| #3992 | Ari | para llevar | 1 | #2817 aprobado | Igual |
| #3990 | Heidy | 10 | 74 | #2810 aprobado | Igual |

Martha S/ 70 + Ari S/ 33 + Ari S/ 1 + Heidy S/ 74 = **S/ 178**.

Cada una tiene todos los platos con `pagoAdelantado.cobrado: true` y `estadoTicket: aprobado`. Por eso `soloPagoAdelantado` las saca de pagadas. El plato y el total del ticket son el mismo número que `comandas.html`: no es un plato fantasma ni un doble conteo de tickets.

Hay un documento histórico de **S/ 104** que no entra en el cuadro de hoy y no debe reactivarse:

- Ticket **#2573**, comanda **#3796**, Gabriel, mesa 4, creada el 2 de octubre de 2026.
- Total S/ 104. La comanda ya está `pagado` desde el 2 de octubre a las 20:11.
- El ticket quedó con estado `pendiente_aprobacion`, pero `isActive: false`. La bandeja de pendientes solo lista `isActive: true`, así que no aparece en Pendientes de hoy.

## Pagos adelantados, reservas y para llevar

Los tres usan el mismo cobro adelantado. Lo que cambia es el status de la comanda después de aprobar, y si el ticket cubre todas las líneas.

### Pago adelantado

Al cobrar, el ticket nace `pendiente_aprobacion` y la línea queda `pagoAdelantado.cobrado: true` con `estadoTicket: pendiente_aprobacion`. Ese tramo sigue en Pendientes hasta que cocina aprueba. `cobrado: true` no alcanza.

Al aprobar (`aprobarTicket`), el ticket pasa a `aprobado` y el plato sale de `pedido` a `en_espera`. La comanda no pasa a `pagado` en ese momento. El tramo aprobado entra a Pagadas igual.

- **Completo.** Todas las líneas activas tienen ticket de adelanto `aprobado`. Todo `totalNetoComanda` va a Pagadas. Es el caso de #3988, #3990, #3992 y #3994, y también el de una comanda que ya está aprobada y todavía sigue en `en_espera` o `pedido`.
- **Parcial.** Solo algunas líneas, o una cantidad de la línea (la línea se separa: lo cobrado queda marcado y el resto sigue sin cobrar). Pagadas = subtotal de las líneas con ticket `aprobado`, una vez por `platoLineaId`. Pendientes = `totalNetoComanda` menos eso. Un ticket posterior de la comanda completa no vuelve a sumar las líneas ya aprobadas.
- **Abono por dinero.** Los platos no se marcan `cobrado`. El ticket es `pago_parcial`. Pagadas = el monto del ticket `aprobado`, tope el total de la comanda. El resto queda en Pendientes. La marca `pagoAdelantado.cobrado` no sirve para este caso; manda el ticket.
- **Rechazado.** El ticket no suma. Si la comanda queda `cancelado` o eliminada, sale del día (`matchComandaVigente`).

`cerrarComandaPpaTrasEntrega` pone `pagado` cuando ya se entregó y todo estaba cobrado. Eso cierra la mesa. No crea otra venta.

### Reserva

La comanda nace `en_espera`, `origenCreacion: reserva`, `programadaPorReserva: true`, el día en que el mozo la crea. El cobro es un ticket de pago adelantado con `origen: reserva`.

- Sin aprobar: Pendientes. La reserva sigue `pendiente_aprobar`.
- Aprobado (`confirmarReservaTrasAprobacionPPA`): los platos quedan con adelanto aprobado y la reserva pasa a confirmada. La comanda sigue programada y no entra al KDS vivo hasta `fechaCocina`. Su total cubierto va a Pagadas ese mismo día, aunque el status no sea `pagado`.
- Activar la reserva (`programadaPorReserva` pasa a false) y entregarla después no vuelven a cobrar. Mientras sigue programada, `cerrarComandaPpaTrasEntrega` no corre.
- Rechazada: la comanda se anula y no entra al cuadre.
- Una comanda extra de la misma reserva es otra fila. Lleva su propio total y sus propios tickets. El pago de la principal no la cubre. Si hereda `programadaPorReserva` y no tiene ticket aprobado, va a Pendientes.

### Para llevar

Si la comanda es solo para llevar, al crear el adelanto el status se queda en `pedido`. No pasa a `en_espera` hasta la aprobación. Con el ticket todavía `pendiente_aprobacion`, el total va a Pendientes.

Aprobado y con todas las líneas cubiertas: Pagadas, aunque el status solo haya pasado a `en_espera` y el plato siga en cocina. #3992 y #3994 ya llegaron a `pagado`; una para llevar aprobada que todavía no se entrega entra igual a Pagadas.

Comanda mixta (mesa + para llevar): el adelanto puede cubrir solo las líneas de llevar. Esas líneas, si el ticket está `aprobado`, van a Pagadas. Las de mesa sin ticket aprobado siguen en Pendientes. No se manda la comanda entera a Pagadas por tener un plato para llevar.

Un para llevar cobrado en caja con ticket normal (no adelanto) sigue la regla general: ticket `aprobado` = Pagadas, ticket `pendiente_aprobacion` = Pendientes.

## Qué cambiar

1. **Partir el total, no devolver un sí/no por la marca de adelanto.**
   En `acumularDesgloseDesdeFilas`, por cada fila vigente:
   - Cobertura aprobada = líneas (o monto de abono) con ticket activo `aprobado`, sin repetir `platoLineaId` y sin pasar de `totalNetoComanda`. Eso suma a Ventas Pagadas.
   - El resto del total de la fila suma a Ventas Pendientes.
   - Ticket `pendiente_aprobacion` no cubre, aunque `pagoAdelantado.cobrado` ya sea true.
   - Sin ticket activo: status `pagado` o `completado`, o `pagoForzado`, → todo a Pagadas. El resto vigente → Pendientes.
   - Quitar el `return false` inmediato de `soloPagoAdelantado`.
   - `filaEsVentaPagada` sirve solo cuando la cobertura es toda o ninguna. Un parcial reparte el mismo total en las dos cubetas.
   - `mapearFilaReporte` hoy no copia `pagoAdelantado` ni el id de línea, y el `select` de `listarFilasEstadisticas` no trae `origenCreacion` ni `programadaPorReserva`. La cobertura sale de los tickets ya cargados (aprobación + pago adelantado) cruzados con las líneas de la comanda. El status y `programadaPorReserva` no deciden la cubeta.

2. **Un solo importe.**
   El monto de la fila es `totalNetoComanda`. No sumar `ticket.total` de reintentos ni de un adelanto más la comanda completa. No sumar `pendienteCobro` encima de ese total. El texto "Pendiente: S/ …" de la fila puede quedarse como detalle.

3. **El cuadro de cocina y el pie de la tabla usan esa misma partida.**
   `TicketsPpaPage` ya pinta el API. Al corregir el API, Ventas Pagadas queda igual al pie de Cobrados. Ventas Pendientes queda igual al pie de Pendientes más el resto sin ticket, para el mismo periodo (Hoy, Día, Noche, 7 días).
   El respaldo `resumenKpisTickets`, si el API no responde, parte igual: lo aprobado una vez y el resto del total de la comanda. No suma `pendienteCobro` ni `restoPendiente` encima del snapshot.

4. **El pie no duplica un grupo.**
   `totalVentasFilasTabla` hoy suma los netos del grupo (`ticketParaDetalleGrupo`). Si el grupo junta adelanto y comanda completa, o el mismo plato en dos tickets, el pie infla. En Cobrados el grupo aporta solo la cobertura aprobada. En Pendientes aporta solo el tramo aún `pendiente_aprobacion`, sin repetir líneas ya aprobadas. La suma de los dos pies, más el resto sin ticket, es el total de `comandas.html`.

5. **Actualizar el test que hoy fija el error.**
   `tests/desglose-ventas-tickets.test.js`, caso "tabla de tickets: entregado y solo pago adelantado quedan pendientes", espera que un adelanto de S/ 70 con status `pagado` y ticket `aprobado` siga en pendientes. Ese caso pasa a pagadas. Entregada y por aprobar siguen en pendientes.
   Agregar:
   - Adelanto parcial: S/ 30 aprobados y el resto del total en pendientes. La suma es el total de la fila.
   - Abono `pago_parcial` aprobado, platos sin `cobrado`: solo ese monto en pagadas.
   - Reserva `programadaPorReserva`, status `en_espera`, ticket `aprobado`: pagadas.
   - Reserva con ticket `pendiente_aprobacion`: pendientes.
   - Para llevar status `pedido` o `en_espera`, adelanto completo `aprobado`: pagadas.
   - Para llevar con el adelanto todavía `pendiente_aprobacion`: pendientes.
   - Comanda extra de reserva sin ticket propio: pendientes, aunque la principal esté pagada.
   - Ticket `rechazado` o `isActive: false`: no suma. La #3796 / #2573 no entra.

6. **No tocar el ticket #2573.**
   Sigue inactivo. La comanda #3796 ya está pagada el 2 de octubre.

El contrato que queda igual de nombre es `desgloseVentasPorAprobacion`: `ventasPendientes`, `ventasAprobadas` y `porMozo`. Cambia el criterio con el que se parten.

- Backend: `desgloseVentasTickets.js` y la fila de `estadisticasComandas.js`. Lo consumen `GET /api/aprobacion/desglose-ventas`, reportes y propinas.
- Cocina: el cuadro ya lee ese API. Hay que alinear el pie (`totalVentasFilasTabla`) y el respaldo `resumenKpisTickets` para el parcial y el grupo adelanto + comanda. El KDS no cambia.
- Panel (`mozos.html`, `index.html`, `reportes.html`): leen el mismo desglose. No tienen pantalla propia que recalcular.
- App de mozos: no pinta este cuadre ni hay que cambiar el cobro, la reserva ni el para llevar en la tablet.

## Cómo comprobarlo

Correr, con el backend apuntando a la base local:

```bash
node scripts/investigar-cuadre-ventas.js 2026-10-05
```

Después del cambio, en el día de hoy:

- `desglose.ventasPendientes` = 307 con la #3997 incluida (sube si entran comandas nuevas sin cobro aprobado).
- `desglose.ventasAprobadas` = 780 (más lo que se cobre después).
- `brechas.desglosePag_vs_ticketsCobr` = 0.
- `brechas.desglosePend_vs_ticketsPend` = 0.
- Las cuatro comandas #3988, #3990, #3992 y #3994 salen en pagadas, no en pendientes.
- Pendientes + pagadas sigue en 1 087 mientras no entre otra comanda.

El script del 5 de octubre no trae una reserva abierta ni un adelanto parcial. Esos casos se comprueban con los tests de arriba, no reactivando tickets viejos.

En pantalla, mismo periodo en cocina y en `comandas.html`:

- Filtro Cobrados, pie Total ventas = cuadro Ventas Pagadas.
- Filtro Pendientes, pie Total ventas + comandas del día sin ticket = cuadro Ventas Pendientes.
- Total visto del día en `comandas.html` = Ventas Pendientes + Ventas Pagadas.
- Filtro Pagado de `comandas.html` = comandas con status `pagado`. En el día medido coincide con Ventas Pagadas (780), porque las cuatro adelantadas ya están `pagado`. Una reserva o un para llevar aprobados y todavía en cocina suman a Ventas Pagadas y siguen fuera de ese filtro hasta que la comanda pase a `pagado`.
