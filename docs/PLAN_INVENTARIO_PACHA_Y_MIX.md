# Plan: pachamanca por tamaño y sabor, mix leña y dúos

**Estado: solo plan. No está implementado.**

La hoja del día tiene que dejar ver cuántas pachamancas salieron, de qué tamaño y de qué sabor, y cuántos mix de leña salieron, descontando pollo y chancho con la salida que ya existe. Un dúo marino o truchero cuenta el combo y baja sus dos platos.

## Qué se quiere

Pachamanca tiene cuatro sabores: pollo, chancho, res y cordero. En la tabla **Día (Hoja)** los tamaños ya existen como filas sueltas: Pachamanca 1S, 2S, 3S y 4S. Esas filas hoy no se llenan con las comandas.

Ejemplo pedido: salen 3 pachamancas de 1 sabor, las tres de pollo. La hoja debe mostrar **Pachamanca 1S = 3** y, en esa misma fila, **pollo 3**.

Mix leña sale con chancho a la leña y pollo a la leña. Al venderse, el mix se cuenta en su fila y esas dos carnes bajan como ya bajan hoy pollo leña y chancho a la leña. No se inventa un tercer descuento.

Duo marino es ceviche y chicharrón de pescado. Duo truchero es ceviche de trucha y chicharrón de trucha. Al venderse el dúo, su fila cuenta el combo y esas dos filas bajan una unidad cada una.

## Cómo está hoy

La venta no se guarda como movimiento. El kardex la calcula desde las comandas del día (04:00 a 04:00). El mapa está en `src/utils/inventarioSalidaVentas.js`.

| Lo que cuenta reportes | Rubro que baja |
|---|---|
| Pollo de pachamanca | `pachamanca-pollo` |
| Cerdo de pachamanca | `pachamanca-chancho` |
| Res de pachamanca | `pachamanca-res` |
| Carnero de pachamanca | `pachamanca-cordero` |
| 1/4 pollo a la leña | `pollo-lena` |
| Chancho a la leña | `chancho-lena` |
| Panceta de chancho leña | `panceta` |

En la hoja, la fila **Pachamanca** suma esos cuatro sabores. Se ve un solo número. No dice si fueron pachas de 1, 2, 3 o 4 sabores.

El contador de reportes (`contadorPlatosReporte.js`) ya parte cada pachamanca vendida por el grupo **Sabores** del plato. El tamaño está en el catálogo: `saboresPorUnidad`, o se lee del nombre («Pachamanca 3 sabores»).

El mixto de leña que el contador conoce hoy no es «pollo + chancho». Parte **1/4 pollo a la leña** y **panceta de chancho**. Eso no coincide con lo pedido para Mix leña. Hay que confirmar el plato del catálogo antes de codificar.

Las filas Pachamanca 1S–4S, Mix leña, Duo marino y Duo truchero están en `inventarioRubros.js` y salen en la hoja, pero ninguna venta les entra.

En la carta el dúo es un solo plato, no dos líneas. Duo marino se llama «Duo Marino Ceviche Chicharron de pescado» (A22). Duo truchero se llama «Duo Truchero Ceviche Chicharron de trucha» (A23). El contador usa ese nombre de carta. El nombre de cocina del truchero es solo «Ceviche»; la baja no puede armarse con ese nombre, porque un ceviche suelto quedaría como dúo.

La hoja ya tiene Ceviche, Chicharrón de pescado y Ceviche de trucha. No tiene fila Chicharrón de trucha. La carta sí tiene el plato «Chicharrón de Trucha». Esa fila se agrega al implementar, para que el dúo truchero tenga dónde bajar.

## Regla de la pachamanca

Una pachamanca vendida hace dos cosas distintas. No se suman entre sí.

1. **Cuántas pachas.** Según el tamaño del plato (`saboresPorUnidad` o el nombre), suma 1 en la fila del tamaño:
   - 1 sabor → Pachamanca 1S
   - 2 sabores → Pachamanca 2S
   - 3 sabores → Pachamanca 3S
   - 4 sabores → Pachamanca 4S
   Esa cifra es la venta por comandas de esa fila. No baja carne otra vez.

