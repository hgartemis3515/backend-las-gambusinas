# Plan: platos ocultos y saldo en el producto padre

La tabla de inventario muestra materia y productos de producción. Un plato no tiene fila. Su crudo y su cocido viven dentro del producto que lo agrupa y se ven en el Ingreso total de ese padre.

## Regla

1. Ingresar N pollos frescos parte solo el mismo número: Pierna de pollo cruda recibe N × 2 y Pechuga de pollo cruda recibe N × 2. Pollo fresco sale por transformación en N.
2. La tabla no pinta platos (chaufa de pollo, chicharrón, lomo saltado, pollada, menú, leña y el resto). Sí pinta Pollo fresco, Pechuga, Pierna, Panceta y sus cortes, arroces, pato y las demás materias.
3. Filete Pollo Crudo desaparece de la tabla, de Transformar y de la reserva de venta. Los platos que colgaban de Filete pasan solo a Pechuga de pollo. Su principal es Pechuga de pollo.
4. Pollada y Pollo pachamanca salen de Pechuga. Quedan solo en Pierna de pollo. Menú sigue en las dos.
5. Transformar un plato anota su crudo o su cocido, pero esa cantidad se acredita al Ingreso total del padre y sigue en el saldo del padre. La flecha verde de Ingreso total suma ese crédito. La lupa abre el desglose: cuánto queda de cada plato y cuánto queda libre del principal.
6. La venta sigue el orden de 3: cocido del plato, luego crudo del plato, luego el principal. En la columna Restó de Venta comanda cada línea dice `Cocido — plato`, `Crudo — plato` o `Principal — Pechuga de Pollo` (o el padre que corresponda).
7. Arroz pollo solo descuenta el plato Arroz con pollo. Cualquier otro plato que llevaba arroz y caía en Arroz pollo pasa a Arroz blanco.

## Dónde

- Hoja: `inventario-—-las-gambusinas/index.html` y `backend-gambusinas/public/inventario.html`
- Venta y grupos: `inventarioMapas.js`, `inventarioSalidaVentas.js`, `inventarioCascadaVenta.js`, `inventario.repository.js`
