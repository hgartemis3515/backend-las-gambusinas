# Análisis de la lógica de Inventario

Fuentes: `docs/GUIA_INVENTARIO.md`, `public/inventario.html`, `src/utils/inventarioKardex.js`, `src/utils/inventarioCascadaVenta.js`.  
Fecha: 11 de noviembre de 2026.

La guía describe cómo se usa la pantalla. Este documento dice cómo está armada la cuenta que corre hoy. El modelo anterior (contadores de sesión que se volcaban al pulsar «Pasar a la hoja») ya no existe.

## Una sola hoja

El saldo vive en la fila de Inventario Tabla. Transformar, Stock, el gráfico y la relación de platos leen esas filas y los movimientos del kardex. No hay un almacén paralelo.

El día operativo es de 04:00 a 04:00 (Lima). La hoja usa el período elegido. Las etiquetas **ingreso** / **resto** del cuadro de Transformar usan el turno de ese cuadro (`movimientosTurno`): el día operativo, o el tramo día/noche si el período es un tramo.

```
Ingreso total = Saldo anterior + Ingreso + Corrección
Saldo         = Ingreso total − Venta − Transformación + Cubierta
Saldo real    = Conteo, si la fila tiene conteo; si no, el Saldo
```

Esa fórmula es por tipo (`crudo` / `cocido`) en `calcSaldoTipo`. Una fila sin cocido pliega el bucket cocido dentro del crudo al pintar el kardex.

## Dos lecturas de la misma fila

| Lectura | Función | Qué suma | Quién la usa |
| --- | --- | --- | --- |
| Stock de hoja | `quedanDe` / `stockCuadro` | `calcSaldoTipo` de esa fila, con piso 0. Sin hijos y sin conteo. | Caja de Transformar y tope del pase. |
| Queda | `saldoRealColumna` | Saldo real de la fila + saldo real de los platos directos. | Columna Queda, Estado y pestaña Stock. |
| Saldo del gráfico | `calcSaldo` | Saldo de la fila + saldo de todos los platos que cuelgan, en cualquier nivel. | Tarjeta y serie del gráfico. |

`filaPachamancaIndependiente` corta el rollup: en la vista Pachamanca, Pecho pachamanca y Pollo pachamanca pierna muestran solo su propia fila.

El conteo reemplaza el saldo real de la fila contada. No cambia el tope de Transformar. Por eso se puede contar 10 en cámara y seguir sin poder pasar a filete si el saldo de fórmula del crudo es 0.

Mix leña pecho no es otra fila de stock: `mix_lena_pecho` apunta a la clave `pollo-lena`. Mix leña pierna y los cuartos de leña no tienen fila propia. `esPlatoRepetidoDeLena` los deja fuera del rollup para que el padre no los sume dos veces.

## Cómo se guarda un pase

`transferir` escribe en el momento, con la hora real. No hay contador de sesión.

- Origen: movimiento `clase: ingreso`, cantidad negativa, motivo `Pasa a {destino}`.
- Destino: movimiento `clase: ingreso`, cantidad positiva, motivo `Sale de {origen}` (el octavo agrega `· pecho` o `· pierna`).
- Tope al salir: `calcSaldoTipo` crudo del origen. Si no alcanza, aviso ámbar y no se escribe.
- Tope al devolver: no más de lo que `transformadoHoy` registró con ese motivo en el período, y no más stock del tipo que el destino tenga.

`aplicarKardex` separa la salida al pintar:

1. Suma los `Pasa a …` negativos (salvo el pase crudo ↔ cocido, que `esPaseEntreTipos` excluye).
2. Esa suma es la columna **Transformación**.
3. El mismo monto se vuelve a sumar a **Ingreso**, porque el kardex ya lo había metido como ingreso negativo. Ingreso queda en bruto (compras y entradas). Transformación queda en el neto que salió. El saldo baja una sola vez.

`transformadoHoy`, `frescosHoy`, `octavosDe` y los filetes del período se reconstruyen de esos motivos. Al recargar, el mapa y la hoja cuentan la misma historia.

El ingreso de **Pollo fresco** en la tabla no convierte el stock entero. `fijarCampo`, si la fila es `pollo_fresco` y la base es ingreso crudo, guarda el delta y llama a `setPollosFrescosConvertir(frescosHoy() + cambio)`. Solo esos pollos pasan a piezas: pecho `cambio × factorPechugasPorFresco` y pierna `cambio × factorPiernasPorFresco` (por defecto 2 y 2). El motivo del origen es `Pasa a piezas`. Si la transformación no estaba guardada, un cálculo del tipo «ingreso nuevo − transformación» volvía a cortar todo el ingreso; ese cálculo ya no se usa.

`fijarStockPolloFresco` (el + del cuadro) suma el delta al stock y convierte ese mismo delta. El + chico del factor solo convierte, sin tocar el ingreso de compra.