2. **De qué sabor.** Cada sabor elegido baja la pieza que ya existe, una por una, con el mapa de hoy:
   - pollo → `pachamanca-pollo`
   - chancho (en la comanda puede decir cerdo) → `pachamanca-chancho`
   - res → `pachamanca-res`
   - cordero (en la comanda puede decir carnero) → `pachamanca-cordero`

La fila suma **Pachamanca** sigue siendo el total de esas cuatro piezas. Sirve para ver cuánta carne de pachamanca salió. Las filas 1S–4S sirven para ver cuántos platos de cada tamaño.

En la fila del tamaño, al lado de la venta, se lee el reparto de sabores de esas pachas. No es otra columna de stock.

Ejemplo del día:

| Fila | Venta comandas | Lectura |
|---|---|---|
| Pachamanca 1S | 3 | pollo 3 |
| Pachamanca 2S | 1 | pollo 1, chancho 1 |
| Pachamanca (suma) | 5 | 4 pollo + 1 chancho. Es carne, no cantidad de platos |

3 pachas de 1 sabor son 3 de pollo. 1 pacha de 2 sabores suma 1 pollo y 1 chancho. Carne total: 5. Platos: 4.

Si una pacha llega sin sabor, no se reparte a un sabor. Se cuenta en el tamaño y se marca «sin sabor», igual que el contador ya hace con «Pachamanca sin sabor registrado». No se inventa pollo.

## Regla del mix leña

Una venta de Mix leña:

1. Suma 1 en la fila **Mix leña** (cuántos mix salieron). Esa fila no descuenta carne por su cuenta.
2. Descuenta **pollo a la leña** en `pollo-lena` y **chancho a la leña** en `chancho-lena`, con el factor que esas filas ya usan (hoy el factor es 1 por unidad del contador).

Así se interpreta: el mix dice cuántos combos salieron; Pollo leña y Chancho a la leña dicen cuánta carne bajó, con la misma regla de siempre.

Antes de codificar hay que nombrar el plato real del catálogo. Si ese plato es el mixto actual, hoy descuenta pollo y panceta, no chancho a la leña. El plan sigue lo pedido: pollo a la leña y chancho a la leña. Panceta no entra en este combo salvo que el negocio diga lo contrario.

## Regla del dúo marino y del dúo truchero

Misma idea que el mix leña: el combo se cuenta en su fila y cada parte baja en la fila que ya tiene, una vez.

Una venta de Duo marino:

1. Suma 1 en la fila **Duo marino**. Esa fila dice cuántos combos salieron. No vuelve a bajar pescado por su cuenta.
2. Descuenta 1 en **Ceviche** (`ceviche`) y 1 en **Chicharrón de pescado** (`chicharron-pescado`).

Una venta de Duo truchero:

1. Suma 1 en la fila **Duo truchero**.
2. Descuenta 1 en **Ceviche de trucha** (`ceviche-trucha`) y 1 en **Chicharrón de trucha**.

Ejemplo: salen 2 dúos marinos y 1 ceviche suelto. Duo marino marca 2. Ceviche marca 3. Chicharrón de pescado marca 2.

El complemento «Chicharron pescado» o «Chicharron Trucha» que trae el plato en la carta no suma un chicharrón extra. El dúo ya trae sus dos partes.

Un ceviche, un chicharrón o un ceviche de trucha vendidos solos siguen bajando solo su fila. El dúo no los absorbe.

## Clic en el número de venta

En **Día (Hoja)**, el número de **Venta comandas** de una fila se puede pulsar. Abre un cuadro de ese día (04:00 a 04:00) con el desglose de ese número. Sirve para leer a dónde se fue la venta. No resta otra vez.

Ejemplo pedido: la fila Pollo marca 5. El cuadro dice qué pollos fueron, por ejemplo:

| Plato | Cantidad |
|---|---|
| Pollo a la leña | 1 |
| Chaufa de pollo | 4 |

Esas 5 ya salieron en la fila de cada plato, con la regla que esa fila ya tiene. Pollo a la leña baja `pollo-lena`. El cuadro de la fila Pollo solo explica la composición. No vuelve a descontar `pollo-origen`, porque la carne ya salió en su fila.

El mismo clic en las otras filas:

