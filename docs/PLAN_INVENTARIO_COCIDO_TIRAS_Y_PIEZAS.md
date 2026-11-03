# Plan: cocido selectivo, tiras de panceta y piezas de pescado y pota

**Estado: la primera parte está en el código. Lo de este archivo a partir de «Corrección de pollada» y «Mapas de pescado y pota» es el siguiente pedido. No está implementado.**

La hoja de inventario deja de ofrecer cocido donde el producto ya es crudo de venta, y arma tres despieces de cantidad variable: panceta → tiras → trozos, pescado → piezas, y pota cruda → piezas. El cuy entra por unidad y no se transforma.

## Qué se quiere

### Sin variable cocido

Estos productos quedan solo en crudo. No hay cuadro de cocido en la tabla ni pase Crudo → Cocido en Transformar.

- Todos los platos que salen de **Filete Pollo Crudo**: filete de pollo, filete junior, milanesa, milanesa junior, chicharrón de pollo, chicharrón acevichado, chicharrón BBQ, chicharrón chico, fuente de chicharrón de pollo, lomo saltado de pollo y chaufa de pollo.
- **Pollada** sale de pechuga y de pierna. La fila nace cruda. Después de transformarla, el cocinero puede pasarla a cocido. Eso hoy está bloqueado: ver «Corrección de pollada».
- **Pierna a la leña** es un solo plato con ese nombre. En la rama de pierna no se clona «Pollo a la leña (pierna)». Pollo a la leña sigue en la rama de pechuga.

Filete de pollo y filete junior no son filas ni cuadros de transformar. Filete Pollo Crudo ya es el crudo de esos dos platos y no tiene cocido. La venta por comanda se anota en **Ventas comandas** de esa fila: filete de pollo resta 1, filete junior resta 0.5.

### Con variable cocido

- **Arroz con pato** conserva crudo y cocido (pecho y pierna).
- **Trozo de panceta** gana crudo y cocido. La tira de panceta no se vende; el trozo sí puede pasar a cocido.

### Panceta

1. Una **Panceta** pasa a **6 Tiras de panceta**. El factor es fijo.
2. Una tira no tiene un número fijo de trozos. El cocinero anota cuántas tiras usó y cuántos **Trozos de panceta** salieron de esas tiras. Es el mismo tipo de anotación variable que hoy tiene el trozo suelto.
3. Los platos descuentan trozos ya creados:

| Plato | Trozos de panceta |
| --- | --- |
| Chancho a la leña | 4 |
| Mix a la leña | 3 |
| Chancho a la BBQ | 6 |
| Chaufa de chancho | 1 |

Hay dos platos de chancho a la leña en la carta (con frejol y con papa frita). Los dos descuentan 4 trozos.

### Chicharrón de chancho

No sale de la panceta. Es un ingreso propio, por unidad, llamado **Chicharrón de chancho crudo**. No se transforma.

| Plato | Unidades |
| --- | --- |
| Chicharrón de chancho | 1 |
| Fuente de chicharrón de chancho | 2 |
| 1/2 chicharrón de chancho | 0.5 |
| Desayuno Criollo Gambusinas | 0.5 |

El 1/2 de la carta y el 1/2 del desayuno con panes usan el mismo 0.5.

### Pescado

Una unidad de **Pescado** se transforma en **Piezas de pescado**. La cantidad de piezas es variable: el cocinero anota cuántos pescados usó y cuántas piezas salieron, igual que tiras y trozos.

| Plato | Piezas de pescado |
| --- | --- |
| Duo marino | 2 |
| Ceviche, ceviche de pescado, chicharrón de pescado, jalea de pescado y pescado frito | 1 |

Trucha y dúo truchero no entran en este despiece.

### Pota

**Pota cruda** se transforma en **Pieza de pota**. La cantidad también es variable: cuántas potas se usaron y cuántas piezas salieron.

Los platos de pota de la carta (ceviche con chicharrón de pota y chicharrón de pota) descuentan pieza de pota. El factor de cada uno queda en 1 pieza hasta que se indique otro número.

### Cuy

No se transforma. El ingreso es por unidad de cuy.

| Plato | Unidades |
| --- | --- |
| Cuy entero | 1 |
| 1/2 cuy | 0.5 |

## Cómo está hoy

La venta no se guarda como movimiento de inventario. El kardex la arma desde las comandas del día (04:00 a 04:00). El mapa de descuento está en `src/utils/inventarioSalidaVentas.js`. Quién tiene cocido está en `src/utils/inventarioCascadaVenta.js` y lo pinta `public/inventario.html`.

Hoy el filete junior todavía puede irse a una fila propia `filete-junior` si el nombre no cae en el mapa. Filete de pollo y filete junior ya no tienen cuadro en Transformar en la pantalla, y la venta nueva de esos dos nombres debe quedar en la fila `filete`.

