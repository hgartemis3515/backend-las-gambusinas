# Inventario de Las Gambusinas

Cómo funciona `backend-gambusinas/public/inventario.html` como hoja de producción de un restaurante. El código de esa hoja manda. Los planes viejos (`DOC_INVENTARIO_PANTALLA.md`, `PLAN_INVENTARIO_HTML.md`) describen etapas anteriores.

La hoja vive en el panel (`/inventario.html`, permiso `ver-inventario`). El backend guarda el kardex. Cocina y mozos no pintan esta pantalla: una venta del salón llega por la API y la hoja la muestra en la columna Venta.

El día corre de 04:00 a 04:00, hora de Lima.

## Para qué sirve

La cocina necesita saber, en piezas y no en platos de la carta:

- con cuánto abrió cada producto
- qué entró hoy (compra o despiece)
- qué se transformó en otro corte o en un plato de producción
- qué se vendió
- qué queda, crudo y cocido por separado cuando el producto se cocina
- si lo que hay en cámara cuadra con lo que dice la hoja

## Producto y platos

Un producto agrupa muchos platos. Pierna de Pollo agrupa Pierna a la leña, Pollada y Menú pierna. Pecho de Pollo agrupa Pollo pachamanca, Pecho a la leña, Sandwich y Menú pecho. El árbol está en `arbolPollo` y en `arbolesGrupo`. Un plato se marca con `plato: true`.

El plato no tiene fila visible en la tabla, pero sí tiene fila interna (`rows`) y su propio rubro en el kardex. Su crudo y su cocido se guardan aparte del producto.

Una pieza vive en un solo lugar a la vez:

- **Producto suelto.** Pierna que todavía no es plato.
- **Plato.** Pierna que ya pasó a Pierna a la leña, cruda o cocida.

Pasar de uno a otro es una transformación. La pieza sale del producto y entra al plato. Nunca está en los dos.

El grupo (Grupo Pollo, Grupo Carnes) no suma a sus hijos: cada fila tiene su propia unidad.

## Las cuatro pestañas

| Pestaña | Qué hace el usuario |
|---|---|
| Inventario Tabla | Lee, corrige y cuenta la hoja del día. Es la que se mira al cerrar. |
| Transformar | Parte pollo fresco, pecho, pierna, panceta, arroz y el resto de mapas. Es el único lugar donde una pieza entra a un plato. |
| Stock | Anota crudo y cocido de la misma fila, sin un saldo paralelo. |
| Gráfico de inventario | Serie del período elegido. |

## La fila de la tabla

Columnas, de izquierda a derecha:

1. **Saldo anterior.** Lo que quedó del turno previo. Si el producto tiene cocido, crudo arriba y cocido abajo.
2. **Ingreso.** Lo que entró en el período: compra directa o piezas que salieron de una transformación.
3. **Corrección.** Ajuste manual. Puede ser negativo.
4. **Ingreso total.** De dónde salió el stock del período, con flecha verde (entra) y flecha roja (sale). La lupa abre el modal de ingreso.
5. **Venta.** Lo que salió por comanda o por venta manual.
6. **Transformación.** Lo que salió de esta fila hacia otro corte o plato. En rojo cuando es mayor que 0.
7. **Saldo.** Cuenta teórica del período.
8. **Conteo.** Lo que alguien contó en cámara. Vacío si nadie contó.
9. **Queda (Saldo real).** El conteo, si hubo. Si no, el saldo. La lupa abre el procedimiento.
10. **Diferencia.** Conteo menos saldo. Azul si sobra, rojo si falta.
11. **Estado.** Punto según si falta, sobra o cuadra.

## Las cuentas

Para cada tipo (`crudo`, y `cocido` si el producto lo tiene):

```
ingreso total del tipo = saldo anterior + ingreso + corrección
saldo del tipo         = ingreso total − venta − transformación + cubierta
queda del tipo         = conteo, si hubo conteo; si no, el saldo del tipo
diferencia del tipo    = conteo − saldo del tipo
```

