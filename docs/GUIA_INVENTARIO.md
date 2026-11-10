# Guía de Inventario — Las Gambusinas

Pantalla: `backend-gambusinas/public/inventario.html`.  
El panel es la hoja de producción. El backend guarda movimientos, kardex y ventas. Cocina y mozos no arman este despiece.

El día operativo corre de **04:00 a 04:00** (Lima). Todas las pestañas leen las mismas filas. Transformar no tiene un saldo aparte: lo que se transforma sale del origen y entra al destino en Inventario Tabla.

## La cuenta de cada fila

Productos con cocido llevan dos líneas (crudo y cocido). El resto solo crudo.

```
Ingreso total = Saldo anterior + Ingreso + Corrección
Saldo         = Ingreso total − Venta + Cubierta − Transformación
Saldo real    = Conteo de cámara, si existe; si no, el Saldo
Diferencia    = Conteo − Saldo
```

Estado del saldo real de la fila (incluye los platos que cuelgan de ella, salvo la vista filtrada de pachamanca):

| Queda | Estado |
| --- | --- |
| Más de 10 | Normal |
| De 6 a 10 | Bajo |
| 5 o menos | Crítico |

No se suma un total de pollos + piernas + pechos + filetes. Cada fila tiene su propia unidad.

## 1. Inventario Tabla

Hoja de producción del período. Es la fuente de verdad.

### Qué se puede hacer

- Elegir el período: hoy, ayer, 7 días, 30 días, este mes, 1 año o un rango.
- Buscar por nombre y filtrar por categoría. El filtro **Pachamanca** deja solo los sabores (pollo, carne, carnero, cerdo y humita).
- Abrir o cerrar los grupos. Imprimir la hoja. Abrir el reporte del día. Poner en cero los movimientos de hoy (el saldo anterior se conserva).
- Abrir **Bloqueo de inventario** (icono de candado, donde antes estaba Contar cámara). Ver la sección 5.
- Entrar a Configuración (factores de pollo, arroz, carnero y aderezos) y al color de fondo de las filas.

### Columnas

| Columna | Qué hace |
| --- | --- |
| Producto | Nombre, unidad y lugar en el grupo. |
| Saldo ant. | Lo que quedó del ciclo anterior. Se puede corregir. |
| Ingreso | Lo que entró hoy: compra, despiece o pase desde otro producto. |
| Corrección | Ajuste opcional. En 0 no se registra. |
| Ingreso total | Suma de apertura, ingreso y corrección. La lupa muestra en qué platos o cortes quedó ese ingreso. |
| Venta comandas | Sale de comandas. No se escribe a mano en la celda. La lupa lista los platos vendidos. El botón rojo **−** abre la venta manual. |
| Transformación | Lo que salió de esta fila hacia otro corte o plato. En rojo si resta. La lupa abre el gráfico vertical (origen arriba, destinos abajo). |
| Saldo | Resultado de la fórmula. Se puede ocultar. |
| Conteo | Conteo físico de cámara. Vacío si nadie contó. |
| Queda (Saldo real) | El número que manda para saber si hay o no hay. |
| Diferencia | Conteo contra saldo. Se puede ocultar. |
| Estado | Normal, bajo o crítico. Se puede ocultar. |

### Crudo y cocido

Si el producto tiene cocido, cada columna se parte en crudo y cocido. El pase **Crudo → Cocido** mueve unidades del crudo al cocido del mismo producto. No crea stock nuevo.

La venta gasta primero el cocido del plato, después el crudo del plato y, si sigue faltando, la reserva de la pieza (pecho, pierna o filete), cuando esa reserva está definida.

Cada movimiento se guarda con la hora real. Si a las 9:00 se pasa pecho de pato a cocido y a las 10:00 entra una comanda de arroz con pato, la venta resta ese cocido. (Antes todo se guardaba a las 12:00 y una venta de la mañana restaba crudo.)

Casos con cadena propia:

| Venta | Orden en que resta |
| --- | --- |
| Pollo de pachamanca (sabor) | Cocido de Pollo pachamanca pierna, cocido de Pecho pachamanca, crudo de pierna pachamanca, crudo de pecho pachamanca y, al final, Pierna de Pollo. |
| Seco de carnero o de cordero | Cocido de Seco de carnero, crudo de Seco de carnero, cocido de Carnero Crudo y, al final, crudo de Carnero Crudo. |

### Venta manual

El botón rojo **−** de Venta comandas abre el modal. Tiene dos pestañas:

- **Por unidad**: resta unidades del producto. Orden: cocido del producto, crudo del producto y, al final, la pieza de reserva.
- **Por plato vinculado**: se elige un plato y cuántos se vendieron. Salen los platos con fila propia que cuelgan del producto (por ejemplo, de Pecho de Pollo: Pecho leña, Sandwich, Pecho pachamanca) y los platos de la carta vinculados en Relación de platos. Un plato con fila propia gasta su cocido, su crudo y lo que falte sale del producto. Un plato de la carta resta *platos × lo que come* del producto. Antes de confirmar se ve qué va a restar.

