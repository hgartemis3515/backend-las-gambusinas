# PLAN — Ticket de grupo al cobrar un solo plato (pago parcial y pago adelantado)

> Creado: 24/09/2026 · Estado: planificado (pendiente de implementación)
> Caso real: grupo de Jose Gambu, comandas **2098** y **2099** (pedido `6ab44197f5c4709ecbea0b9d`).

---

## 0. Qué tiene que pasar

Al pedir el cobro de **un solo plato** (pago parcial o pago adelantado) dentro de un grupo, la tabla de tickets debe seguir mostrando **dos tickets del mismo grupo**:

| Ticket | Contenido | Acción en la tabla |
|---|---|---|
| Restante | Platos que siguen en estado `entregado` y no entraron en esta solicitud | Se puede **forzar el pago** (sigue siendo ticket de alta, sin boucher) |
| Solicitud | Solo el plato que el mozo mandó a cobrar | Queda `pendiente_aprobacion` para **aprobar el cobro** |

Hoy la solicitud apaga el ticket completo de esa comanda y en la tabla solo queda el del plato cobrado.

---

## 1. Qué pasó en 2098 / 2099

Grupo de Jose Gambu. El mozo cobró **1 Tamal Pollo (S/ 12)** de la 2098. No fue un pago adelantado: el ticket activo es `tipo: pago_parcial`, `origen: pago`. El pago adelantado usa el mismo apagado de tickets, así que el mismo fallo aparece por los dos caminos.

| Ticket | Comandas | Total | Estado ahora |
|---|---|---|---|
| Alta 2098 (`origen: alta_comanda`) | Tamal chancho, patasca, salchipapa, tamal pollo | 70 | `isActive: false`. Observación: «Reemplazado por solicitud de cobro del mozo» |
| Alta 2099 | 4 tamal chancho + 2 patasca, todos `entregado` | 102 | Sigue activo. Se puede forzar |
| Pago parcial 2098 | 1 tamal pollo | 12 | Activo, `pendiente_aprobacion` |

En la 2098 quedaron tres platos `entregado` (S/ 58) **sin ticket**. El único ticket aprobable de esa comanda es el de S/ 12. La 2099 no se tocó porque la solicitud no la incluía.

Platos de la 2098 en este momento: tres `entregado` y el tamal pollo en `pendiente`. Eso es también la tarjeta vacía del KDS (ver sección 5; esa parte ya está corregida en la app de cocina).

---

## 2. Por qué se apaga el ticket completo

`desactivarTicketsAltaPendientes` (`src/utils/ticketAltaComanda.js`) marca `isActive: false` en **todo** ticket de alta pendiente cuyas comandas intersectan la solicitud, sin mirar si el cobro cubre todos los platos o uno solo.

Se llama desde:

- `src/services/boucherPagoService.js` — pago normal y pago parcial (`origen: pago`).
- `src/controllers/pagoAdelantadoController.js` — pago adelantado, motivo «Reemplazado por pago adelantado del mozo».

El ticket de alta no tiene boucher. Por eso la tabla permite forzar el pago (`ticketPuedeForzarPago` + `!ticket.boucher` en `appcocina/src/utils/ticketAprobacionUi.js`). Al apagarlo, el resto entregado pierde esa acción. El ticket nuevo sí tiene boucher: solo se aprueba, no se fuerza.

`actualizarTicketsForzadosConPpaMozo` (mismo archivo) hace un daño parecido si el ticket ya estaba forzado: le copia solo los platos del PPA y lo desactiva.

---

## 3. Cambio propuesto

### 3.1 No apagar el alta si el cobro es parcial

Sustituir el apagado total por un recorte, en pago parcial y en pago adelantado:

1. Localizar los tickets de alta pendientes (`origen` `alta_comanda` / `alta`, sin boucher, `isActive`, `pendiente_aprobacion`) de las comandas de la solicitud.
2. Comparar sus platos con los de la solicitud (`platoLineaId`, y si no hay id, comanda + nombre + precio).
3. Si la solicitud cubre **todos** los platos del ticket, apagarlo como hoy.
4. Si cubre **solo una parte**:
   - Quitar del snapshot del alta únicamente esas líneas.
   - Recalcular `subtotal`, `igv` y `total` con lo que queda.
   - Dejar `isActive: true`, sin boucher, `estado: pendiente_aprobacion`.
   - No cambiar `comandas` / `comandasNumbers` de las comandas que aún tengan platos en el ticket.
5. El ticket nuevo (pago parcial o PPA) se crea igual que ahora, solo con el plato solicitado.

Los dos quedan en el mismo pedido, así que la tabla los agrupa sola (`groupTicketsComoComandasHtml` en `appcocina/src/utils/ticketSort.js`).

### 3.2 Forzar pago del resto

El alta recortado sigue sin boucher, así que «Forzar pago» del grupo cobra solo los platos entregados que quedaron. No debe incluir el plato que ya está en la solicitud de cobro.

### 3.3 Pago adelantado

Misma regla de recorte. El PPA no debe apagar ni reescribir el alta con solo el plato adelantado. `actualizarTicketsForzadosConPpaMozo` no debe reemplazar los platos del ticket forzado por el snapshot del PPA ni desactivarlo cuando el PPA es de una parte del grupo.

### 3.4 Lo que no cambia

- Un cobro de **toda** la comanda sigue reemplazando el alta (comportamiento actual).
- Aprobar el ticket de la solicitud solo pasa a `pagado` los platos de ese snapshot.
- El total de venta de la comanda no se reduce por el plato cobrado (arreglo aparte del pago parcial de cantidad).

---

## 4. Criterios de aceptación

1. Con 2098, después de solicitar el tamal pollo, el grupo muestra el ticket de S/ 12 (aprobar cobro) **y** un ticket de alta con patasca + salchipapa + tamal chancho (S/ 58) que se puede forzar.
2. La 2099 (S/ 102) sigue en el mismo grupo, forzable, sin cambios.
3. El mismo resultado si ese único plato se manda como pago adelantado en lugar de pago parcial.
4. Si se cobra el último plato que quedaba en el alta, ese alta sí se apaga y no queda un ticket en cero.
5. Forzar el pago del resto no marca como cobrado el plato que ya está en la solicitud.

---

## 5. Tarjeta KDS vacía (ya corregido en esta fecha)

La 2098 tiene tres platos `entregado` y uno `pendiente` (el tamal enviado a cobro). La tarjeta se mantenía porque `pendiente` no es `entregado` ni `salió`, pero la tarjeta no pinta ni `entregado` ni `pendiente`. Resultado: encabezado de la comanda sin platos.

La tarjeta (vista normal y personalizada) ahora solo aparece si hay al menos un plato en `pedido`, `en_espera` o `recoger`. Un grupo ya entregado, con un plato solo pendiente de aprobación de cobro, no se muestra.

Archivos: `appcocina/src/utils/sosTablaKds.js` (`comandaTienePlatoEnTarjetaKds`), `comandastyle.jsx`, `ComandastylePerso.jsx`.