`Pasar a la hoja` espera la cola de guardado (`_colaTransformar`), recarga el kardex y abre la tabla. No copia números de la pantalla a las columnas.

### Guardado y recarga

Todo lo que escribe stock desde un clic o una caja pasa por la misma cola: `transferir`, `pasarCrudoACocido`, `fijarStockDirecto` y `fijarCampo`.

1. La fila cambia en pantalla al instante, y el movimiento se anota en `movimientosPeriodo` / `movimientosTurno` (`anotarMovs`), así las etiquetas «+N ingreso hoy» ya lo muestran.
2. `encolarMovimientos` guarda los `POST /movimientos` en orden, uno detrás de otro. Lleva la cuenta en `_escriturasPendientes`.
3. `programarRecargaKardex` recarga una sola vez, 600 ms después del último clic y con la cola vacía.
4. `cargarKardex` corre de a una. Si alguien pide otra recarga mientras corre, se hace una más al terminar. Kardex y movimientos se piden en paralelo. Una respuesta que llega con escrituras pendientes, o con otro período elegido, no se pinta.

Si el servidor rechaza un movimiento, sale el aviso y la recarga trae lo guardado. Ya no hay vuelta atrás fila por fila.

Antes, cada clic esperaba su `POST` y una recarga completa. Con varios clics seguidos, las recargas se cruzaban y la caja saltaba a un número viejo.

Lecturas con índice (se rehacen solo cuando cambia la lista que leen):

| Función | Índice |
| --- | --- |
| `transformadoHoy` / `ingresadoHoy` | `indiceMotivosPeriodo`: suma por rubro y motivo. |
| `partesMovimiento` | `indiceTurnoCuadro`: movimientos del turno por rubro y tipo, ya filtrados por hora. |
| `idDeClave` / `filaPorClave` | `idDeClaveExacto`: clave → id. |
| `nodoInventario` | `_idxNodos`: id → nodo de los árboles fijos. |
| `detalleVentasPlatos` | Por fila, mientras no cambien las ventas ni la hoja. |

### La caja del cuadro

`stockCuadro` es el saldo de fórmula de esa fila y ese tipo.

- Subir o bajar el crudo de un origen llama a `fijarStockDirecto`. El delta va a Ingreso si el ingreso del período puede absorberlo; si la resta se pasa del ingreso, el resto va a Corrección.
- La caja de cocido llama a `pasarCrudoACocido`. No crea unidades.
- La caja de filete llama a `transferir` desde el pecho, con el factor. No es un ingreso suelto.
- La caja de un plato llama a `moverIngresoPlato`.
- El lápiz, en Transformar y en la tabla, llama a `fijarSaldoTipo`: pone el saldo de fórmula (`calcSaldoTipo`) en el número escrito, con un ingreso o una corrección del día. No usa la fecha de saldo anterior. El lápiz de octavos sigue en `guardarEditarOctavo` → `fijarOctavosStock`.

`partesMovimiento` suma ingreso y regulación del turno y se queda con el neto. Neto positivo: «+N ingreso hoy». Neto negativo: «−N resto hoy». Neto 0: ninguna de las dos líneas. Sumar 1 y devolver 1 no deja rastro en la etiqueta, y el stock vuelve al número anterior.

`formulaCorte` (pecho y pierna) arma tres cifras de la misma cuenta: stock antes = queda + transformación del período; lo transformado; lo que queda.

## Cómo cae una venta

`atribuirVentas` ordena movimientos y ventas por hora. Cada venta se reparte contra el saldo que los movimientos anteriores dejaron. Una venta de las 10:00 ve el cocido pasado a las 9:00.

Cadena de una comanda (`cadenaDe`). Si el primer eslabón no es cocido, se antepone el cocido del plato aunque la fila esté marcada solo crudo:

1. Cocido del plato.
2. Crudo del plato.
3. Reserva. Si es materia (`pollo-origen`, `pechuga-pollo`, `pierna-pollo`, `filete`, `octavo-pollo`), crudo de esa pieza. Si es carnero, cocido del carnero y después crudo.

La venta manual (`cadenaDeFila`) usa los mismos eslabones, y el cocido entra solo cuando la fila tiene cocido. En las dos, el último eslabón se lleva lo que falte aunque el saldo no alcance. La pieza puede quedar negativa.

Cadenas fijas:

| Venta | Cadena |
| --- | --- |
| `pachamanca-pollo` | Cocido pierna pachamanca, cocido pecho pachamanca, crudo pierna, crudo pecho, crudo de Pierna de Pollo. |
| Mix de pecho a la leña | Cocido de `pollo-lena`, crudo de `pollo-lena`, crudo de `pechuga-pollo`. |
| Seco de carnero | Cocido y crudo del seco, luego cocido y crudo de `carnero`, por la reserva. |