Queda anotada como venta, no como transformación.

### Grupos de la hoja

Pollo fresco, pato fresco, panceta, carnes, trucha, carnero, arroz, gaseosas, licores y bebidas. Lo que no entra en un grupo queda como fila sola (pescado entero, pota, cuy, papas, y otros ingresos directos).

## 2. Transformar

Mapa de izquierda a derecha. Sirve para partir un producto en cortes o platos. El tope de cada origen es su **stock de hoja** (el saldo crudo de esa fila, sin platos hijos y sin conteo). Si el pecho tiene 13, se pueden transformar hasta 13, y cada pieza transformada resta 1 de esos 13. Vale igual para pierna, octavo, filete, panceta, tira, pescado, pota, carnero, arroz y pato.

Cada **+** / **−** se guarda en el momento: el origen resta en Transformación y el destino suma en Ingreso. Los números de los cuadros se leen de esos movimientos guardados, así que al recargar la página siguen ahí.

### Pollo fresco

1 pollo fresco = **2 pechos** + **2 piernas**. Pierna y pecho no se suman entre sí. Si el pollo se compra ya cortado, el ingreso se anota directo en Pecho o en Pierna y no hace falta convertir fresco.

### Pecho de pollo

Sale del fresco o de un ingreso directo.

- A **filete**: 1 pecho = el factor configurado (por defecto 1 filete). Los filetes alimentan su grupo de platos (milanesa, filete junior, chicharrón, chaufa, saltado y el resto del grupo). Filete junior come 0,5 filete.
- Al cuadro de pecho: **Pecho leña**, **Sandwich** y **Pecho pachamanca**. 1 pecho = 1 pieza. Pecho pachamanca tiene crudo y cocido, y la venta del sabor Pollo de la pachamanca también lo gasta.
- A **octavo de pollo**: 2 octavos restan 1 pecho.

### Pierna de pollo

Sale del fresco o de un ingreso directo.

- Al cuadro de pierna: **Pollo pachamanca pierna**, **Pierna a la leña**, **Pollada** y **Menú pierna**. 1 pierna = 1 pieza. Pachamanca solo sale de pierna.
- A filete solo si en Configuración el factor pierna → filete es mayor que 0.
- A **octavo de pollo**: 2 octavos restan 1 pierna.

### Octavo de pollo

Cuadro propio, conectado a pecho y a pierna. Se elige el origen con **Desde pecho** o **Desde pierna**.

Del octavo cuelgan:

| Plato | Pase a cocido |
| --- | --- |
| Arroz con pollo | Crudo y cocido |
| Pollo a la olla | Crudo y cocido |
| Caldo de pollo | Solo crudo |

1 octavo = 1 porción de esos platos. No se pueden armar más platos que octavos libres.

### Otras familias

| Origen | Regla |
| --- | --- |
| Pato fresco | 1 pato = 2 pechos de pato y 2 piernas de pato. El + del origen resta 1 pato y suma los cortes. Pecho y pierna de pato tienen Crudo → Cocido. |
| Panceta | Tres cuadros en línea: **Panceta entera → Tira de panceta → Trozo de panceta**, y después los platos. **Panceta entera**: la caja es el stock y sus + / − son ingreso (si no hay ingreso de hoy para restar, va a Corrección). **Tira de panceta**: muestra las tiras que quedan; "Pancetas a tiras" + resta 1 panceta y suma 6 tiras. **Trozo de panceta**: "Tiras usadas" resta tiras y "Trozos" suma los trozos que salieron (suele ser 39, 40 o 41). Su "quedan" es el crudo: al pasar a cocido, baja. No deja anotar trozos sin tiras usadas, ni devolver una panceta cuyas tiras ya se usaron. |
| Pescado entero | Se anota cuántos se usaron (resta el entero) y cuántas piezas salieron (suma la pieza). La venta descuenta la pieza. |
| Pota | Igual que el pescado: potas usadas y piezas obtenidas. |
| Carnero | Dos platos: **Carnero pachamanca** (1 carnero = el factor configurado, por defecto 1) y **Seco de carnero** (1 a 1). Los dos tienen crudo y cocido. |
| Arroz crudo | Se reparte con el + de cada tipo: cada + resta 1 arroz crudo y suma blanco (8), verde (6), pato (4), chaufa (4), con mariscos (4) o arroz pollo (1). El origen solo muestra lo repartido y lo libre. El factor se cambia en Configuración. |
| Carnes, trucha, cuy, papas y similares | Entran directo. No se despiezan en este mapa. |

### Cómo se usa

1. Carga el origen con **Ingreso** (o desde Inventario Tabla).
2. Reparte con **+** / **−**, o escribe el número en la caja.
   - En los orígenes (pollos frescos, pechos a filete, octavos, pancetas a tiras, tiras usadas, pescados, potas, pato) la caja es **lo que pasó en el período**. Panceta entera es la excepción: su caja es el stock y funciona como ingreso.
   - Pecho, pierna, panceta, tira, trozo, arroz crudo, carnero crudo y chicharrón de chancho muestran el número grande **quedan**: el stock crudo de hoja, que baja con cada transformación y con las ventas.
   - En los platos (Pecho leña, Pollada, Arroz con pollo, Seco de carnero…) la caja es **el stock crudo del plato**. El + pasa 1 pieza del padre al crudo del plato; el − la devuelve.