- **Pachamanca 1S, 2S, 3S o 4S.** Lista cada pacha de ese tamaño y su sabor. 3 en 1S con sabor pollo se lee «pollo 3».
- **Pachamanca (suma).** Lista las piezas de carne: pollo, chancho, res, cordero. No cuenta platos.
- **Mix leña.** Lista los mix vendidos y recuerda que cada uno ya descontó pollo a la leña y chancho a la leña.
- **Duo marino.** Lista los dúos y recuerda que cada uno ya descontó ceviche y chicharrón de pescado.
- **Duo truchero.** Lista los dúos y recuerda que cada uno ya descontó ceviche de trucha y chicharrón de trucha.
- **Ceviche, Chicharrón de pescado, Ceviche de trucha, Chicharrón de trucha.** Si la unidad vino de un dúo, el cuadro nombra ese dúo y la comanda. La unidad del plato suelto se lista con su propio nombre.
- **Cualquier otra fila.** Lista los platos de la comanda que armaron esa venta.

Si el número es 0, el cuadro dice que ese día no hay ventas de esa fila.

## Dónde se vería

- **Día (Hoja).** Venta comandas de Pachamanca 1S, 2S, 3S, 4S, de Mix leña, de Duo marino y de Duo truchero. En 1S–4S, el detalle de sabores junto al número. El número de venta se pulsa y abre el cuadro del desglose. Ceviche, chicharrón de pescado, ceviche de trucha y chicharrón de trucha bajan cuando sale el dúo.
- **Reporte del día de la hoja.** Las mismas cifras de ese día: ingreso no cambia; la venta por comandas de esos tamaños y el detalle de sabor. Ayer, hoy y mañana siguen siendo un día de 04:00 a 04:00. El reporte no abre el cuadro; el cuadro vive en la hoja, sobre el número.
- **Crudo y cocido.** El cuadro Pachamanca sigue con Pollo, Chancho, Res y Cordero. Ahí se ve la carne que bajó. No hace falta repetir 1S–4S en ese cuadro.

Cocina y mozos no pintan la hoja. El mozo ya manda los sabores en la comanda. No cambia el pedido ni el KDS.

## Qué no hacer

- No descontar la carne en la fila 1S y otra vez en el sabor.
- No descontar el mix y, además, otra unidad distinta de pollo y de chancho.
- No descontar el dúo en su fila y otra vez las mismas dos partes. La fila del dúo cuenta combos. Ceviche y chicharrón bajan una sola vez.
- No usar el nombre de cocina «Ceviche» del dúo truchero como si fuera un ceviche suelto.
- No borrar la fila suma Pachamanca: es el total de carne.
- No unir 1S–4S dentro de esa suma. Si se suman, el total de carne se duplica en la hoja.
- No hacer que el clic en la venta descuente de nuevo. El cuadro solo informa.

## Dónde se tocaría, cuando se implemente

1. Backend, al armar la salida del día: clasificar el tamaño y agregar el detalle de sabores por fila 1S–4S. La baja de carne sigue en las cuatro piezas.
2. Backend, mapa del mix: una venta de Mix leña informa la fila `mix-lena` y aplica la salida ya definida de `pollo-lena` y `chancho-lena`.
3. Backend, mapa de los dúos: reconocer el plato de carta A22 y A23. Una venta informa `duo-marino` o `duo-truchero` y aplica 1 en `ceviche` + `chicharron-pescado`, o 1 en `ceviche-trucha` + `chicharron-trucha`. Agregar la fila Chicharrón de trucha en `inventarioRubros.js`.
4. Panel, `inventario.html`: en la hoja y en su reporte del día, mostrar el detalle. Crudo y cocido no cambia de contrato.
5. Panel, clic en Venta comandas: el backend devuelve, por rubro y día, las líneas que armaron ese número (plato y cantidad; en pachamanca, también el sabor). El cuadro las muestra. No crea otro egreso.

## Pendiente antes de codificar

- Confirmar el nombre del plato Mix leña en la carta y que sus dos partes son pollo a la leña y chancho a la leña, no panceta.
- Confirmar que 1S, 2S, 3S y 4S son exactamente 1, 2, 3 y 4 sabores por pachamanca.
- El medio pollo a la leña sigue aparte: hoy cuenta 1 en `pollo-lena` hasta que el negocio diga si son 2 cuartos. Este plan no lo cambia.
- Cada dúo baja 1 y 1. Si una parte fuera media porción, el negocio lo dice antes de codificar.
