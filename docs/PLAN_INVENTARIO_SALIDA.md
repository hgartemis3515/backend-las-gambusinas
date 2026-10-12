# Plan: salida de inventario = platos que salen en reportes

**Estado:** implementado. La salida del día suma las ventas del contador de reportes.  
**Pantallas:** `inventario.html` (columna Salida) y `reportes.html` (tabla de platos).  
**Ejemplo de negocio:** si hoy se venden 10 leñas, Salida de Pollo leña muestra 10 ese mismo día.

## Qué se quiere

El inventario es el registro digital, en el momento, de lo que entra, se guarda y sale: materias primas, ingredientes, bebidas, semielaborados y suministros.

Cada día operativo:

| Columna | Al abrir el día | Durante el día |
|---|---|---|
| Saldo anterior | El saldo real con el que cerró el día anterior | No se borra |
| Ingreso | 0 | Lo que se anota hoy |
| Corrección | 0 | Lo que se anota hoy |
| Salida | 0 | Las ventas de hoy en reportes, más una salida manual si la hay |
| Inventario | vacío (sin conteo de hoy) | El conteo de hoy, si se hace |
| Saldo real | Igual al saldo anterior, hasta que haya movimiento | Cierra el día y pasa a saldo anterior mañana |

El período (Ayer, 7 días, Todos, personalizado) no borra los días viejos. Cada día guarda sus ingresos, correcciones, salidas y conteo. Hoy solo muestra lo de hoy.

## Cómo está hoy

- **Reportes** cuenta platos con `getContadorPlatos` (`reportes.repository.js` + `contadorPlatosReporte.js`). Una leña vendida suma en la fila `1/4 pollo a la leña`, no dos veces. El mixto suma un cuarto de pollo y una panceta. La pachamanca se parte por sabor.
- El día de reportes es el **día operativo**: 04:00 a 03:59 del día siguiente, hora Lima (`diaOperativoRestaurante.js`). La fecha es `createdAt` de la comanda. No entran comandas canceladas ni eliminadas, ni líneas anuladas.
- **Inventario** arma el kardex por día calendario (00:00 a 23:59 Lima) en `inventario.repository.js`. La salida es un egreso escrito a mano (`clase: 'egreso'`). No lee las ventas.
- El cierre ya pasa el saldo real al saldo anterior del día siguiente (`inventarioKardex.js`, campo `cierre`). Ingreso, corrección y salida del día nuevo salen en 0 porque solo entran los movimientos de esa ventana. Eso se mantiene.

Las fechas no son simétricas. Una venta a la 01:30 es “ayer” en reportes (antes de las 04:00) y “hoy” en inventario. Por eso 10 leñas del reporte pueden no caer en la salida del mismo rótulo de día.

## Regla de la salida

```
Salida del día = ventas de reportes de ese día, mapeadas al rubro
               + egresos manuales de ese mismo día
```

La venta no se copia como movimiento guardado. Se calcula al armar el kardex, con el mismo contador y el mismo rango que reportes. Si anulan la comanda, la salida baja sola. Así no hay doble conteo si alguien además anota la venta a mano.

La salida manual sigue existiendo para merma, consumo de personal o un producto que no está en la carta. El botón +/− de Salida solo mueve esa parte manual. El número que se ve es la suma.

Ejemplo, Pollo leña, día operativo 12 oct:

- Reportes: 10 en `1/4 pollo a la leña`.
- Inventario, Salida: 10.
- Si además anotaron 1 de merma, Salida: 11.
- Al día siguiente, Salida vuelve a 0 (o a las ventas nuevas). Saldo anterior = saldo real del 12. Esos 10 quedan al abrir el 12 en el período.

## Mapa venta → rubro

La unidad del inventario es la fila del contador de reportes, no el nombre suelto del plato en la comanda. Factor 1 salvo que el negocio diga otra cosa.

| Fila de reportes | Rubro en inventario | Factor |
|---|---|---|
| 1/4 pollo a la leña | `pollo-lena` | 1 |
| 1/2 pollo a la leña baby | `pollo-lena` | por confirmar (1 o 2) |
| Panceta de chancho leña | `panceta` | 1 |
| Chancho a la leña | sin rubro todavía | — |
| Pollo de pachamanca | `pachamanca-pollo` | 1 |
| Cerdo de pachamanca | `pachamanca-chancho` | 1 |
| Res de pachamanca | `pachamanca-res` | 1 |
| Carnero de pachamanca | `pachamanca-cordero` | 1 |