`cubierta` es la venta que el producto no pudo cubrir y cubrió otro.

En la fila del producto, hoy:

| Función | Qué suma |
|---|---|
| `calcIngresoTotal` | tipos del producto + ingreso total de sus platos (`creditoPlatos`) |
| `sumaIngresoTotalFila` (flecha verde) | ingreso + corrección positiva del producto + ingreso total de sus platos |
| `restaIngresoTotalFila` (flecha roja) | corrección negativa + transformación + venta del producto |
| `calcSaldo` | tipos del producto + saldo de sus platos (`saldoPlatosOcultos`) |
| `calcSaldoReal` (Queda) | solo los tipos del producto, sin platos |
| `calcDiferencia` | solo los tipos del producto |

Por eso la flecha verde de Pierna de Pollo sube cuando transformas pierna en Pierna a la leña: esa pieza entra al ingreso del plato y el plato se suma al ingreso total del padre. A la vez la flecha roja sube, porque la pierna salió por transformación.

## Crudo y cocido

Pecho de Pollo y Pierna de Pollo son materia: solo crudo. Pierna a la leña, Pecho a la leña, Sandwich y Pollo pachamanca tienen cocido. Menú, Pollada y los platos de filete no.

En Transformar, en un plato con cocido:

- Subir el número de arriba (Pierna a la leña) crea crudo del plato y resta una pieza libre del producto padre.
- El renglón Crudo → Cocido pasa una unidad cruda del mismo plato a cocido. El crudo baja y el cocido sube en la misma cantidad. No se puede cocer más crudo del que el plato tiene.

Pecho y Pierna tienen el botón **Ingreso**, igual que Pollo fresco. Es compra directa de piezas crudas. Se suma a lo que salió del fresco y se puede transformar. 1 pollo fresco sigue siendo 2 pechos y 2 piernas.

## Transformar

- Pollo fresco se parte. Su Ingreso anota cuántos entraron y los reparte.
- Pecho de Pollo reparte a filete y a sus platos.
- Pierna de Pollo reparte a sus platos.
- No se puede repartir más piezas de las libres. Libres = salieron del fresco + ingreso directo − ya transformadas.
- Panceta, pescado, pota, carnero y arroz tienen su propio mapa. Panceta, pescado y pota anotan el rendimiento a mano.

Al cambiar un número, `volcarTransformacionEnTabla` escribe la salida en Transformación del origen y la entrada en Ingreso del destino. `guardarDespieceEnServidor` manda solo la diferencia contra lo ya guardado (`POST /api/inventario/movimientos`).

## Ventas

El kardex trae `ventas` y la hoja las suma en Venta. La cascada del backend resta primero el cocido del plato, después el crudo del plato y al final el producto que lo agrupa. La venta manual de la fila hace la misma cascada.

## Conteo de cámara

Contar es la forma de corregir la hoja con lo que de verdad hay.

### Cómo funciona hoy

1. Se abre desde la columna Conteo de una fila, o desde el botón de conteo. `openCountModal(rowId, tipo)`.
2. El modal tiene un selector con **todas** las filas internas, también los platos escondidos. Así se puede contar Pierna a la leña aunque no tenga fila visible.
3. Si el producto tiene cocido, se elige crudo o cocido. Se cuenta cada tipo por separado.
4. El número parte del saldo calculado. El cocinero lo cambia con − y + o lo escribe.
5. Guardar (`guardarConteoCamara`) manda un movimiento clase `inventario`, motivo `Conteo crudo` o `Conteo cocido`, y recarga el kardex.
6. En el backend el conteo **no se suma**: reemplaza el balance del rubro desde esa hora. Los movimientos que vienen después corren desde ese número. El balance corrido sale como `cierre`.
7. En la hoja, Conteo muestra el número contado. Queda pasa a ser ese número. Diferencia es conteo − saldo.
8. Al día siguiente, el saldo anterior ya arranca desde el conteo.

