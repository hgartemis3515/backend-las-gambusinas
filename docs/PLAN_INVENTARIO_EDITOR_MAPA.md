# Editor de mapas semánticos (Transformar)

**Pantalla:** `backend-gambusinas/public/inventario.html`, sección Transformar.  
**Estado:** en la hoja. El botón Editor de mapas guarda en `PUT /api/inventario/mapas`. Pato fresco, los platos del filete y Pota salen de ese documento.  
**Verdad del saldo:** sigue siendo el kardex. El mapa dice de dónde sale la mercadería y qué plato la come. No guarda un segundo saldo.

Planes de la hoja: `PLAN_INVENTARIO_HTML.md`, `PLAN_INVENTARIO_RELACION_PLATOS.md`.

## Qué queda al terminar

1. Un solo botón, **Editor de mapas**, en la cabecera de Transformar.
2. Al pulsarlo se elige un mapa para editarlo, se crea uno o se elimina el elegido.
3. Los mapas de hoy (Pollo fresco, Panceta, Carnero, Arroz, Carnes, trucha y pescado) siguen y se pueden editar con ese botón.
4. Entra el mapa **Pato fresco**: 1 fresco = 2 pechugas de pato y 2 piernas de pato.
5. El cuadro de **Filete de pollo** abarca, además de lo que ya tiene, los platos de la tabla de filete.
6. Entra el mapa **Pota**, solo con dos platos.

Cocina y mozos no pintan esta sección. El envío de comandas no se frena por estos mapas.

## Dónde está hoy

Los mapas están escritos en el HTML de Transformar (Pollo fresco, Panceta y Carnero, Arroz, Carnes / trucha / pescado). Los factores y la lista de aderezos viven en `config` y se guardan en `localStorage` (`inventario-conversiones`).

La columna Venta la arma el backend en `src/utils/inventarioSalidaVentas.js`. Esa función no lee el `localStorage`. Un mapa que solo exista en el navegador no baja el saldo cuando se vende.

En el cuadro de filete, la caja rotulada «Filete de pollo» escribe en `platosFilete.filete_junior`. El editor separa **Filete de pollo** (1) de **Filete junior** (0.5).

## El botón

Va en la misma fila que Reporte del día y Pasar a la hoja. Un botón. No hay un botón por mapa en la hoja.

Al pulsarlo abre un panel con tres acciones:

| Acción | Qué hace |
|---|---|
| Elegir y editar | Lista los mapas. El elegido se abre: nombre, tipo, origen, cortes, factor y platos con su consumo. |
| Crear | Pide nombre y tipo, y deja el mapa vacío para completarlo. |
| Eliminar | Pide confirmación y quita el mapa de Transformar. |

Crear ofrece dos tipos:

- **Despiece.** Un origen se parte en cortes con factor. Pollo fresco y Pato fresco son de este tipo. 1 origen produce los cortes a la vez. Los cortes no se suman entre sí.
- **Directo.** Un origen se relaciona con platos y una cantidad. No hay pechuga ni pierna. Pota es de este tipo.

La cantidad del plato acepta decimales (`0.5`).

Eliminar saca el mapa de la sección. No borra movimientos ya pasados a la hoja ni filas del kardex.

## Dos números distintos

| Número | Para qué sirve | Ejemplo |
|---|---|---|
| Factor de despiece | Cuántas piezas nacen al convertir hoy. Lo usan el − / + y Pasar a la hoja. | 1 pato fresco = 2 pechugas y 2 piernas |
| Consumo del plato | Cuánto resta una venta de ese corte. Lo usa la columna Venta. | Filete junior come 0.5 filete |

El consumo no es la cantidad que se convierte en el día. Convertir sigue siendo opcional: si la compra ya viene en filetes, pechugas o piernas, el ingreso se anota en la fila y el origen puede quedar en cero.

Papas, ensalada y el arroz del mismo plato no entran en la familia de la carne. El arroz de un arroz con pato sigue en el mapa de Arroz, fila Arroz pato.

## Mapas que ya están

Quedan como semilla del editor. Se editan y se pueden eliminar con el mismo botón.

| Mapa | Regla que se conserva |
|---|---|
| Pollo fresco | 1 fresco = 2 pechugas y 2 piernas. 1 pechuga a filete = 2 filetes. Pierna a filete solo si el factor es mayor que 0. |
| Panceta | Trozos a mano, sin factor fijo. |
| Carnero | 1 a 1 hacia Carnero pachamanca. |
| Arroz | El crudo se reparte en Arroz pollo, Arroz blanco y Arroz pato. Arroz blanco no pasa a chaufa. |
| Carnes, trucha y pescado entero | Ingreso directo, sin despiece. |
| Tollo y Perico | Tollo hacia chicharrón. Perico hacia ceviche. |