Pollada, pollo a la leña, pierna a la leña, saltado de pollo, chaufa de pollo y chicharrón de pollo nacen con cocido. En la rama de pierna conviven pierna a la leña y el plato de pollo a la leña que acepta pierna: por eso se ve un clon.

La panceta pasa directo a trozos con un número anotado a mano. No existe la tira. El chicharrón de chancho no tiene fila de carne cruda. El pescado no parte en piezas. La pota descuenta la pota entera. El cuy no tiene fila de ingreso por unidad.

## Reglas de la hoja

- Cocido solo existe si este plan lo nombra. El resto de esas familias muestra una sola columna cruda.
- La transformación de cantidad variable tiene dos números: cuántas unidades origen se usaron y cuántas unidades destino salieron. No hay factor fijo en ese segundo paso.
- Panceta → tira sí tiene factor fijo: 1 panceta = 6 tiras.
- Un plato no descuenta la pieza de arriba si ya existe la pieza de abajo. Chancho a la leña descuenta trozos, no pancetas ni tiras. Duo marino descuenta piezas de pescado, no el pescado entero.
- Chicharrón de chancho crudo y panceta no se mezclan. Cuy no se parte en otro rubro.
- Arroz con pato no cambia de regla: sigue con crudo y cocido.

## Dónde se toca

- Backend, `inventarioCascadaVenta.js`: apagar cocido de filete, pollada y pierna a la leña. Encender cocido solo en trozo de panceta, además del arroz con pato que ya lo tiene.
- Backend, `inventarioSalidaVentas.js` y el mapa `inventario_mapas`: tiras, trozos, piezas de pescado, pieza de pota, chicharrón de chancho crudo y cuy, con los factores de la tabla de arriba.
- Panel, `public/inventario.html`: quitar el pase a cocido de esas filas, dejar un solo cuadro «Pierna a la leña» en la rama de pierna, y los cuadros variables de tira→trozo, pescado→pieza y pota→pieza.
- Cocina y mozos no pintan esta hoja. La comanda que ellos envían tiene que descontar estos rubros en el backend. No hace falta una pantalla nueva en la tablet ni en el KDS.

## Qué no se hace en este plan

No se cambia el despiece del pollo fresco a pechuga y pierna, ni el filete que sale de la pechuga, ni el arroz con pato. No se unifica el chicharrón de chancho con la panceta. No se parte el cuy.

## Corrección de pollada

Al transformar pechuga o pierna en pollada, la fila queda cruda. El cocinero a veces quiere marcar esa pollada como cocinada y el pase Crudo → Cocido no aparece o no escribe en la hoja.

El bloqueo está en tres sitios que la tratan como solo cruda:

- `public/inventario.html`, `soloCrudoClave`, incluye `pollada`.
- `public/inventario.html`, `semillaCocido.pollada.tieneCocido` está en false.
- `src/repository/inventario.repository.js`, `opcionesCocido` fuerza `pollada` a `tieneCocido: false`.
- `src/utils/inventarioCascadaVenta.js` tiene la misma semilla en false.

`tienePaseCocido` corta en `soloCrudoClave` y `pasarCrudoACocido` sale si la fila no tiene cocido. Por eso el botón no hace efecto.

La corrección: sacar pollada de esas listas de solo crudo, dejar `tieneCocido: true` con reserva `pechuga-pollo`, y al pulsar el pase restar crudo y sumar cocido en la misma fila de la tabla. Pechuga y pierna siguen alimentando la misma pollada. El resto de platos de filete sigue sin cocido.

Arroz con pato no se toca: pechuga de pato y pierna de pato siguen con crudo y cocido.

## Mapas de pescado y pota

En Transformar, el pescado hoy es una lista `transPescado` con dos orígenes: **Pescado Tollo** y **Pescado Perico o ojo de uva**. Esos dos se eliminan.

El pescado pasa a un mapa semántico horizontal, del mismo estilo que panceta y carnero:

1. Origen: una unidad de **Pescado**.
2. Destino variable: **Piezas de pescado**. El cocinero anota cuántos pescados usó y cuántas piezas salieron.
3. En ese mismo mapa, los platos que comen pieza: ceviche y chicharrón de pescado usan 1. El dúo marino usa 2. Jalea de pescado y pescado frito usan 1. Trucha y dúo truchero no entran.

La pota cruda tiene su propio mapa semántico horizontal:

1. Origen: **Pota cruda**.
2. Destino variable: **Pieza de pota**. Se anota cuántas potas se usaron y cuántas piezas salieron.
3. Ceviche con chicharrón de pota y chicharrón de pota descuentan 1 pieza cada uno.

## Prompt para Google AI Studio

El texto completo para pegar está en el chat. Cubre el plan de cocido, tiras, chicharrón de chancho, pescado, pota y cuy, más el mapa horizontal del pescado y de la pota, y el pase a cocido de la pollada.