### Lo que falla hoy

- **Queda no sigue el día después del conteo.** La hoja usa el valor contado (`conteo`), no el balance corrido (`cierre`). Si a las 15:00 cuentas 10 piernas y a las 17:00 se venden 2, Queda sigue diciendo 10. El backend ya sabe que son 8.
- **Diferencia mezcla horas.** Compara el conteo de las 15:00 contra el saldo del día completo, que ya incluye las ventas de las 17:00. Falta parece más grande de lo que fue.
- **Dos números en el mismo modal.** El selector dice «Saldo esperado» con `calcSaldo` (producto + platos). El recuadro «Saldo calculado en hoja» usa `calcSaldoTipo` (solo el producto). Para Pierna de Pollo el cocinero ve dos cifras distintas.
- **«Dejar sin conteo» no se guarda.** `limpiarConteoProducto` borra el número en pantalla y no manda nada. Al recargar el kardex, el conteo vuelve.
- **Contar una familia toma muchos pasos.** Para contar la pierna hay que abrir el modal una vez por Pierna de Pollo y otra por cada plato, eligiendo en un selector largo.

## Modal de ingreso total, hoy

La lupa de Ingreso total llama a `abrirIngresoLupa`. El diálogo se titula «Queda en {producto}».

- **Libre del principal:** el saldo crudo de la fila padre.
- Una tabla de platos con el **saldo** de cada uno, crudo y cocido. Solo entran platos distintos de cero.
- No tiene botones.

El modal se abre desde el ingreso, pero muestra saldo. No dice cuánto entró a cada plato. Tampoco deja quitar nada: para bajar una Pierna a la leña hay que volver a Transformar.

## Modal de saldo, hoy

La lupa de Queda abre el procedimiento del período: saldo anterior + ingreso ± corrección − venta − transformación = queda.

Ese número es solo el producto. Los platos que todavía tienen piezas no aparecen, aunque son piezas de la misma familia que siguen en cocina.

## Plan

Una sola regla para los tres modales:

> Un producto se ve con sus platos. El producto suelto va arriba, cada plato debajo, crudo y cocido por separado. Nunca se suman en un solo número sin decir de dónde sale cada parte.

### 1. Modal de ingreso: qué entró a cada plato y poder restarlo

La suma ya existe y se queda en un solo lugar: **Transformar**. El modal de ingreso solo resta. No lleva +.

El modal muestra:

| | Crudo | Cocido | |
|---|---|---|---|
| Pierna de Pollo (suelta) | ingreso del producto | — | |
| Pierna a la leña | lo que entró al plato | lo que pasó a cocido | − crudo · − cocido |
| Pollada | lo que entró | — | − crudo |
| Menú pierna | lo que entró | — | − crudo |

Cada plato de la familia aparece, aunque esté en 0, para que se vea el grupo completo. Un − en 0 queda apagado.

Qué hace cada −:

- **− crudo del plato.** La pieza vuelve al producto como crudo libre. Es lo contrario de la transformación. Si esa pieza entró hoy por Transformar, se baja el mismo número del mapa (`updateAderezoCorte` con −1). Si venía del saldo anterior, se guarda el par `Pasa a {producto}` en el plato y `Sale de {plato}` en el producto. En los dos casos las piernas libres suben 1 y la flecha verde del padre baja 1.
- **− cocido del plato.** Una pieza cocida no vuelve a ser cruda. Se guarda como corrección negativa del cocido del plato, con motivo (merma, error de cocción). Pasa a la flecha roja. El padre no recupera la pieza.
- **No hay − del producto suelto en este modal.** El producto se corrige con su Ingreso, su Corrección o su Venta, en la fila.

