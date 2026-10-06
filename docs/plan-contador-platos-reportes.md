# Plan: contador lógico en la Tabla de platos de reportes

Pantalla: `reportes.html`, pestaña Platos, modal **Desglose Detallado de Platos** (`#modal-tabla-platos`).

Hoy esa tabla agrupa por el nombre vendido. Un cuarto de pollo Pie y otro Pec salen como dos textos, una pachamanca de 3 sabores sale como un solo plato, y el mixto de leña cuenta como un tercer plato además del pollo y del chancho. El modal tiene que pasar a un contador: cada unidad de proteína se ve una vez, y los platos que no se desarman siguen en la misma tabla.

Catálogo medido: 152 platos activos. 82 no tienen grupos. 52 solo tienen guarnición (arroz, papa, zarza). El resto tiene un grupo que cambia el nombre o el contenido (OP / MIX / sabores).

## Qué cuenta y qué no

Una línea vendida entra a un solo lugar.

| Lo que pidió el mozo | Dónde suma | Qué no se vuelve a sumar |
| --- | --- | --- |
| Pachamanca de N sabores | N sabores: Pollo en pollos; Cerdo, Res y Carnero en carnes | La pachamanca no se suma otra vez como plato de pollo o de carne |
| 1/4 pollo a la leña, Pie o Pec | 1 cuarto de pollo leña | Pie y Pec no son dos platos |
| Chancho a la leña (frejol, papa frita o BBQ) | 1 chancho leña | La guarnición y el “BBQ junto / aparte” no crean otro chancho |
| Mixto leña: 1/4 pollo + 300 g panceta | 1 cuarto de pollo leña y 1 panceta de chancho | El mixto no aparece como tercer plato |
| Plato sin grupo, o solo con guarnición | 1 fila con su nombre | El arroz, la papa o la zarza no se cuentan como otro plato |
| DCH (Té, Café, Leche…) | Cada bebida pedida, con su cantidad | No se suma además una fila “DCH” |

El pie de soles del modal sigue siendo la venta del período, una vez por línea. Partir un mixto o una pachamanca reparte unidades, no duplica el dinero.

## Cómo está armado el catálogo

La regla sale de `platos.html`, no de adivinar el nombre.

Un grupo con **Anexar al nombre** (OP) es parte del plato. Un grupo con **MIX** (`esVariantePlato`) reemplaza el nombre. Un grupo de sabores en modo cantidades, con los complementos unidos al plato, es una pachamanca. Guarnición, zarza y ensalada no son proteína.

### Pachamancas

Las cuatro son la misma familia. Grupo SOS `Pachamancas`, complementos unidos al plato, grupo **Sabores** en cantidades.

| Plato | Tope de sabores | Opciones de sabor | Guarnición (no cuenta como proteína) |
| --- | --- | --- | --- |
| Pachamanca 1 sabor | 1 | Pollo, Cerdo, Res, Carnero | Humita o Tamal |
| Pachamanca 2 sabores | 2 | Las mismas | Humita o Tamal |
| Pachamanca 3 sabores | 3 | Las mismas | Humita o Tamal |
| Pachamanca 4 sabores | 4 | Las mismas | Humita o Tamal |

Pollo es pollo. Cerdo, Res y Carnero son carnes. Humita y Tamal se quedan como acompañamiento.

Ejemplo: 2 pachamancas de 3 sabores, cada una con Pollo, Cerdo y Res.

- Pollos: 2
- Carnes: 4 (2 cerdo + 2 res)
- Fuentes de pachamanca: 2 de 3 sabores
- Esos 2 no se suman otra vez dentro de pollos ni de carnes

Si la línea no trae los sabores elegidos, esa fuente va a “Pachamanca sin sabor registrado” y no se reparte.

### Leña: pollo, chancho y mixto

Categoría `LEÑA CON POLLO Y CHANCHO`.

| Plato de carta | Contador |
| --- | --- |
| 1/4 Pollo a la leña + papa + arroz + ensalada | 1 cuarto de pollo. Pie y Pec solo anotan el corte |
| 1/2 Pollo a la leña BABY | 1 medio pollo baby. No se convierte en dos cuartos |
| Chancho a la Leña + frejol + arroz | 1 chancho leña |
| Chancho a la Leña + papa frita + arroz + ensalada | El mismo chancho leña |
| Chancho a la Leña BBQ | El mismo chancho leña. BBQ junto o aparte es presentación |
| Mixto leña 1/4 pollo + 300 g panceta | 1 cuarto de pollo y 1 panceta. El corte Pie/Pec queda en el cuarto |