Lo que sale de otro rubro se anota también en el plato con `sinSaldo`. Al pintar, eso es la **cubierta**: entra en Venta y se resta en la fórmula, así el plato no baja dos veces. La columna Venta del padre (`ventaColumna`) muestra la venta neta propia (venta − cubierta) más la de los platos directos. En la vista Pachamanca independiente, la columna es solo la venta de esa fila.

Filete de la carta se pinta como filete crudo, 1 por plato. Filete junior, 0,5. `milanesa-junior` y el código `T643` no entran al kardex de la hoja.

## Qué lee cada pestaña

| Pestaña | Lectura |
| --- | --- |
| Inventario Tabla | Fórmula de la fila. Saldo anterior, ingreso total, venta, saldo y Queda suman los platos directos. Transformación es solo de la fila. |
| Transformar | Stock de hoja y pases del período. Las etiquetas ingreso/resto son el neto del turno. |
| Relación de platos | No mueve stock. La venta usa el vínculo y la reserva. |
| Stock | `saldoRealColumna`. El mismo número que Queda. |
| Gráfico | Ingreso y venta de la fila (`sumarBase`). El saldo usa `calcSaldo`, con todos los descendientes. La serie dibuja como máximo 14 días. |
| Bloqueo | `GET`/`PUT /api/inventario/bloqueo`. También queda en `localStorage` (`inventario-bloqueo`). |

## Qué cambió respecto al modelo de contadores

| Antes | Ahora |
| --- | --- |
| Contadores de sesión (`despiece`) que se volcaban al pasar a la hoja y se ponían en 0 al recargar. | Cada **+** / **−** guarda el pase. Al abrir, los contadores salen de los movimientos. |
| El primer clic a veces no escribía la fila (`aplicarDeltaPadre`). | El clic llama a `transferir` o a `fijarStockDirecto`. |
| Filete, octavo y arroz solo aceptaban lo generado en la sesión. | El tope es el stock de hoja, aunque haya entrado por compra o en un día anterior. |
| Panceta, pescado, pota, carnero y los mapas del editor no topaban, y el editor podía pisar el ingreso. | Topan con el stock de hoja. El destino suma. |
| El pase negativo se veía otra vez dentro de Ingreso. | Ingreso queda en bruto y Transformación se lleva el neto. |
| La etiqueta del cuadro sumaba altas y bajas por separado. | Muestra el neto del turno. Si se anulan, no sale ni ingreso ni resto. |
| Queda y el botón miraban números distintos sin decirlo. | Siguen mirando números distintos, y ahora cada uno tiene un papel: el botón mueve la pieza suelta; Queda dice cuánto queda contando los platos. |

## Límites que siguen

- El último eslabón de la cascada puede dejar la pieza en negativo. No hay un piso en cero para esa resta.
- Queda, el gráfico y Transformar no muestran el mismo alcance de hijos. Queda suma platos directos; el gráfico suma todos los niveles; Transformar no suma hijos.
- El conteo de cámara cambia Queda y Stock, y no cambia el tope para transformar.
- La reserva de un producto no quita el plato de la carta. Solo baja el tope para transformar ese producto. El plato deja de salir en la carta cuando el bloqueo es del plato.
- Si al abrir la hoja `GET /api/inventario/relaciones` falla, no se reintenta el guardado ni sale el aviso. El vínculo local se conserva. El aviso de la hoja (`toastMessage`) está fijo abajo a la izquierda y se borra a los 7 segundos.

## Funciones que mueven el stock

| Función | Qué hace |
| --- | --- |
| `calcSaldoTipo` | Saldo de una fila y un tipo: anterior + ingreso + corrección − venta − transformación + cubierta. |
| `stockCuadro` / `quedanDe` | Saldo de fórmula con piso 0. Es el número de la caja y el tope del pase. |
| `saldoRealColumna` | Queda: saldo real de la fila más el de los platos directos. |
| `transferir` | Pase origen → destinos. Niega el pase si el origen está bloqueado o si el stock menos la reserva no alcanza. |
| `fijarStockDirecto` | Deja el crudo de la caja en el número escrito. El cocido no se crea: llama a `pasarCrudoACocido`. |
| `fijarSaldoTipo` | Lo mismo para el lápiz, en crudo o en cocido, guardado en el día. |
| `fijarCampo` | Edita una columna de la tabla. En el ingreso de pollo fresco, convierte solo el delta. |
| `setPollosFrescosConvertir` | Lleva el neto «Pasa a piezas» al número pedido. |
| `pasarCrudoACocido` | Mueve crudo ↔ cocido de la misma fila. No entra en Transformación. |
| `confirmarVentaManual` | Resta por unidad o por plato. Se detiene si el producto está bloqueado. |
| `aplicarKardex` | Pinta columnas desde el kardex y separa los `Pasa a …` en Transformación. |
| `aplicarBloqueo` / `filtrarCartaBloqueada` | Guarda el bloqueo. La carta del mozo no incluye los platos bloqueados. |