El modal no se cierra al restar. Los números se recalculan y el cambio va al kardex con los movimientos que la hoja ya usa.

### 2. Modal de saldo: qué queda del producto y qué queda en cada plato

El procedimiento actual sigue explicando el producto suelto. Debajo se agrega **«Platos con saldo»**:

| | Crudo | Cocido |
|---|---|---|
| Pierna de Pollo (suelta) | 6 | — |
| Pierna a la leña | 2 | 1 |

- Un plato en 0 no se lista. Este modal responde «qué queda».
- Ese bloque no entra en la fórmula del producto. La pieza que salió por transformación ya se restó del producto y vive en el plato. Sumarla otra vez la contaría dos veces.
- Al final, una línea separada: **«En la familia quedan 9 piezas: 6 sueltas y 3 en platos»**. Es la única vez que se suman, y se dice qué es cada parte.

En la tabla, la columna Queda sigue siendo el producto suelto. Debajo del número, en chico, «+3 en platos». La lupa abre el detalle.

### 3. Modal de conteo: contar la familia en una pantalla

El conteo físico se hace por familia, porque en cámara la pierna suelta y la Pierna a la leña están juntas.

- Al abrir el conteo de Pierna de Pollo, el modal lista el producto y cada plato, con crudo y cocido cuando aplica. Cada renglón tiene su número esperado y su campo de conteo.
- El número esperado de cada renglón es el saldo de ese renglón solo. Desaparece el «Saldo esperado» mezclado del selector.
- Guardar manda un movimiento `inventario` por cada renglón que cambió. Un renglón que no se tocó no manda nada.
- Queda y Diferencia usan el `cierre` del backend, no el valor contado. Así, después de contar, las ventas siguen restando.
- «Dejar sin conteo» se guarda de verdad o se quita. Si se queda, el backend necesita poder anular el último conteo del rubro en el período.

### Cómo se prueba

1. Transformar 3 piernas en Pierna a la leña. La flecha verde de Pierna de Pollo sube 3. El modal de ingreso muestra Pierna a la leña con 3 crudo.
2. Cocer 1. El modal muestra 2 crudo y 1 cocido. El padre no recupera esa pieza.
3. − crudo en el modal. Quedan 1 crudo y 1 cocido. Las piernas libres suben 1. El mapa de Transformar muestra 2 en Pierna a la leña.
4. − cocido en el modal. El cocido queda en 0, aparece como corrección negativa del plato y el padre no sube.
5. El modal de saldo muestra Pierna de Pollo suelta y Pierna a la leña con lo que le quede. Pollada en 0 no aparece.
6. Contar la familia: 6 piernas sueltas y 1 Pierna a la leña cruda. Vender 1 pierna después. Queda baja a 5 sin volver a contar.

## Análisis

La hoja ya tiene la idea correcta: un solo kardex, un rubro por producto o plato, crudo y cocido por separado, y la transformación como par de movimientos. El problema no es el modelo. Es que cada pantalla arma su propia cuenta.

Lo que hoy cuesta:

- **Cuatro maneras de decir «saldo».** `calcSaldo` suma los platos, `calcSaldoReal` no, la flecha verde sí, el modal de conteo usa las dos. El usuario ve números distintos para la misma pierna según dónde mire.
- **Dos fuentes de verdad para lo transformado.** El ingreso de un plato sale a la vez de `despiece.aderezos` (lo que hay en el mapa de hoy) y del kardex (lo que se guardó). `volcarTransformacionEnTabla` reescribe `row.ingreso` desde el mapa y `aplicarKardex` lo reescribe desde el servidor. El que corre último gana. Por eso un ingreso directo de pecho y pierna necesitó su propia bolsa (`despiece.ingresoCorte`).
- **Escrituras por muchos caminos.** `fijarCampo`, `moverIngresoDirecto`, `pasarCrudoACocido`, `guardarDespieceEnServidor`, `guardarConteoCamara` y la venta manual llaman cada una a `paso` a su manera, con su propio rollback.
- **Plantillas repetidas.** La fila de la tabla está escrita dos veces (grupos y filas sueltas), con las mismas columnas. Un cambio en Ingreso total hay que hacerlo en dos lugares.
- **El conteo no corre.** El backend ya calcula el `cierre` desde el conteo. La hoja no lo usa.
- **Un archivo de más de 11.000 líneas.** Datos de ejemplo, árbol, reglas de cocido, cuentas, modales y estilos viven juntos. Es difícil saber qué función manda.