Pollada, Pollo pachamanca, Pecho a la leña, Pierna a la leña y Menú siguen en los cuadros de pieza (pechuga o pierna), no en el de filete.

## Pato fresco

Tipo despiece. Misma regla anatómica que el pollo.

1 Pato fresco = 2 Pechugas de pato y 2 Piernas de pato, las dos del mismo ave.

| Corte | Plato que abarca | Consumo |
|---|---|---|
| Pechuga de pato | Arroz con pato, opción pecho | 1 pechuga |
| Pierna de pato | Arroz con pato, opción pierna | 1 pierna |

Es un solo plato de la carta. El complemento elige el corte. Pecho no come pierna. Pierna no come pechuga.

Filas de la hoja, en un grupo que no suma patos con pechugas ni con piernas:

- Pato fresco. El rubro `pato` de `inventarioRubros.js` pasa a ser este origen.
- Pechuga de pato (`pechuga-pato`).
- Pierna de pato (`pierna-pato`).

El arroz de ese plato no se anota aquí. Sigue en Arroz pato.

## Filete de pollo

El cuadro grupal de Filete de Pollo cuelga de la pechuga (y de la pierna solo si el factor de pierna a filete es mayor que 0). Ya abarca Filete de pollo (1) y Milanesa (1). Esos dos se quedan.

Platos que se suman, con consumo de **filete**:

| Plato en la carta | Consumo |
|---|---|
| Filete junior | 0.5 |
| Fuente de Chicharrón de pollo | 2 |
| Arroz chaufa de pollo | 1 |
| Chicharrón de pollo acevichada | 1 |
| Chicharrón de pollo a la BBQ | 1 |
| Chicharrón de pollo chico | 1 |
| Lomo saltado de pollo | 1 |

Filete junior no tiene un plato de la carta con ese nombre. Es el rubro `filete-junior` y come 0.5 de `filete`.

El pedido no escribió la cantidad de Lomo saltado de pollo. Queda en 1, la misma unidad que el chaufa y los chicharrones de una porción. El editor la cambia.

Estos platos salen de los cuadros de pechuga y de pierna. Una venta resta filetes, no una pieza de pechuga o de pierna. Chicharrón de pollo chico come 1 filete. La Fuente come 2 filetes.

Los filetes del día siguen naciendo así: pechugas enviadas a filete × 2, más piernas enviadas a filete × el factor de Configuración. El 0.5 y el 2 no multiplican el pollo fresco.

## Pota

Tipo directo. Sin cortes y sin factor de despiece.

Origen: Pota (`pota`). El ingreso se anota en esa fila de la hoja.

| Plato | Consumo |
|---|---|
| Ceviche de chicharrón de pota | 1 |
| Chicharrón de pota | 1 |

Solo esos dos. Chicha de pota no entra en este mapa. Una venta de uno de ellos resta 1 de Pota.

## Guardado

El panel guarda los mapas en el backend, con el mismo permiso que la hoja (`ver-inventario`). `inventarioSalidaVentas.js` lee ese documento para armar la columna Venta.

Hoy no hay ruta de mapas. Hace falta:

- `GET /api/inventario/mapas`
- `PUT /api/inventario/mapas`

Cada mapa:

```
{
  id, nombre,
  tipo: "despiece" | "directo" | "manual",
  origen: { clave, nombre },
  cortes: [{ clave, nombre, factor }],
  platos: [{ nombre, complemento, cuelgaDe, cantidad }]
}
```

`manual` es la panceta: el cocinero anota los trozos, sin factor. `cortes` va vacío en un mapa directo.

Pasar a la hoja sigue escribiendo Transformación en el origen e Ingreso en el destino. El editor no mueve saldos.

## Orden

1. Ruta y documento de mapas en el backend, con las semillas de este plan.
2. El botón y el panel en `inventario.html`.
3. Pato fresco y Pota pintados desde ese documento, con sus filas en la hoja.
4. Los platos nuevos dentro del cuadro de Filete de pollo.
5. La venta de filete, de arroz con pato (pecho o pierna) y de pota usa esas cantidades.

## Qué no hace

- No impide enviar una comanda.
- No escribe el `stock` de la carta.
- Cocina y mozos no leen estos mapas.
- No mezcla el arroz, las papas ni la ensalada dentro del pollo, el pato o la pota.
