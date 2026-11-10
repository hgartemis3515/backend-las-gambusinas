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

### Venta manual

Resta en este orden: cocido del producto, crudo del producto y, al final, la pieza de reserva. Queda anotada como venta, no como transformación.

### Grupos de la hoja

Pollo fresco, pato fresco, panceta, carnes, trucha, carnero, arroz, gaseosas, licores y bebidas. Lo que no entra en un grupo queda como fila sola (pescado entero, pota, cuy, papas, y otros ingresos directos).

## 2. Transformar

Mapa de izquierda a derecha. Sirve para partir un producto en cortes o platos. El tope de pecho y de pierna es el **stock de hoja** de esa fila (el saldo crudo). Si el pecho tiene 13, se pueden transformar hasta 13, y cada pieza transformada resta 1 de esos 13. Igual la pierna.

### Pollo fresco

1 pollo fresco = **2 pechos** + **2 piernas**. Pierna y pecho no se suman entre sí. Si el pollo se compra ya cortado, el ingreso se anota directo en Pecho o en Pierna y no hace falta convertir fresco.

### Pecho de pollo

Sale del fresco o de un ingreso directo.

- A **filete**: 1 pecho = el factor configurado (por defecto 1 filete). Los filetes alimentan su grupo de platos (milanesa, filete junior, chicharrón, chaufa, saltado y el resto del grupo). Filete junior come 0,5 filete.
- Al cuadro de pecho: **Pecho leña**, **Sandwich** y **Menú pecho**. 1 pecho = 1 pieza.
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
| Pato fresco | 1 pato = 2 pechos de pato y 2 piernas de pato. |
| Panceta | 1 panceta = 6 tiras. De las tiras usadas salen los trozos (el número se anota a mano; suele ser 39, 40 o 41). |
| Pescado entero | Se anota cuántos se usaron y cuántas piezas salieron. La venta descuenta la pieza. |
| Pota | Igual que el pescado: potas usadas y piezas obtenidas. |
| Carnero | 1 carnero = 1 carnero pachamanca. |
| Arroz crudo | 1 crudo puede rendir arroz blanco (8), verde (6), pato (4), chaufa (4), con mariscos (4) o arroz pollo (1). El factor se cambia en Configuración. |
| Carnes, trucha, cuy, papas y similares | Entran directo. No se despiezan en este mapa. |

### Cómo se usa

1. Sube el origen (pollo fresco, panceta, arroz, etc.) o usa el ingreso directo del corte.
2. Reparte hacia el corte o el plato con **+** / **−**.
3. Si el producto tiene cocido, la tarjeta tiene dos controles:
   - **Origen → Cocido** (naranja): resta 1 del producto origen (pecho, pierna, octavo, filete, tira de panceta o carnero) y suma 1 al **cocido** del plato. El crudo del plato no cambia. Ej.: + en Pecho a la leña cocido resta 1 Pecho de Pollo.
   - **Crudo → Cocido** (dorado): pasa unidades ya crudas del plato a cocido. Solo resta el crudo del plato; el origen no se toca.
   El **+** principal de la tarjeta sigue sumando crudo del plato desde el origen.
4. **Pasar a la hoja** escribe la salida en Transformación del origen y la entrada en Ingreso del destino, y abre Inventario Tabla.

Si no alcanza el stock de hoja, el aviso ámbar detiene el paso y no deja el saldo en negativo.

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
