# Plan: ingreso crudo arriba, cocido abajo, y venta en cascada

**Estado:** no implementado. Este documento es la especificación para implementar.  
**Pantalla:** `Backend-LasGambusinas/public/inventario.html`  
**App:** `inventarioApp()` en Alpine.js.  
**No cambiar:** Transformar, venta especial, el día operativo 04:00–04:00, ni el envío de comandas. La venta no se bloquea por saldo.

Reemplaza la pestaña **Crudo y cocido**. El cocido deja de ser un reparto del mismo ingreso y pasa a ser un segundo cuadro de ingreso, debajo del crudo, solo en los productos que Configuración lo permita.

## Qué hay hoy

En Inventario Tabla cada fila tiene un solo stepper de Ingreso (`stepField` / `updateIngresoDirecto`). Ese stepper solo cambia el estado local: no hace `POST`.

La pestaña Crudo y cocido (`activeTab === 'crudo_cocido'`, `cuadrosCrudo`, `ajustarCrudoCampo`, `fijarCrudoCampo`, `sincronizarIngresoDesdeCrudo`) parte el mismo saldo de la fila en dos números. `crudo + cocido` empuja el ingreso de esa fila. No son dos stocks.

El kardex del backend ya separa cada rubro en `tipoProducto: 'crudo'` y `tipoProducto: 'cocido'` (`src/utils/inventarioKardex.js`). La hoja los vuelve a sumar en `aplicarKardex`.

Las ventas de comandas salen de `src/utils/inventarioSalidaVentas.js` (`egresosVentaHasta`). Hoy todas se anotan como egreso `cocido` del rubro mapeado. No se guardan: el kardex las suma al armar el día. `aplicarSaldoPrevioDeVentas` resta las ventas anteriores solo del cocido.

El saltado de pollo hoy no usa el rubro `salt-pollo`. En `src/utils/inventarioMapas.js` el plato «Lomo saltado de pollo» cuelga de `filete` con `venta: true`. `consumoDeFila` gana al `else if` de `salt-pollo`, así que la venta baja `filete` como cocido.

Claves de la hoja (`claveDeFila` en `inventario.html`):

| Fila | Clave |
|---|---|
| Pollo fresco | `pollo-origen` |
| Pechuga de Pollo | `pechuga-pollo` |
| Pierna de Pollo | `pierna-pollo` |
| Filete Pollo Crudo | `filete` |
| Pollada | `pollada` |
| Pollo pachamanca | `pachamanca-pollo` |
| Lomo saltado de pollo | `salt-pollo` |

`PUT /api/inventario/rubros/:clave` guarda umbrales en `inventario_rubros` (`crudo`, `cocido` numéricos). No hay bandera de “este producto tiene cuadro cocido”.

## Resultado

1. La pestaña Crudo y cocido desaparece.
2. En la columna Ingreso, el cuadro de arriba es Crudo. Si el producto tiene cocido habilitado, debajo va otro cuadro igual, etiquetado Cocido.
3. Configuración enciende o apaga ese cuadro por producto, y elige de qué materia se resta si el producto se queda sin saldo.
4. Una venta resta en este orden: cocido del producto, luego crudo del producto, luego la materia de reserva. Solo el último eslabón puede quedar negativo.
5. Pollo fresco, Pechuga de Pollo, Pierna de Pollo y Filete Pollo Crudo no tienen cuadro cocido. Solo se transforman.

## Materia: sin cocido

Estas claves son materia. No muestran cuadro cocido. Configuración no puede activárselo. Una venta que cae en ellas solo mueve `tipoProducto: 'crudo'`.

- `pollo-origen` — Pollo fresco
- `pechuga-pollo` — Pechuga de Pollo
- `pierna-pollo` — Pierna de Pollo
- `filete` — Filete Pollo Crudo

Filete Pollo Crudo no tiene variante cocido. Los platos que salen de filete (saltado, milanesa, chaufa de pollo, chicharrón) no convierten el filete en cocido: el filete solo entra como último recurso, en crudo.

