# Guía de Inventario — Las Gambusinas

La pantalla del restaurante se sirve desde [public/inventario.html](../public/inventario.html). El backend guarda los movimientos y calcula el kardex con las ventas de comandas.

**Regla de mantenimiento. Nunca modificar el código de Transformar.** Es la sección esencial del inventario. La regla abarca el bloque `#panel-transformar`, sus estilos, sus eventos, los mapas y las funciones que usa para calcular y guardar stock, ingresos, pases, cortes y descargas. Antes de editar una función compartida, verifica sus llamadas. Si la usa Transformar, implementa el cambio en la vista que lo necesita. Esta guía documenta los controles existentes.

El día operativo va de **04:00 a 04:00** en Lima. Inventario Tabla, Transformar y Gráfico tienen selectores de período independientes. Tabla y Transformar consultan el mismo kardex para su respectivo rango.

## Dos números distintos

Cada fila tiene su cuenta. La pantalla la enseña de dos maneras, y las dos son correctas.

| Número | Dónde se ve | Qué incluye |
| --- | --- | --- |
| Queda | Columna Queda, caja de Transformar, lápiz, pestaña Stock y tope del **+** | Lo que hay en esa fila. Es un solo número en toda la pantalla. |
| Total del grupo | Número principal de Saldo ant., Ingreso, Ingreso total, Transformación y Queda en Pecho, Pierna, Filete y Octavo | La fila más los platos que cuelgan de ella. La lupa muestra cuánto tiene cada uno. El Estado se mide con este número. |

En Pierna de pollo, **Ingreso total** suma el saldo anterior visible del grupo y el ingreso propio de Pierna. Si el saldo anterior es 97 y entran 40 piernas que luego pasan a Pollada, la fila de Pierna muestra 137. La lupa muestra ese cálculo y el desglose por producto, que incluye el ingreso recibido por Pollada.

Un pecho con Queda 13 en la tabla y 11 en su lupa tiene 11 de pieza suelta y 2 ya pasados a platos. El **+** solo puede mover los 11.

El historial de la unificación del kardex está en [LOGICA_INVENTARIO.md](LOGICA_INVENTARIO.md). Para mantener la pantalla, usa la descripción vigente de esta guía y el código de la versión servida.

En la vista **Pachamanca**, Pecho pachamanca y Pollo pachamanca pierna se muestran solos: Queda no les suma el padre ni los hermanos.

## La cuenta de cada fila

Productos con cocido llevan dos líneas (crudo y cocido). El resto solo crudo. La fórmula es de esa fila, sin los hijos.

```
Saldo anterior = Lo que quedó el día anterior (+ ajuste de apertura, si alguien lo hizo)
Ingreso total  = Saldo anterior + Ingreso
Queda          = Ingreso total − Venta − Transformación + Cubierta + Corrección
Diferencia     = Lo contado − lo que había en ese momento
```

La cubierta es la parte de una venta que no alcanzó a salir del plato y salió de la pieza de reserva. Esa parte baja la pieza y no vuelve a bajar el plato.

Corrección reúne las regulaciones y ajustes que quedan fuera de Ingreso total. Un conteo deja el stock en lo contado y las ventas posteriores siguen restando. Si Queda da menos de 0, se muestra 0 con el faltante al lado. Al día siguiente abre en 0.

Estado, leído sobre el grupo (fila + platos directos):

| Queda | Estado |
| --- | --- |
| Más de 10 | Normal |
| De 6 a 10 | Bajo |
| 5 o menos | Crítico |

No se suma un total de pollos + piernas + pechos + filetes. Cada fila tiene su propia unidad. Los grupos tampoco suman entre sí.

## 1. Inventario Tabla

Hoja de producción del período. Es la fuente de verdad.

### Qué se puede hacer

