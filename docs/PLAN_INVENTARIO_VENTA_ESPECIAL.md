# Plan: venta especial de lo apartado para evento

**Estado:** implementado en `public/inventario.html`.  
**Pantalla:** hoja de inventario. No entra en cocina ni en mozos.  
**Rubros nuevos:** `evento-pollo`, `evento-carne`, `evento-arroz`, `evento-papa` en `src/utils/inventarioRubros.js`. El rubro viejo `evento` (destino de despiece de pollo) sigue igual.

## Qué se quiere

El restaurante aparta materia para un evento. Esa cantidad deja de ser stock del salón y pasa a un producto de evento. Cuando el evento se sirve, la venta no sale por comandas: se anota a mano y resta solo ese stock apartado.

Materias de esta entrega:

| Materia en la hoja | Producto de evento |
|---|---|
| Pollo fresco | Pollo Evento |
| Carne Bistec | Carne Evento |
| Arroz crudo | Arroz Evento |
| Papas | Papa Evento |

## Qué se quitó de la hoja

- La leyenda fija de las fórmulas.
- El botón Simular ventas (Comandas).
- El botón Restaurar ejemplo del día. La carga inicial sigue armando el ejemplo en silencio; ya no hay botón para repetirlo.

En su lugar está **Venta especial**.

## Cómo se aparta

En Transformar, cuadro **Apartar para evento**. Cada fila es materia → producto de evento. Al pulsar Pasar con una cantidad:

1. La materia sube en Transformación de la hoja (sale del restaurante).
2. El producto de evento sube en Disponible.
3. Se guardan dos movimientos: ingreso negativo de la materia (`Pasa a … Evento`) e ingreso del producto de evento (`Sale de …`).

## Cómo se vende

Venta especial abre un cuadro con los cuatro productos, lo disponible y la cantidad usada hoy. Aplicar:

1. No deja usar más de lo apartado.
2. Resta esa cantidad del disponible.
3. Guarda un egreso con motivo `Venta especial` en el rubro de evento.

No toca la columna Venta de Pollo fresco, Carne, Arroz ni Papas. Esas ventas siguen siendo las de comandas.

## Qué no hace

- No crea un plato de la carta ni una comanda.
- No avisa a cocina ni a mozos.
- No mezcla el stock de evento en las filas de la hoja de producción.
