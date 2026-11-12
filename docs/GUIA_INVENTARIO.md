# Guía de Inventario — Las Gambusinas

Pantalla: `backend-gambusinas/public/inventario.html`.  
El panel es la hoja de producción. El backend guarda movimientos, kardex y ventas. Cocina y mozos no arman este despiece: la venta llega sola desde las comandas.

El día operativo corre de **04:00 a 04:00** (Lima). Todas las pestañas leen las mismas filas. Transformar no tiene un saldo aparte.

## Dos números distintos

Cada fila tiene su cuenta. La pantalla la enseña de dos maneras, y las dos son correctas.

| Número | Dónde se ve | Qué incluye |
| --- | --- | --- |
| Stock de hoja | Caja grande de Transformar y tope del **+** | Saldo de esa fila, en crudo o en cocido. Sin platos hijos y sin conteo de cámara. |
| Queda | Columna Queda, Estado y pestaña Stock | Saldo real de la fila más el saldo de los platos que cuelgan directo. Si alguien contó esa fila, el conteo reemplaza su saldo antes de sumar los platos. |

Un pecho con 11 en la caja de Transformar y 13 en Queda tiene 11 de pieza suelta y 2 ya pasados a platos. El **+** solo puede mover los 11.

En la vista **Pachamanca**, Pecho pachamanca y Pollo pachamanca pierna se muestran solos: Queda no les suma el padre ni los hermanos.

## La cuenta de cada fila

Productos con cocido llevan dos líneas (crudo y cocido). El resto solo crudo. La fórmula es de esa fila, sin los hijos.

```
Ingreso total = Saldo anterior + Ingreso + Corrección
Saldo         = Ingreso total − Venta − Transformación + Cubierta
Saldo real    = Conteo de cámara, si existe; si no, el Saldo
Diferencia    = Conteo − Saldo
```

La cubierta es la parte de una venta que no alcanzó a salir del plato y salió de la pieza de reserva. Esa parte baja la pieza y no vuelve a bajar el plato.

Estado, leído sobre Queda (fila + platos directos):

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
| Saldo ant. | Lo que quedó del ciclo anterior, más el saldo anterior de los platos directos. Se puede corregir en la fila. |
| Ingreso | Lo que entró a esta fila: compra, despiece o pase desde otro producto. |
| Corrección | Ajuste opcional de esta fila. En 0 no se registra. |
| Ingreso total | Apertura + ingreso + corrección de la fila y de sus platos directos. La lupa muestra en qué platos o cortes quedó ese ingreso. |
| Venta comandas | Venta de la fila más la de sus platos, sin contar dos veces lo que ya salió de la pieza. No se escribe a mano. La lupa lista los platos. El botón rojo **−** abre la venta manual. |
| Transformación | Lo que salió de esta fila hacia otro corte o plato. En rojo si resta. No incluye a los hijos. La lupa abre el gráfico vertical (origen arriba, destinos abajo). |
| Saldo | Resultado de la fórmula, más el saldo de los platos directos. Se puede ocultar. |
| Conteo | Conteo físico de cámara de esta fila. Vacío si nadie contó. |
| Queda (Saldo real) | El número para saber si hay o no hay, con los platos directos incluidos. |
| Diferencia | Conteo contra saldo de la fila. Se puede ocultar. |
| Estado | Normal, bajo o crítico, según Queda. Se puede ocultar. |

En Configuración → Tabla, **Ocultar** empieza marcado en Saldo y Conteo, Diferencia, Estado y Corrección. Queda sigue visible. Si en este equipo ya se dejó alguna columna visible, se respeta. Cada opción se guarda en el navegador.

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

El botón rojo **−** de Venta comandas abre el modal. Tiene dos pestañas:

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
- Debajo, **+N ingreso hoy** o **−N resto hoy** es el neto del turno (04:00 a 04:00, o el tramo día/noche si el período es un tramo). Sumar 1 y restar 1 deja el neto en 0 y no muestra ninguna de las dos líneas.
- Escribir un número en la caja de un origen (pollo fresco, pecho, pierna, panceta, arroz, carnero) ajusta el stock. Si el ingreso de hoy puede absorber la resta, va a Ingreso; si no, va a Corrección.
- La caja de **cocido** no crea stock: pasa crudo a cocido del mismo producto.
- La caja de **filete** no es un ingreso suelto: convierte pecho en filete con el factor de Configuración.
- La caja de un **plato** pasa o devuelve piezas desde su padre.

**Pasar a la hoja** espera a que terminen de guardarse los pases, recarga el kardex y abre Inventario Tabla. No copia contadores: el pase ya estaba guardado.