- Elegir el período: hoy, ayer, 7 días, 30 días, este mes, 1 año o un rango.
- Buscar por nombre y filtrar por categoría. El filtro **Pachamanca** deja solo los sabores (pollo, carne, carnero, cerdo y humita).
- Abrir o cerrar los grupos. Imprimir la hoja. Abrir el reporte del día. Poner en cero los movimientos de hoy (el saldo anterior se conserva).
- Abrir **Bloqueo de inventario** (icono de candado). Ver la sección 6.
- Entrar a Configuración (factores de pollo, arroz, carnero, aderezos y columnas de la hoja) y al color de fondo de las filas.
- El lápiz de una fila abre el mismo editor de stock que el lápiz de Transformar. El número que se guarda es el saldo que se ve en las dos pantallas.

### Columnas

| Columna | Qué hace |
| --- | --- |
| Producto | Nombre, unidad y lugar en el grupo. |
| Saldo ant. | Lo que quedó en esta fila el día anterior. Sale en ámbar si tiene un ajuste de apertura. |
| Ingreso | Lo que entró a esta fila: compra, despiece o pase desde otro producto. |
| Corrección | Regulaciones de la fila, ajustes por conteo y la parte de una edición que no puede aplicarse a la apertura. |
| Ingreso total | Saldo anterior + Ingreso de esta fila. La lupa muestra la suma y en qué platos o cortes quedó. |
| Venta comandas | Un total por producto, igual al detalle de la lupa. Incluye los platos vinculados que aparecen en ese detalle. El modal indica cuánto se descontó de la fila. El botón **DM** abre la descarga manual. |
| Transformación | Lo que salió de esta fila hacia otro corte o plato. En rojo si resta. No incluye a los hijos. La lupa abre el gráfico vertical (origen arriba, destinos abajo). |
| Saldo | Resultado de la fórmula de esta fila. Se puede ocultar. |
| Conteo | Conteo físico de cámara de esta fila. Vacío si nadie contó. |
| Queda (Saldo real) | Lo que hay en esta fila. Mañana es su Saldo anterior. Debajo, el total con sus platos. |
| Diferencia | Lo que encontró el último conteo frente a lo que había en ese momento. Se puede ocultar. |
| Estado | Normal, bajo o crítico, según Queda. Se puede ocultar. |

En Configuración → Tabla puedes ocultar Saldo y Conteo, Diferencia, Estado, Corrección, Transformación, los indicadores de Ingreso Total y determinadas filas. En **Cuadros de Transformar** puedes ocultar el resumen de mapas y los controles de Ingreso. Estas preferencias se guardan en el navegador.

Al sumar o restar el **Ingreso** de Pollo fresco, solo se convierte ese cambio: 1 pollo que entra sale en Transformación y entran 2 pechos y 2 piernas, igual que el **+** de Transformar. El pollo que entra se convierte entero aunque el saldo del fresco estuviera en 0 o en negativo. No se vuelve a cortar el ingreso que ya estaba. Al bajar el ingreso, se devuelven los pollos que todavía tienen su pecho y su pierna en la hoja. Si ya se usaron, solo baja el ingreso del fresco y sale un aviso. Si Pollo fresco está bloqueado, el ingreso se guarda pero no pasa a piezas.

Mix leña pecho usa la misma fila que Pecho leña. Mix leña pierna y los cuartos de leña no se suman otra vez al padre.

### Crudo y cocido

Si el producto tiene cocido, cada columna se parte en crudo y cocido. El pase **Crudo → Cocido** mueve unidades del crudo al cocido del mismo producto. No crea stock nuevo y no entra en la columna Transformación.

Cada movimiento se guarda con la hora real. El backend reparte la venta en orden de hora, contra el saldo que iban dejando los pases. Si a las 9:00 se pasa pecho de pato a cocido y a las 10:00 entra una comanda, la venta resta ese cocido.

Orden en que una comanda resta:

1. Cocido del plato, aunque la fila esté marcada solo crudo.
2. Crudo del plato.
3. Si sigue faltando y el plato tiene reserva, la pieza de reserva. En el carnero, primero el cocido del carnero y después el crudo.

La venta manual usa la misma cadena, y el cocido entra solo si esa fila tiene cocido. El último eslabón absorbe lo que falte, aunque la pieza quede negativa.

Casos con cadena propia:

| Venta | Orden en que resta |
| --- | --- |
| Pollo de pachamanca (sabor) | Cocido de Pollo pachamanca pierna, cocido de Pecho pachamanca, crudo de pierna pachamanca, crudo de pecho pachamanca y, al final, Pierna de Pollo. |
| Mix de pecho a la leña | Cocido de Pecho leña, crudo de Pecho leña y, al final, Pecho de Pollo. |
| Seco de carnero o de cordero | Cocido de Seco de carnero, crudo de Seco de carnero, cocido de Carnero Crudo y, al final, crudo de Carnero Crudo. |
| Filete junior | 0,5 filete crudo por plato. El filete de la carta cuenta 1 filete crudo. |

### Venta manual

El botón **DM** de Venta comandas abre el modal. Tiene dos pestañas:

- **Por unidad**: resta unidades del producto con la misma cadena (cocido, crudo y reserva).
- **Por plato vinculado**: se elige un plato y cuántos se vendieron. Salen los platos con fila propia que cuelgan del producto y los platos de la carta vinculados en Relación de platos. Un plato con fila propia gasta su cocido, su crudo y lo que falte sale del producto. Un plato de la carta resta *platos × lo que come* del producto. Antes de confirmar se ve qué va a restar.

Queda anotada como venta, no como transformación.

### Grupos de la hoja

Pollo fresco, pato fresco, panceta, carnes, trucha, carnero, arroz, gaseosas, licores y bebidas. Lo que no entra en un grupo queda como fila sola (pieza de pescado, pieza de pota, cuy, papas, y otros ingresos directos).

## 2. Transformar

Mapa de izquierda a derecha. Sirve para partir un producto en cortes o platos.

Cada **+** / **−** se guarda en el momento, con la hora real. El origen anota una salida (`Pasa a …`) y el destino anota una entrada (`Sale de …`). Al recargar, la hoja separa esa salida en la columna Transformación y deja el Ingreso como el bruto (compras y entradas), sin contarla dos veces. Los números de los cuadros salen de esos movimientos.

El tope es el **stock de hoja** crudo del origen. Si el pecho tiene 13 de pieza suelta, se pueden transformar hasta 13. No mira Queda, ni los platos hijos, ni el conteo de cámara. Si no alcanza, el aviso ámbar detiene el paso. Al devolver, no se devuelve más de lo que pasó en el período ni más de lo que el destino tiene.

### Qué muestra cada caja

- El número grande es el **stock actual** de esa fila (crudo, o cocido en su propia caja).
- Toca un campo numérico para abrir el teclado en pantalla. Usa **+** o **−** para ajustar la cantidad y pulsa **Aplicar** para guardar. El sonido usa el interruptor de Configuración.
- Debajo, **+N ingreso hoy** o **−N resto hoy** es el neto del turno (04:00 a 04:00, o el tramo día/noche si el período es un tramo). Sumar 1 y restar 1 deja el neto en 0 y no muestra ninguna de las dos líneas.
- **Ingreso** muestra la entrada independiente acumulada del período. Cambiar de 1 a 2 añade la diferencia de 1. Poner 0 revierte ese ingreso. Se conserva al recargar y cada período muestra su propio dato.
- Las cajas vinculadas a Ingreso ajustan la existencia escrita. Al bajar una cantidad, primero reducen el ingreso independiente disponible y llevan el resto a Corrección. Al subirla, aumentan ese ingreso.
- Los controles de conversión identificados como pases descuentan del origen y registran la entrada del destino. **Crudo → Cocido** mueve stock entre tipos del mismo producto. Los factores de filete, octavo y demás cortes pertenecen a los pases.

**Pasar a la hoja** espera a que terminen de guardarse los pases, recarga el kardex y abre Inventario Tabla. No copia contadores: el pase ya estaba guardado.

En pecho y pierna, la cuenta del cuadro es la misma historia: stock antes = queda + transformación del período; lo que salió; lo que queda.

### Pollo fresco