El resto de filas del contador (ceviche, arroz, bebidas, guarniciones) entra en el mismo mapa cuando exista rubro. Si no hay rubro, esa venta no mueve inventario: no se inventa un producto.

El primer corte de implementación es **Pollo leña = 1 por cada `1/4 pollo a la leña`**, que es el ejemplo pedido. El mapa completo va en el mismo cambio para no dejar la salida a medias.

## Fechas simétricas

Inventario deja de usar medianoche. Pasa a `boundsDiaOperativo` / `rangoLima`, el mismo eje que reportes:

- “Hoy” en inventario = “Hoy” en reportes = 04:00 Lima → 03:59 del día siguiente.
- Una venta y su salida caen en el mismo rótulo de día.
- El período pide el contador con el mismo `desde`/`hasta` que el kardex.

Los movimientos manuales se fechan dentro de esa ventana (no a las 12:00 fijas si eso los saca del día operativo).

## Día a día y período

- **Hoy:** saldo anterior = cierre de ayer. Ingreso, corrección, salida e inventario del día empiezan en 0 y solo crecen con lo de hoy. Salida incluye las ventas de hoy.
- **Al pasar las 04:00:** la pantalla recarga. El saldo real de ayer queda como saldo anterior. Lo demás del día nuevo está en 0. No se borra Mongo.
- **Ayer / 7 días / Todos / personalizado:** cada día conserva sus números. La tabla de un rango muestra el acumulado del rango (saldo anterior = cierre previo al rango; salida = ventas + manual de esos días). El listado “Registros del período” sigue mostrando cada movimiento con su fecha. Las ventas del rango se listan por día, no se mezclan en un solo saco sin fecha.

## Cómo implementarlo

1. **Mapa** en backend, al lado de `contadorPlatosReporte.js`: nombre de fila → `{ rubro, factor }`. Sin mapa, esa fila no sale.
2. **Día único** en inventario: `kardexCarta` y el alta manual usan el día operativo. Misma función que reportes, no una copia de las horas.
3. **Salida calculada:** al armar las filas del kardex, para el rango pedido, llamar `getContadorPlatos(desde, hasta)`, aplicar el mapa y sumar esas unidades al egreso del rubro en **cocido** (lo que sale del local ya elaborado). No insertar un documento por cada plato vendido.
4. **Tiempo real:** cuando una comanda se crea, se edita, se anula o se elimina, el panel de inventario vuelve a pedir el kardex del día abierto. Cocina no pinta esta tabla; solo sigue viendo la alerta si el saldo real cruza el mínimo.
5. **Período:** el mismo cálculo por el rango. El historial distingue “Venta (reportes)” de “Salida manual” y trae la fecha del día operativo.
6. **Prueba de contrato:** 10 líneas de `1/4 pollo a la leña` con `createdAt` dentro del día operativo → Salida de Pollo leña = 10 ese día y 0 al día siguiente, con saldo anterior = saldo real. Una venta a las 02:00 Lima cuenta en el día operativo anterior, igual en reportes y en inventario. Anular la comanda baja la salida. El período de dos días conserva las 10 en el día que corresponde.

## Qué no cambia

- Mozos no muestran inventario ni el contador. Siguen armando la comanda; el conteo sale de ahí.
- Cocina no resta el plato a mano. La alerta usa el saldo que ya calcula el backend.
- Corrección e inventario (conteo físico) siguen siendo manuales y siguen yendo a auditoría.
- No se copia el saldo a `plato.stock` en este plan.

## Pendiente de confirmar antes de codificar

- El medio pollo a la leña: ¿suma 1 o 2 en Salida de Pollo leña?
- Chancho a la leña, bebidas y guarniciones: ¿qué rubro, o se dejan fuera del primer corte?
- La salida manual de Pollo leña, ¿se suma a las 10 ventas o el negocio quiere que la columna sea solo la venta?