3. Si el plato tiene cocido, debajo está **Crudo → Cocido**: pasa unidades crudas del plato a cocido. No toca el padre.
4. **Pasar a la hoja** espera a que terminen de guardarse los pases y abre Inventario Tabla. Ya no hace falta para guardar.

Si no alcanza el stock de hoja, el aviso ámbar detiene el paso y no deja el saldo en negativo. Lo mismo al devolver: no se devuelve más de lo que el destino tiene.

El **editor de mapas** crea o ajusta familias nuevas (pato y las que se agreguen). El mapa de pollo fresco de esta pantalla es el mapa fijo descrito arriba.

## 3. Relación de platos

Dice qué plato de la carta come qué producto del inventario, y cuánto. No mueve el stock por sí sola. La venta de la comanda descuenta según esa relación y según la reserva crudo/cocido.

Al abrir la pestaña, los platos activos de la carta se vinculan solos por el nombre (filete, pachamanca, arroz con pollo, caldo, y el resto de las reglas ya cargadas). Lo que falte se puede agregar a mano.

### Tres vistas

| Vista | Para qué |
| --- | --- |
| Estudio unido | Un producto a la vez. Se ve el mapa, los platos vinculados y se edita la cantidad. |
| Mapa despiece | Todos los mapas, de origen a cortes y platos, con el factor y lo que descuenta cada plato. |
| Matriz | Una tarjeta por producto, con sus platos y la cantidad que restan. |

Arriba se filtra por familia (pollo, panceta, arroz, pachamanca, bebidas y el resto). El contador muestra productos, vínculos y mapas.

### Pollo en el mapa de relación

- Pecho: filetes y sus platos, pecho a la leña y menú pecho. También puede pasar a octavo (2 octavos = 1 pecho).
- Pierna: pachamanca pierna, pierna a la leña, pollada y menú pierna. También puede pasar a octavo (2 octavos = 1 pierna).
- Octavo: arroz con pollo, pollo a la olla y caldo de pollo. Cada plato de la carta de ese grupo descuenta **1 octavo**. Caldo de pollo queda solo crudo.

Un vínculo se lee así: plato de la carta, producto del inventario, cantidad (1 pieza, 0,5 filete, 2 filetes, etc.).

## 4. Stock

Lista corta de lo que queda hoy. No se edita aquí y no hay un gran total, porque mezcla pollos, piezas, porciones y bebidas.

- Una tarjeta por grupo (pollo, pato, panceta, carnes, trucha, carnero, arroz, gaseosas, licores, bebidas).
- Una tarjeta de filas solas, para lo que no tiene grupo.
- El número es el **saldo real** de la fila (conteo si ya se contó; si no, el saldo de la fórmula), más los platos que cuelgan de esa fila.
- La unidad se muestra al lado del número.

Sirve para mirar. Para cargar, transformar, vender o contar se usa Inventario Tabla o Transformar.

## 5. Bloqueo de inventario (bosquejo)

Icono de candado en la barra de Inventario Tabla. Reemplaza el botón Contar cámara (el conteo por fila sigue en la columna Conteo).

Es un bosquejo: todavía no guarda ni llega a los mozos. El botón **Aplicar bloqueo** está desactivado.

- Pestaña **Productos**: cada fila del inventario con lo que queda, una caja **Reservar** (aparta unidades del stock, por ejemplo para un evento) y un interruptor **Bloquear** (el mozo no lo puede pedir aunque haya stock).
- Pestaña **Platos de la carta**: un interruptor **Bloquear** por plato.
- Abajo: motivo, hora hasta la que dura y el resumen de cuántos quedan bloqueados o con reserva.

## Cómo se conectan

```
Compra o saldo anterior
        ↓
Inventario Tabla  ←—— ventas de comandas y venta manual
        ↑
Transformar (resta el origen y suma el destino)
        ↓
Relación de platos (qué plato come ese producto)
        ↓
Stock (solo muestra el saldo real)
```

Ejemplo de un pecho que ya está en la hoja:

1. Pecho de pollo tiene stock de hoja 13.
2. En Transformar se pasan 2 pechos a filete. El stock de hoja del pecho queda en 11 y el filete suma los filetes del factor.
3. Esos filetes se reparten a milanesa, chaufa u otro plato del grupo.
4. La relación dice cuánto filete come cada plato de la carta.
5. Cuando ese plato se vende, la venta resta el cocido, luego el crudo y, si no alcanza, la pieza de reserva.
6. Stock muestra el número que quedó.

Ejemplo de octavo:

1. Con 2 octavos **Desde pecho** se resta 1 pecho. Con 2 octavos **Desde pierna** se resta 1 pierna.
2. Esos octavos se convierten en arroz con pollo, pollo a la olla o caldo de pollo.
3. La relación de platos cuelga esos tres del octavo, a 1 octavo por plato.
