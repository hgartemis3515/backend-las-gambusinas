# Plan: contador lógico en la Tabla de platos de reportes

Pantalla: `reportes.html`, pestaña Platos, modal **Desglose Detallado de Platos** (`#modal-tabla-platos`).

Hoy esa tabla agrupa por el nombre vendido. Un cuarto de pollo Pie y otro Pec salen como dos textos, una pachamanca de 3 sabores sale como un solo plato, y el mixto de leña cuenta como un tercer plato además del pollo y del chancho. El modal tiene que pasar a un contador: cada unidad de proteína se ve una vez, y los platos que no se desarman siguen en la misma tabla.

Aparte de ese contador, las guarniciones del mismo nombre se suman juntas (el arroz del bistec y el arroz del chancho son un solo Arroz) y los gráficos de la pestaña muestran platos y guarniciones vendidas en el período.

Catálogo medido: 152 platos activos. 82 no tienen grupos. 52 solo tienen guarnición (arroz, papa, zarza). El resto tiene un grupo que cambia el nombre o el contenido (OP / MIX / sabores).

## Qué cuenta y qué no

En el contador de platos, una línea vendida entra a un solo lugar. La guarnición de esa línea se suma aparte, por su nombre.

| Lo que pidió el mozo | Dónde suma | Qué no se vuelve a sumar |
| --- | --- | --- |
| Pachamanca de N sabores | N sabores: Pollo en pollos; Cerdo, Res y Carnero en carnes | La pachamanca no se suma otra vez como plato de pollo o de carne |
| 1/4 pollo a la leña, Pie o Pec | 1 cuarto de pollo leña | Pie y Pec no son dos platos |
| Chancho a la leña (frejol, papa frita o BBQ) | 1 chancho leña | La guarnición y el “BBQ junto / aparte” no crean otro chancho |
| Mixto leña: 1/4 pollo + 300 g panceta | 1 cuarto de pollo leña y 1 panceta de chancho | El mixto no aparece como tercer plato |
| Plato sin grupo, o solo con guarnición | 1 fila con su nombre | El arroz, la papa o la zarza no se cuentan como otro plato. Sí se suman en el conteo de guarniciones del mismo nombre |
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

La guarnición (arroz, papa, humita, tamal, zarza) no entra al contador de proteína. Se cuenta en su propio total, por nombre, como se describe abajo.

## Guarniciones del mismo nombre

Hoy `processGuarniciones` arma la clave `grupo|nombre`. Si el arroz del bistec y el arroz del lomo viven en grupos con distinto rótulo, salen dos filas aunque la opción se llame igual. El top de barras usa ese corte y recorta el texto a 22 caracteres, así que dos “Arroz” pueden verse como dos barras.

El conteo nuevo junta por el nombre de la opción, sin el grupo. Se normaliza con trim y sin distinguir mayúsculas. “Arroz”, “ arroz ” y “ARROZ” son una fila. “Papa” y “Papa frita” siguen siendo dos, porque el nombre no es el mismo.

| Opción vendida | Dónde suma | Qué no se mezcla |
| --- | --- | --- |
| Arroz del chancho leña, del bistec y de la milanesa | 1 fila Arroz | No crea un plato “Arroz” ni suma un chancho de más |
| Papa en un grupo y Papa en otro | 1 fila Papa | Papa frita queda aparte si el texto de la opción es otro |
| Humita o Tamal de la pachamanca | La fila de ese nombre | Solo se junta con la humita o el tamal suelto si la opción dice lo mismo |
| Zarza, ensalada | Su nombre | No son proteína y no parten el plato padre |
| Pie, Pec, BBQ, sabores, Té, Café | Siguen en las reglas de plato de arriba | No son guarnición: no entran a este total |

La cantidad es la de la opción por la cantidad del plato (`cantidad` del complemento, mínimo 1, por `cantidad` de la línea), la misma cuenta que ya usa la pestaña Guarniciones. Una línea sin complementos no aporta guarnición. Pie, Pec y el grupo Sabores no se cuelan aquí: la ficha de conteo del catálogo dice qué grupo es guarnición y cuál es parte del plato.

La fila puede seguir mostrando de qué platos salió, como nota. El grupo deja de partir el total; si hace falta ver el origen, va en el detalle, no como otra suma.

## Gráfico de platos y guarniciones

En la pestaña Platos los dos lienzos de arriba (`chartReportes1`, `chartReportes2`) hoy grafican el nombre crudo del boucher: top de platos y platos por categoría. Pasan a usar el mismo período y las mismas dos cuentas.

1. **Platos vendidos.** Barras horizontales con las unidades del contador lógico: cuartos de leña, medios baby, chancho leña, panceta del mixto, sabor Pollo, sabores de carne, y cada plato suelto. Orden por cantidad. Pie y Pec no son barras propias. El mixto no tiene barra. Una pachamanca de 3 sabores no tiene barra de “pachamanca” además de sus sabores; si se quiere ver la fuente, queda en el detalle del modal.
2. **Guarniciones vendidas.** El segundo gráfico (dona o barras) usa el conteo por nombre unificado: Arroz, Papa, Zarza, Humita, Tamal y el resto. Una barra por nombre, no por grupo. El porcentaje es sobre el total de unidades de guarnición del período.

Platos y guarniciones no comparten la misma barra ni el mismo total. Un cuarto con arroz es 1 cuarto en el primer gráfico y 1 arroz en el segundo. El dinero no entra a las guarniciones: el pie de soles sigue siendo solo la venta de platos, una vez por línea.

La pestaña Guarniciones usa esa misma clave por nombre, para que el desglose y el gráfico no contradigan el de Platos. La columna Grupo pasa a ser referencia (en qué grupos apareció ese nombre), no la clave de la fila.

## Pasos para hacerlo

1. Ficha de conteo junto al catálogo, no escrita a mano en el HTML. Para cada plato: o es suelto, o se pliega al nombre padre (Pie, Pec, BBQ, ají), o se parte en piezas (pachamanca por sabor, mixto en cuarto + panceta, DCH por bebida).
2. Al armar el modal, recorrer las líneas del período y aplicar esa ficha. Una línea no entra a dos bloques con la misma unidad.
3. El modal pinta Pollos, Carnes y Platos. El pie de unidades de cada bloque y el pie de soles del período cuadran con la venta, sin el mixto repetido.
4. Probar con cuatro casos: pachamanca de 3 sabores, cuarto Pie y cuarto Pec, un mixto, y una gaseosa. El mixto debe verse solo como cuarto y panceta. La gaseosa debe seguir en Platos.
5. Armar el mapa de guarniciones por nombre de opción, juntando grupos distintos. Excluir los grupos que la ficha ya trata como parte del plato (Pie, Pec, BBQ, sabores, DCH).
6. Pintar los dos gráficos de la pestaña Platos con esas cuentas, y alinear la pestaña Guarniciones a la misma clave. Probar que el arroz de dos platos con distinto grupo sea una sola fila y una sola barra, y que ese arroz no aumente ni pollos, ni carnes, ni el total en soles.

No cambia `platos.html` ni el cobro. Cambia cómo el modal de reportes agrupa lo ya vendido, y cómo los gráficos cuentan platos y guarniciones del mismo período.