El mixto ya trae las dos proteínas en el nombre del plato. No hace falta un grupo “pollo + chancho”: la ficha del catálogo dice que ese plato aporta las dos partes. Esas dos partes son la única fila. No queda una fila “Mixto” al lado.

Un cuarto y un medio no se suman en la misma casilla. El resumen de pollos leña puede mostrar cuartos y medios por separado, y un total de “piezas de pollo leña” que los nombra distinto.

### Platos sin grupo

82 platos activos no tienen complementos: bebidas, chaufas, panes, humita suelta, caldo de pollo, extras. Salen en el modal con su nombre, su cantidad y su total, igual que ahora.

Los 52 que solo tienen guarnición (bistec, lomo, milanesa, arroz con pollo, chicharrón) también son un plato cada uno. La guarnición no los parte ni los mete en el contador de leña. Un “Arroz Chaufa Pollo” no es un cuarto de pollo a la leña.

Los grupos OP que no son proteína (ceviche Normal / Ají / Sin ají, ensalada Limón / Vinagre, pecho o pierna del arroz con pato) se pliegan al plato padre. Siguen siendo un ceviche, una ensalada o un arroz con pato.

## Cómo se vería el modal

Misma ventana, tres bloques en este orden.

1. **Pollos.** Cuartos de leña, medios baby, sabor Pollo de pachamanca, y el cuarto que aporta el mixto. Pie y Pec como nota del cuarto, no como fila.
2. **Carnes.** Chancho leña (las tres presentaciones juntas), panceta del mixto, y sabores Cerdo, Res y Carnero de la pachamanca.
3. **Platos.** Todo lo que no se desarmó: sin grupo, solo guarnición, y el resto de la carta. Un nombre, una cantidad.

Encima, tres números del período: piezas de pollo, piezas de carne, platos sueltos. El buscador y la impresión siguen. El total en soles de los platos sueltos más el dinero de leña, mixto y pachamanca (contado en su bloque, una vez) cierra con el total de hoy.

Cada fila compuesta puede mostrar de dónde salió: “2 cuartos, de los cuales 1 viene del mixto” o “3 pollos de pachamanca de 4 sabores”. Eso es detalle, no otra suma.

## De dónde sale el número

`processPlatos` en `reportes.html` hoy suma el boucher por `p.nombre`. El boucher guarda el complemento como grupo y opción, sin cantidad. La comanda sí guarda `complementosSeleccionados.cantidad` (Pollo x2, Cerdo x1).

El contador tiene que leer la línea de la comanda del mismo período que ya usa reportes, con cantidad de cada opción. El grupo Sabores de la pachamanca y el grupo Variación o Tipo de la leña se leen ahí. El mixto no depende de una opción: su ficha dice “1/4 pollo + 1 panceta” por cada unidad vendida.

Si una pachamanca vieja no tiene sabores en la línea, no se inventan. Queda en la fila sin sabor.

La guarnición (arroz, papa, humita, tamal, zarza) se ignora para este contador. Sigue existiendo en la pestaña Guarniciones.

## Pasos para hacerlo

1. Ficha de conteo junto al catálogo, no escrita a mano en el HTML. Para cada plato: o es suelto, o se pliega al nombre padre (Pie, Pec, BBQ, ají), o se parte en piezas (pachamanca por sabor, mixto en cuarto + panceta, DCH por bebida).
2. Al armar el modal, recorrer las líneas del período y aplicar esa ficha. Una línea no entra a dos bloques con la misma unidad.
3. El modal pinta Pollos, Carnes y Platos. El pie de unidades de cada bloque y el pie de soles del período cuadran con la venta, sin el mixto repetido.
4. Probar con cuatro casos: pachamanca de 3 sabores, cuarto Pie y cuarto Pec, un mixto, y una gaseosa. El mixto debe verse solo como cuarto y panceta. La gaseosa debe seguir en Platos.

No cambia `platos.html` ni el cobro. Solo cambia cómo el modal de reportes agrupa lo ya vendido.