Pollada y Pollo pachamanca no son materia. Nacen por Transformar (pechuga y pierna ya salieron de su fila al pasar a la hoja). La venta de esos platos no vuelve a restar pechuga ni pierna.

## Cuadros de ingreso

Misma fila de producto. La celda Ingreso apila los cuadros. El de arriba siempre existe.

```
Crudo   [ − ] [ 4 ] [ + ]
Cocido  [ − ] [ 2 ] [ + ]    solo si tieneCocido
```

- Mismo estilo que el stepper actual (`.caja-clara`, − / input / +).
- Etiqueta corta a la izquierda: «Crudo» o «Cocido».
- Aplica en filas de grupo y en filas sueltas.
- Producto sin `tieneCocido`: un solo cuadro, sin etiqueta, como hoy. Sigue siendo ingreso crudo.
- Los chips de Ingreso de la pestaña Transformar no ganan cuadro cocido. Ahí la materia entra en crudo.

Cada cuadro es el ingreso del día de ese tipo, no una parte de un total único.

Al cambiar el número se guarda el delta con `POST /api/inventario/movimientos`:

| Cuadro | tipoProducto | clase | motivo |
|---|---|---|---|
| Crudo | `crudo` | `ingreso` | `Ingreso crudo` |
| Cocido | `cocido` | `ingreso` | `Ingreso cocido` |

Cantidad = valor nuevo − valor anterior. Si baja, la cantidad del ingreso es negativa (el kardex ya suma `clase: ingreso` con signo). No usar la pestaña vieja ni `sincronizarIngresoDesdeCrudo`.

`aplicarKardex` deja de sumar los dos tipos en `row.ingreso`.

- `row.ingreso` = ingresos del crudo.
- `row.ingresoCocido` = ingresos del cocido (0 si no hay cuadro).
- Saldo anterior, venta, saldo y queda se leen por tipo.

En una fila con cocido, esas cuatro celdas muestran dos líneas, crudo arriba y cocido abajo, con las mismas etiquetas. Corrección, transformación y conteo siguen siendo un solo control y se guardan en crudo. El círculo de la fila usa la suma de los dos saldos reales: verde o rojo con la regla actual.

Fórmulas, por tipo:

```
ingreso total = saldo anterior + ingreso + corrección
saldo         = ingreso total − venta − transformación
saldo real    = conteo, si hubo conteo de ese tipo; si no, el saldo
```

La corrección y el conteo únicos aplican solo al crudo. El cocido lleva corrección 0 y sin conteo propio. No hay piso en 0 en el último eslabón de una venta. El día sigue siendo el ciclo `04`.

## Configuración

Dentro del modal que ya abre Configuración (`showConversionesModal`), una sección nueva: **Cuadro de cocido**.

Una fila por producto de la hoja que no sea materia:

- Checkbox **Cuadro cocido**. Apagado: la tabla muestra un solo ingreso.
- Select **Si no hay saldo, restar de**. Opciones: «Ninguno» o una clave de materia (`pollo-origen`, `pechuga-pollo`, `pierna-pollo`, `filete`). Eso es `reservaClave`. Vacío si es «Ninguno».
- Las cuatro materias salen en la lista deshabilitadas, con el texto «Solo se transforma».

Guardar con el `PUT /api/inventario/rubros/:clave` que ya existe. El body suma:

```json
{ "tieneCocido": true, "reservaClave": "filete" }
```

Validar en el servidor:

- Si la clave es materia, `tieneCocido` queda `false` y `reservaClave` queda `''`.
- `reservaClave` vacío o una de las cuatro materias. Cualquier otra clave responde 400.
- No se borra el umbral `crudo` / `cocido` que el endpoint ya guarda.

Semilla la primera vez que no haya documento, o al leer si el campo no existe:

| Clave | tieneCocido | reservaClave |
|---|---|---|
| `pollada` | true | `''` |
| `pachamanca-pollo` | true | `''` |
| `salt-pollo` | true | `filete` |
| resto, incluida toda materia | false | `''` |