1 pollo fresco = **2 pechos** + **2 piernas** (los factores se cambian en Configuración). Pierna y pecho no se suman entre sí. Si el pollo se compra ya cortado, el ingreso se anota directo en Pecho o en Pierna y no hace falta convertir fresco.

- El **+** del stock de Pollo fresco suma ese pollo y, en el mismo paso, lo convierte: el saldo de fresco no se queda con el ave entera y además con las piezas. Pecho +2 y pierna +2.
- El **+** / **−** chico junto al factor convierte o devuelve un fresco del período, sin cambiar el ingreso de compra.
- En la tabla, el **+** / **−** del Ingreso de Pollo fresco convierte solo los pollos de ese clic. No multiplica otra vez todo el stock.

### Lápiz de stock

El mismo modal sirve en Transformar y en Inventario Tabla.

- El número escrito es el stock que queda en esa fila (crudo, y cocido si la fila lo tiene).
- El editor recalcula Saldo anterior para alcanzar el stock escrito, conservando el ingreso y las ventas del período. Si el saldo anterior llega a cero, aplica el resto mediante Corrección. Ingreso total sigue siendo la suma de Saldo anterior e Ingreso.
- El ajuste de apertura se fecha al inicio operativo del período consultado.
- El lápiz de Octavo conserva las marcas de pecho y pierna. Los pases de piezas a octavos tienen sus propios controles.
- En la tabla, el lápiz de la fila Octavo de pollo abre ese mismo modal: pecho, pierna y debajo sus platos (Arroz con pollo, Pollo a la olla, Caldo de pollo).
- Un producto bloqueado se puede corregir con el lápiz. No se puede transformar ni vender en manual mientras siga bloqueado.

### Pecho de pollo

Sale del fresco o de un ingreso directo.

- A **filete**: 1 pecho = el factor configurado (por defecto 1 filete). El tope de los platos de filete es el stock de hoja del filete, aunque ese filete haya entrado por compra. Filete junior come 0,5 filete.
- Al cuadro de pecho: **Pecho leña**, **Sandwich** y **Pecho pachamanca**. 1 pecho = 1 pieza. Pecho pachamanca tiene crudo y cocido.
- A **octavo de pollo**: 2 octavos restan 1 pecho. El tope de los platos del octavo es el stock de hoja del octavo, aunque venga de un día anterior.

### Pierna de pollo

Sale del fresco o de un ingreso directo.

- Al cuadro de pierna: **Pollo pachamanca pierna**, **Pierna a la leña** y **Pollada**. 1 pierna = 1 pieza.
- A filete solo si en Configuración el factor pierna → filete es mayor que 0. Si está apagado, el cuadro dice «Pierna a filete está apagada en Configuración».
- A **octavo de pollo**: 2 octavos restan 1 pierna. Se elige el origen con **Desde pecho** o **Desde pierna**.

### Octavo de pollo

| Plato | Pase a cocido |
| --- | --- |
| Arroz con pollo | Crudo y cocido |
| Pollo a la olla | Crudo y cocido |
| Caldo de pollo | Crudo y cocido |

1 octavo = 1 porción de esos platos. La venta de Arroz con pollo, Pollo a la olla y Caldo de pollo se ve en la columna Venta comandas de Octavo de pollo, y también en la fila de cada plato. El stock de cada plato se reparte entre lo que vino de pecho y lo que vino de pierna.

Subir el número de **Cocido** descuenta esa diferencia del **Crudo** del mismo plato y corte. Al bajar el número, la diferencia vuelve al crudo. Los cortes se conservan al recargar y al pasar al siguiente día operativo.

En los cuadros de **Beata**, **Personal**, **Evento** y **Rio Lindo**, separa los octavos por pecho o pierna. Pulsa **Descargar** para revisar las cantidades y, si quieres, escribir el motivo. Al confirmar, la descarga se registra en **Venta comandas** de Octavo de pollo y en **Auditoría**, con el motivo escrito.

Después de descargar, los cuadros de pecho y pierna del sector quedan en **0**. En **Venta comandas**, pulsa **Eliminar** sobre la descarga para revertirla. Las piezas vuelven a quedar separadas en el mismo sector y corte. Puedes descargarlas de nuevo desde Transformar.

