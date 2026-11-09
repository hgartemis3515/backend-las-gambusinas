# Plan: humita y yuca entre el registro de platos y el inventario

Estado: diagnóstico. No implementado.

El inventario sí está amarrado al mismo contador que imprime el registro de platos del día. El corte está en lo que ese contador tira antes de bajar el stock, y en dos reglas aparte (humita y yuca) que no salen en la impresión.

## Qué hace cada pantalla

1. Reportes arma el registro con `armarContadorPlatos` (`contadorPlatosReporte.js`). La impresión del modal lista solo Pollos, Carnes y Platos. La pestaña de guarniciones queda fuera de esa hoja.
2. Inventario, en `egresosVentaHasta` (`inventarioSalidaVentas.js`), llama al mismo contador y se queda con Pollos, Carnes, Platos y las bebidas. El resto de guarniciones no entra a la baja.
3. La pestaña Relación de `inventario.html` muestra la ficha del plato (de qué corte cuelga y qué grupos se llaman guarnición). Esa ficha no es la cuenta del día. La cuenta del día es el paso 2.

## El día de la pachamanca, con la carta como está

Carta real, grupo Sabores: `1/4 Pollo`, `1/4 Cerdo`, `1/4 Res`, `1/4 Carnero`, `Humita` (S/ 8). Humita vive dentro de Sabores. No hay un grupo llamado Guarnición.

El contador solo reconoce el texto exacto Pollo, Cerdo, Res o Carnero. `1/4 Pollo` y `Humita` no entran. Sabores es parte del plato, así que Humita tampoco pasa a la lista de guarniciones.

Simulación con 3 de 1 sabor, 3 de 2 sabores y 4 de 3 sabores (10 platos), eligiendo `1/4 Pollo`, `1/4 Cerdo` y en el de 3 sabores también Humita:

| Dónde | Qué sale |
|---|---|
| Impreso | Una fila: «Pachamanca sin sabor registrado», cantidad 10. Detalle: 3 de Pachamanca 1 sabor, 3 de Pachamanca 2 sabores, 4 de Pachamanca 3 sabores. Guarniciones vacías. |
| Stock que sale de esas filas | Nada. Ni pollo, ni cerdo, ni res, ni humita. |
| Parche de humita en el inventario | 21. Fórmula del nombre: 3×1 + 3×2 + 4×3. No mira si el mozo marcó Humita. Ese 21 no se imprime. |

Por eso en el registro impreso la humita no figura, y desde esas filas no hay número para bajar el stock. El 21, si la hoja de Humita lo muestra, viene de otra función (`unidadesHumitaPachamanca`) pegada al lado del reporte. Si la fila Humita sigue en cero, el siguiente chequeo es si esas comandas caen dentro del corte de fechas del inventario. Eso queda para cuando se implemente.

Hay rubros `pachamanca-1s` … `pachamanca-4s` en la tabla. Ninguna venta escribe ahí.

## La yuca

`consumeYuca` suma 1 yuca si el nombre del plato coincide. No lee el complemento «Yuca frita». La fuente ya duplica la carne en la Relación (cantidad 2 de chicharrón de pollo) y la yuca se queda en 1. El dúo marino está apagado en esa función: baja 2 piezas de pescado y 0 yuca.

Simulación de 1 plato de cada uno:

| Plato | Yuca que baja hoy | Lo que pediste |
|---|---|---|
| Chicharrón de pollo | 1 | 5 (1 bolsita) |
| Fuente de chicharrón de pollo | 1 | 10 (2 bolsitas) |
| Dúo marino | 0 | también lleva yuca; falta el número |

En el impreso la yuca no sale: el modal no imprime guarniciones, y si el mozo no marca el complemento «Yuca frita» el contador tampoco la anota. En varios platos ese complemento es opcional (`obligatorio: false`). El dúo marino no tiene opción Yuca en la carta.

## Qué habría que modificar (cuando se autorice)

Solo backend y panel. Cocina no arma este conteo. Mozos ya envían el complemento con el nombre de la carta; el fallo es leer `1/4 Pollo` y Humita.

1. `contadorPlatosReporte.js` — `saborDe` acepta `1/4 Pollo`, `1/4 Cerdo`, `1/4 Res` y `1/4 Carnero`, para que el impreso y el stock de carne dejen de caer en «sin sabor registrado».
2. El mismo contador — Humita del grupo Sabores pasa a una fila contable del registro, y esa fila entra en la hoja que se imprime.
3. Regla de humita, a dejar fija antes de codear. La que ya está en código es 1 humita por sabor del nombre (en el ejemplo, 21), aunque nadie marque la opción de S/ 8. La otra posible es contar solo la opción Humita que el mozo eligió. Son cuentas distintas.
4. `filasDelContador` — la humita y la yuca del registro entran al egreso. Hoy se descartan con el resto de guarniciones que no son bebida.
5. Yuca — factor 5 en chicharrón de pollo y 10 en la fuente. El dúo marino entra; falta confirmar si es 5 (1 bolsita) u otro número. La unidad de la fila Yuca queda en piezas: 5 piezas = 1 bolsita, 10 = 2.
6. Quitar el parche que inventa humitas solo por el título del plato, cuando el registro ya traiga la fila. Si se dejan los dos, el mismo plato baja la humita dos veces.

## Qué no se toca en este plan

Familias de despiece, cascada crudo/cocido, y el doble de carne de la fuente (eso ya está en la Relación). App cocina y app mozos no cambian de pantalla.