`GET /api/inventario/kardex?carta=1` incluye `cocidoOpciones`: lista `{ clave, tieneCocido, reservaClave }` de los rubros guardables. La hoja pinta el segundo cuadro con eso.

Modelo `src/database/models/inventarioRubro.model.js`:

- `tieneCocido`: Boolean, default false
- `reservaClave`: String, default `''`

## Venta en cascada

Una unidad vendida sigue valiendo lo que ya vale el mapa (factor o unidades). Lo que cambia es de qué balde sale.

Cadena del rubro vendido, de arriba a abajo:

1. `{ rubro, tipo: 'cocido' }` solo si `tieneCocido`.
2. `{ rubro, tipo: 'crudo' }` siempre.
3. `{ reservaClave, tipo: 'crudo' }` solo si `reservaClave` no está vacío.

Si el rubro es materia, la cadena es solo `{ rubro, tipo: 'crudo' }`.

Ejemplo pedido. Existen tres baldes: Filete Pollo Crudo, Salt de pollo crudo y Salt de pollo cocido. Se vende un saltado de pollo:

1. Si el cocido de `salt-pollo` tiene saldo disponible mayor que 0, resta de ahí.
2. Si el cocido no tiene ingreso ni saldo, resta del crudo de `salt-pollo`.
3. Si el crudo tampoco tiene, resta de `filete` en crudo.

«Tiene datos» = el disponible de ese balde es mayor que 0. El saldo anterior cuenta como saldo aunque el ingreso de hoy sea 0. Si el disponible es 0, ese balde se salta.

El disponible de un balde, antes de repartir las ventas del día:

```
base = saldo anterior + ingresos del día + corrección − transformación − egresos manuales
disponible = max(0, base)     en todos los eslabones menos el último
```

Las ventas del día se recorren por hora de comanda (`createdAt`). Cada venta recorre la cadena:

- En un eslabón que no es el último, toma `min(lo que falta, disponible)` y baja ese disponible.
- Lo que sobra pasa al siguiente.
- En el último eslabón toma todo lo que falta, aunque la base quede negativa.

Así 4 saltados con cocido 2, crudo 3 y filete 10 restan 2 cocidos y 2 crudos. El filete no se mueve. Un quinto saltado resta el crudo que quedaba. Cuando crudo y cocido están en 0, el siguiente saltado resta filete. Si el filete está en 0, queda en −1 y puede seguir bajando.

La venta que cae en filete se ve en la fila Filete Pollo Crudo, no en el cocido del saltado. El detalle de la venta (modal de la lupa) conserva el nombre del plato y la comanda, en el rubro y el tipo que de verdad bajaron.

Pollada con el cuadro cocido y sin reserva: la venta resta pollada cocido y, si no alcanza, pollada crudo. No toca pechuga, pierna ni filete. Esos cortes ya se movieron en Transformar.

Venta manual (botón rojo de la fila) usa la misma cadena contra el saldo de ese momento, no fuerza `cocido`.

Lo que no cambia: la venta no se escribe como movimiento permanente. Sigue siendo un egreso calculado. Si anulan la comanda, desaparece. El reparto sí distingue rubro y tipo, así que `egresosVentaHasta` deja de emitir todo como `cocido`.

Las ventas de días anteriores también se reparten con esta cadena, en orden, para que `aplicarSaldoPrevioDeVentas` baje el tipo correcto y el saldo anterior de hoy ya venga neto. Hoy esa función resta todo del cocido: hay que cambiarla.

Función pura nueva, `src/utils/inventarioCascadaVenta.js`:

```javascript
repartirVenta(cantidad, cadena, bases)
// cadena: [{ rubro, tipo }]
// bases: mapa mutable 'clave|tipo' -> número
// devuelve [{ rubro, tipo, cantidad }] con cantidad > 0
```

`esMateria(clave)` vive ahí, con las cuatro claves de arriba.

`egresosVentaHasta` arma las bases con los movimientos guardados hasta el final de cada día, reparte cada comanda en orden y empuja egresos virtuales `{ rubro, tipoProducto, clase: 'egreso', cantidad, fecha }`. `aplicarVentasEnFilas` en el kardex aplica la venta al tipo que diga el egreso, no solo al cocido.