### Otras familias

| Origen | Regla |
| --- | --- |
| Pato fresco | 1 pato = 2 pechos de pato y 2 piernas de pato. Pecho y pierna de pato tienen Crudo → Cocido. |
| Panceta | Tres cuadros: **Panceta entera → Tira de panceta → Trozo de panceta**. La caja de la entera es el stock. «Pancetas a tiras» resta 1 panceta y suma 6 tiras. «Tiras usadas» resta tiras. **Pieza de panceta** es solo cocido: su stock = piezas que salieron de las tiras − piezas usadas en ventas ± corrección. En la caja «Stock», + suma piezas que salieron (pide tiras usadas antes). − primero quita piezas que salieron en el período; si el stock viene del saldo anterior, el resto va a Corrección cocido. No deja anotar piezas sin tiras usadas, ni devolver una panceta cuyas tiras ya se usaron. |
| Pieza de pescado | Entra directo. Ocupa el lugar del origen en el mapa. Los platos vinculados restan la pieza. |
| Pieza de pota | Entra directo. Ocupa el lugar del origen en el mapa. Los platos vinculados restan la pieza. |
| Carnero | **Carnero pachamanca** (1 carnero = el factor configurado, por defecto 1) y **Seco de carnero** (1 a 1). Los dos tienen crudo y cocido. El tope es el stock de hoja del carnero. |
| Arroz crudo | Blanco y verde + pato reciben porciones mediante **Transformar**. Con los factores base, 1 kg rinde 8 porciones de blanco o 6 de verde. El peso se muestra al gramo y el destino conserva las porciones ingresadas. Por ejemplo, 5 porciones de verde descuentan 0,833 kg y suman 5 porciones. Beata y Rio Lindo manejan kilos según su factor. |
| Carnes, trucha, cuy, papas y similares | Entran directo. No se despiezan en este mapa. |

El **editor de mapas** crea o ajusta familias nuevas. Esas familias usan la misma regla: el origen no pasa de su stock de hoja y el destino suma, sin borrar el ingreso que ya tenía. El mapa de pollo fresco de esta pantalla es el mapa fijo descrito arriba.

## 3. Relación de platos

Dice qué plato de la carta come qué producto del inventario, y cuánto. No mueve el stock por sí sola. La venta de la comanda descuenta según esa relación y según la reserva crudo/cocido.

Al abrir la pestaña, los platos activos de la carta que todavía no tienen vínculo se proponen solos por el nombre. Lo que se agrega, se edita o se quita a mano queda guardado en el servidor. Recargar la hoja no lo borra. Un vínculo quitado no vuelve a aparecer solo; solo regresa si se vuelve a vincular.

Una guarnición (yuca, papa, arroz) solo resta inventario si el mozo la eligió en la comanda. En la relación se lee «Solo si el mozo elige Yuca frita». Si elige arroz y papa, baja arroz y papa, y la yuca no se mueve. Si el plato trae la yuca escrita en el nombre y no es una guarnición para elegir, sí resta siempre.

### Tres vistas

| Vista | Para qué |
| --- | --- |
| Estudio unido | Un producto a la vez. Se ve el mapa, los platos vinculados y se edita la cantidad. |
| Mapa despiece | Todos los mapas, de origen a cortes y platos, con el factor y lo que descuenta cada plato. |
| Matriz | Una tarjeta por producto, con sus platos y la cantidad que restan. |

Arriba se filtra por familia (pollo, panceta, arroz, pachamanca, bebidas y el resto).

Un vínculo se lee así: plato de la carta, producto del inventario, cantidad (1 pieza, 0,5 filete, 2 filetes, etc.).

## 4. Stock

Lista corta de lo que queda en el período. No se edita aquí y no hay un gran total, porque mezcla pollos, piezas, porciones y bebidas.

- Una tarjeta por grupo.
- Una tarjeta de filas solas, para lo que no tiene grupo.
- El número es **Queda** (saldo real de la fila más platos directos), no el stock de hoja de Transformar.
- La unidad se muestra al lado del número.