## Recomendación: la hoja como hub

La hoja tiene que funcionar como un centro con una sola lectura y una sola escritura. Las pestañas y los modales solo piden y muestran.

### Una lectura: la familia

Una función arma, para cualquier producto, todo lo que las pantallas necesitan:

```
familiaDe(rowId) → {
  producto: { id, nombre, crudo: cuenta, cocido: cuenta | null },
  platos:   [ { id, nombre, crudo: cuenta, cocido: cuenta | null } ],
  totales:  { sueltas, enPlatos, familia }
}

cuenta = { anterior, ingreso, correccion, venta, transformacion,
           saldo, conteo, queda, diferencia }
```

- `queda` viene del `cierre` del backend.
- La tabla pinta `producto`. La flecha verde usa `platos[].ingreso`. El modal de ingreso usa `producto.ingreso` y `platos[].ingreso`. El modal de saldo usa `queda` de todos. El conteo usa `saldo` y `conteo` de todos.
- Nadie más suma platos por su cuenta. `calcSaldo`, `creditoPlatos` y `saldoPlatosOcultos` pasan a leer de aquí.

### Una escritura: el movimiento

Toda acción del usuario se traduce a movimientos del kardex en una sola función:

```
registrar(accion) → [movimientos] → POST → cargarKardex
```

| Acción | Movimientos |
|---|---|
| Ingreso directo | `ingreso` + en el producto |
| Transformar a plato | `Pasa a {plato}` − en el producto · `Sale de {producto}` + en el plato |
| Devolver plato crudo | lo contrario del anterior |
| Crudo → cocido | `Pasa a cocido` − crudo · `Pasa de crudo` + cocido, mismo rubro |
| Quitar cocido | `regulacion` − en el cocido del plato, con motivo |
| Venta manual | `egreso` por la cascada |
| Conteo | `inventario` por renglón |

La pantalla puede pintar el cambio antes de que vuelva el servidor. Si el servidor falla, `registrar` lo revierte igual para todas las acciones.

### El mapa de Transformar, solo como formulario

`despiece` deja de ser una segunda fuente de saldo. Es el formulario del día. Al abrir la hoja se arma desde los movimientos `Pasa a` del kardex. Al cambiarlo se llama a `registrar`. Así desaparecen las bolsas paralelas y el «el último que corre gana».

### Una sola fila

La fila de la tabla vive en una plantilla. Los grupos y las filas sueltas la usan igual.

### Separar el archivo, sin cambiar la pantalla

Cuando se toque, el script sale del HTML en piezas, sin cambiar lo que el usuario ve:

- `inventario-datos.js`: árbol, claves, semilla de cocido
- `inventario-cuentas.js`: `familiaDe` y las cuentas
- `inventario-movimientos.js`: `registrar`
- el HTML: solo plantillas y estilos

### Orden sugerido

1. `familiaDe` y la lectura de `cierre`. Arregla el conteo que no corre y los cuatro saldos.
2. Modal de saldo con platos. Solo lee, no tiene riesgo.
3. Modal de ingreso con −, usando `registrar`.
4. Conteo por familia.
5. `despiece` armado desde el kardex.
6. Plantilla única de fila y archivos separados.

Cada paso deja la hoja funcionando. Cocina y mozos no cambian: siguen vendiendo por comanda y la cascada del backend sigue igual.