El mapa de nombres no se invierte: el saltado sigue reconociéndose como plato. El rubro de la venta del saltado pasa a ser `salt-pollo` (su propia fila), y `filete` entra solo como `reservaClave`. Quitar el atajo que manda el saltado directo a `filete` cuando el mapa lo cuelga de filete con `venta: true`. El factor (1 saltado = 1) se conserva. Los otros platos colgados de filete (milanesa, chaufa de pollo, chicharrón) usan su propio rubro de la hoja si existe (`milanesa`, `chaufa-pollo`, `chi-pollo-bbq`, …) con la misma cadena; filete solo si ese rubro tiene `reservaClave: 'filete'`. No activarles el cuadro cocido en la semilla.

## Archivos

| Archivo | Cambio |
|---|---|
| `public/inventario.html` | Quitar pestaña y sección Crudo y cocido. Apilar cuadros en Ingreso. Dos líneas de saldo en filas con cocido. Sección en el modal de Configuración. Persistir el delta del ingreso. Venta manual por la cadena. |
| `src/database/models/inventarioRubro.model.js` | `tieneCocido`, `reservaClave`. |
| `src/repository/inventario.repository.js` | Validar y guardar las dos campos en `guardarUmbralRubro`. Devolver `cocidoOpciones` en el kardex de carta. Repartir ventas previas por tipo. |
| `src/utils/inventarioCascadaVenta.js` | Nuevo. `esMateria`, `cadenaDe`, `repartirVenta`. |
| `src/utils/inventarioSalidaVentas.js` | El saltado y los platos de filete salen por su rubro. Los egresos virtuales llevan el tipo que devolvió la cascada. |
| `src/utils/inventarioKardex.js` | `aplicarVentasEnFilas` aplica cada venta a su `tipoProducto`. |
| `tests/inventario-salida-ventas.test.js` | El caso del chaufa de pollo que espera `filete` pasa a esperar `chaufa-pollo` salvo que la reserva esté puesta y el crudo de ese rubro esté en 0. |
| `tests/inventario-cascada-venta.test.js` | Nuevo. Casos de abajo. |

No crear otro documento. No añadir pestañas.

## Casos que tienen que pasar

Disponible antes de la venta: cocido saltado 2, crudo saltado 3, filete 10. Cadena con reserva `filete`.

| Se vende | Cocido saltado | Crudo saltado | Filete |
|---|---|---|---|
| 1 saltado | −1 | 0 | 0 |
| 4 saltados | −2 | −2 | 0 |
| 6 saltados | −2 | −3 | −1 |
| 1 saltado con cocido 0 y crudo 0 | 0 | 0 | −1 |
| 1 saltado con cocido 0, crudo 4 | 0 | −1 | 0 |
| 1 saltado con ingreso cocido 0 y saldo anterior cocido 5 | −1 | 0 | 0 |

Más:

- `filete` con `tieneCocido: true` en el PUT queda guardado en false.
- Pollada con cocido 1 y crudo 0, sin reserva: 1 pollada resta el cocido. Una segunda resta el crudo y lo deja en −1. Pechuga y pierna no cambian.
- Venta manual de 1 saltado con cocido 1 resta el cocido.
- Apagar el checkbox de pollada oculta el cuadro de abajo y la cadena ya no incluye cocido.
- Anular la comanda devuelve la unidad al balde que la había perdido.

## Fuera de este cambio

- No partir una pollada entre pechuga y pierna al vender.
- No mover solo por la hora exacta del ingreso contra la hora de la comanda: los ingresos del día entero están disponibles para las ventas de ese día. El orden que sí importa es el de las comandas entre sí.
- No dar cuadro cocido a arroz crudo, carnero, panceta, pato fresco ni a sus cortes de despiece en esta entrega. Si más adelante uno de esos se cocina y se vende aparte, se habilita con la misma bandera, fuera de la lista de materia.