Para cargar, transformar, vender o contar se usa Inventario Tabla o Transformar.

## 5. Gráfico de inventario

Ingreso, ventas y saldo del período, día por día. Se puede ver toda la hoja o un solo producto. Si el rango es largo, el gráfico dibuja los últimos 14 días y el saldo del período queda en la tarjeta. Cambiar sus fechas conserva las fechas de Tabla y Transformar.

El saldo de esta pestaña suma también los platos que cuelgan más abajo de la fila. Queda, en la tabla, suma solo los platos directos. Por eso los dos números pueden diferir en un padre con varios niveles (fresco → pecho → filete → milanesa).

## 6. Bloqueo de inventario

Icono de candado en la barra. **Aplicar bloqueo** guarda la lista en el servidor y en este navegador. El conteo por fila sigue en la columna Conteo.

- Pestaña **Productos**: lo que queda, una caja **Reservar** y un interruptor **Bloquear**. La fila bloqueada se marca en la tabla. Si el producto tiene cocido, se reserva por separado **Crudo** y **Cocido**, cada uno con su «Libre».
- **Pollo fresco** no se reserva ni se bloquea. **Pecho de pollo**, **Pierna de pollo** y **Octavo de pollo** tampoco se reservan como pieza: salen como un cuadro con sus platos (Pecho leña, Sandwich, Pecho pachamanca; Pollo pachamanca pierna, Pierna a la leña, Pollada; Arroz con pollo, Pollo a la olla, Caldo de pollo), cada uno con lo que queda y su propia reserva y bloqueo.
- La reserva de crudo baja el tope de lo que se puede transformar y de lo que pasa de crudo a cocido. La reserva de cocido no se puede devolver a crudo.
- Pestaña **Platos de la carta**: un interruptor **Bloquear** por plato. Ese plato deja de salir en la carta de los mozos.
- **Reservar** aparta unidades. Esa cantidad no se puede transformar: el tope del pase es el stock de hoja menos la reserva.
- **Bloquear** un producto impide transformarlo y venderlo en manual desde la hoja. El lápiz sigue pudiendo corregir el saldo.
- **Duración**: 1, 3 o 6 horas, fin del turno (04:00), 1 o 3 días, 1 o 2 semanas, otro tiempo (N horas, días o semanas), fecha exacta o sin límite. El tiempo empieza a contar al pulsar **Aplicar bloqueo**. El cronómetro muestra cuánto falta y la hora de fin. Al llegar esa hora, el bloqueo y las reservas dejan de contar solos y los platos vuelven a la carta. **Mantener el actual** conserva el fin ya guardado.
- **Motivo**: opcional. Se puede escribir o elegir una sugerencia (Evento, Se acabó, Calidad…). Hasta 120 caracteres.

## Avisos

Los mensajes de la hoja (vínculo guardado, stock actualizado, bloqueo, error de guardado) salen abajo a la izquierda y se cierran solos a los 7 segundos. No empujan la hoja de producción. El panel de notificaciones del menú superior es otro sistema: avisos del restaurante, no estos mensajes de inventario.

## 7. Auditoría, Descuadre y reporte

- **Auditoría** muestra el registro del producto con fecha, tipo, motivo, cantidad y saldo. Usa sus filtros para comprobar qué movimiento cambió el número.
- **Descuadre** distingue faltantes de stock, aperturas ajustadas y diferencias de conteo. Los ajustes intencionales del lápiz se conservan en el historial y quedan fuera del aviso de apertura pendiente. Los faltantes siguen activos.
- **Reporte del día** muestra qué producto o plato recibió el ingreso, su tipo y el origen de la transformación cuando está registrado. Si una entrada se pasa a otro producto durante el día, se cuenta en el destino final. En Octavo se muestra si salió de pecho o pierna cuando el movimiento trae esa marca. De forma predeterminada se ve el detalle de ingresos y los totales de ventas. Desde **Editar reporte** se puede activar el detalle de ventas u ocultar el de ingresos. Al tocar un total de ventas se abre el detalle por comanda o descarga. **Imprimir** abre la hoja de Inventario Tabla.
- **Configuración** contiene Colores, Factores, Aderezos, Crudo y cocido, Preferencias y Tabla. Para ajustar vínculos de consumo de un plato usa Relación de platos. Para administrar mapas usa sus controles existentes.