En pecho y pierna, la cuenta del cuadro es la misma historia: stock antes = queda + transformación del período; lo que salió; lo que queda.

### Pollo fresco

1 pollo fresco = **2 pechos** + **2 piernas** (los factores se cambian en Configuración). Pierna y pecho no se suman entre sí. Si el pollo se compra ya cortado, el ingreso se anota directo en Pecho o en Pierna y no hace falta convertir fresco.

- El **+** del stock de Pollo fresco suma ese pollo y, en el mismo paso, lo convierte: el saldo de fresco no se queda con el ave entera y además con las piezas. Pecho +2 y pierna +2.
- El **+** / **−** chico junto al factor convierte o devuelve un fresco del período, sin cambiar el ingreso de compra.
- En la tabla, el **+** / **−** del Ingreso de Pollo fresco convierte solo los pollos de ese clic. No multiplica otra vez todo el stock.

### Lápiz de stock

El mismo modal sirve en Transformar y en Inventario Tabla.

- El número escrito es el saldo de esa fila (crudo, y cocido si la fila lo tiene).
- La diferencia se guarda en el día, en Ingreso o en Corrección. No se anota como saldo anterior de un día pasado.
- El lápiz de octavos deja el stock de Octavo de pollo en «octavos de pecho + octavos de pierna». Guarda un ingreso o una corrección de hoy, marcados «· pecho» o «· pierna». No resta piezas de Pecho ni de Pierna, así que guarda aunque esas piezas no tengan stock. Para pasar piezas a octavos (2 octavos = 1 pieza) se usan − / + del cuadro.
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
| Caldo de pollo | Solo crudo |

1 octavo = 1 porción de esos platos. La venta de Arroz con pollo, Pollo a la olla y Caldo de pollo se ve en la columna Venta comandas de Octavo de pollo, y también en la fila de cada plato. El stock de cada plato se reparte entre lo que vino de pecho y lo que vino de pierna.

### Otras familias

| Origen | Regla |
| --- | --- |
| Pato fresco | 1 pato = 2 pechos de pato y 2 piernas de pato. Pecho y pierna de pato tienen Crudo → Cocido. |
| Panceta | Tres cuadros: **Panceta entera → Tira de panceta → Trozo de panceta**. La caja de la entera es el stock. «Pancetas a tiras» resta 1 panceta y suma 6 tiras. «Tiras usadas» resta tiras. **Pieza de panceta** es solo cocido: su stock = piezas que salieron de las tiras − piezas usadas en ventas ± corrección. En la caja «Stock», + suma piezas que salieron (pide tiras usadas antes). − primero quita piezas que salieron en el período; si el stock viene del saldo anterior, el resto va a Corrección cocido. No deja anotar piezas sin tiras usadas, ni devolver una panceta cuyas tiras ya se usaron. |
| Pieza de pescado | Entra directo. Ocupa el lugar del origen en el mapa. Los platos vinculados restan la pieza. |
| Pieza de pota | Entra directo. Ocupa el lugar del origen en el mapa. Los platos vinculados restan la pieza. |
| Carnero | **Carnero pachamanca** (1 carnero = el factor configurado, por defecto 1) y **Seco de carnero** (1 a 1). Los dos tienen crudo y cocido. El tope es el stock de hoja del carnero. |
| Arroz crudo | Tres cuadros: blanco (8), verde + pato (6) y beata (su factor). Cada **+** resta 1 arroz crudo y suma esa cantidad. Ya no hay arroz pollo, chaufa ni mariscos en esta familia. |
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

Ingreso, ventas y saldo del período, día por día. Se puede ver toda la hoja o un solo producto. Si el rango es largo, el gráfico dibuja los últimos 14 días y el saldo del período queda en la tarjeta.

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
Stock y Queda (fila + platos directos)
```

Ejemplo de un pecho que ya está en la hoja:

1. Pecho de pollo tiene stock de hoja 13. Queda puede ser más alto si ya hay platos colgando.
2. En Transformar se pasan 2 pechos a filete. El stock de hoja del pecho queda en 11. La columna Transformación del pecho muestra −2 y el filete suma el ingreso del factor. Queda del pecho no baja en esos 2, porque ahora viven en el filete y la columna los sigue sumando.
3. Esos filetes se reparten a milanesa, chaufa u otro plato del grupo, hasta el stock de hoja del filete.
4. La relación dice cuánto filete come cada plato de la carta.
5. Cuando ese plato se vende, la venta resta el cocido, luego el crudo y, si no alcanza, la pieza de reserva. Lo que sale de la reserva baja el pecho o el filete, y no vuelve a bajar el plato.
6. Stock muestra Queda, con los platos incluidos.