## Referencia para mantenimiento

- [inventarioController.js](../src/controllers/inventarioController.js) expone las rutas de kardex, movimientos, mapas, relaciones, rubros, bloqueo y descargas manuales bajo `/api/inventario`. La pantalla llama a estas rutas con el permiso de inventario.
- [inventario.repository.js](../src/repository/inventario.repository.js) reúne movimientos, ventas y configuración para responder el kardex. [inventarioLibro.js](../src/utils/inventarioLibro.js) procesa los eventos por fecha, calcula la apertura, aplica ventas y conteos y arrastra el saldo al siguiente día.
- [inventarioSalidaVentas.js](../src/utils/inventarioSalidaVentas.js) obtiene los consumos desde comandas y sus relaciones. [inventarioCascadaVenta.js](../src/utils/inventarioCascadaVenta.js) decide los tramos de stock y registra la parte cubierta. El conteo de la lupa y el descuento contable tienen usos distintos.
- [inventario.html](../public/inventario.html) contiene la vista y el estado de Alpine. `cargarKardexUnaVez` carga movimientos y ventas. `valoresKardexFila` y `aplicarKardex` llevan esos valores a la tabla. `filtroVentaFila` y `detalleVenta` dan el alcance y el total de la lupa de venta. `abrirDesgloseGrupo` abre el detalle de cada producto. `cargarDatosGrafico` consulta el período propio de Gráfico.
- La lupa **Saldo anterior** de Octavo muestra las marcas de apertura y el reparto guardado del primer día operativo. Las notas `Saldo anterior · pecho`, `Saldo anterior · pierna` y `Saldo anterior · sin separar` reclasifican cantidades cuando su suma es cero. `cortesAperturaOctavoEnModal` interpreta ese reparto solo para presentar el saldo anterior. En el caso del 18 de noviembre de 2026, 30 pechos marcados en el libro y un reparto de 30 pechos más 146 piernas dan **60 pechos y 146 piernas**, con total de **206**. Las salidas del día pertenecen a Queda.
- Para verificar un cambio de presentación, reproduce el período y la fila con datos de prueba. Compara la cifra de la tabla, la lupa y el stock de Transformar antes y después. Desde `backend-LasGambusinas`, ejecuta `npm.cmd test -- --runInBand tests/inventario-hoja.test.js tests/inventario-libro.test.js tests/inventario-editar-stock.test.js`. Antes de cerrar, revisa `git diff` para confirmar que el código de Transformar permanece intacto.

## Cómo se conectan

```
Compra o saldo anterior
        ↓
Inventario Tabla  ←—— ventas de comandas (en orden de hora) y venta manual
        ↑
Transformar (cada + / − guarda ya: origen −, destino +)
        ↓
Relación de platos (qué plato come ese producto)
        ↓
Stock de la pieza (la tabla muestra el total del grupo)
```

Ejemplo de un pecho que ya está en la hoja:

1. Pecho de pollo muestra 13 en la tabla, con sus platos incluidos. La lupa dice cuánto es pieza suelta.
2. En Transformar se pasan 2 pechos a filete. El stock de hoja del pecho queda en 11. La columna Transformación del pecho muestra −2 y el filete suma el ingreso del factor. Queda del pecho no baja en esos 2, porque ahora viven en el filete y la columna los sigue sumando.
3. Esos filetes se reparten a milanesa, chaufa u otro plato del grupo, hasta el stock de hoja del filete.
4. La relación dice cuánto filete come cada plato de la carta.
5. Cuando ese plato se vende, la venta resta el cocido, luego el crudo y, si no alcanza, la pieza de reserva. Lo que sale de la reserva baja el pecho o el filete, y no vuelve a bajar el plato.
6. Stock muestra Queda, con los platos incluidos.
