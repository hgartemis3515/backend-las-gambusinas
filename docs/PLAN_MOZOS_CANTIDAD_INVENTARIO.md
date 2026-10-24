# Plan: cantidad de inventario debajo del plato en mozos

Fecha: 24 de octubre de 2026.  
Estado: solo plan. No implementar hasta que se pida.

El mozo, en la carta, tiene que ver debajo del nombre cuánto queda. Ese número es el mismo que **Queda** en `inventario.html`. Cada pedido baja el número en las dos pantallas.

## Qué pide el negocio

En la app de mozos, bajo el nombre del plato (ejemplo milanesa) aparece 100 si en inventario hay 100. Al enviar un pedido de milanesa, baja a 99 en mozos y en la hoja del día. El rubro del inventario y el plato de la carta son la misma cuenta.

## Cómo está hoy

- `inventario.html` guarda el kardex por **rubro** (`pollo-lena`, `filete`, `ceviche`…). La venta de comandas ya resta en la columna Venta, con el mapa de `inventarioSalidaVentas.js`.
- El catálogo del plato ya tiene `plato.stock`. Mozos lo usa para **ocultar** el plato si es 0 (`OrdenesScreen`, `PlatoBuscadorCard` no muestra ese número).
- Ese `stock` se edita a mano en `platos.html`. **No se copia** desde el inventario. El plan viejo (`PLAN_INVENTARIO.md` §7 y §10) lo dejó fuera.
- Cocina recibe `inventario:alerta` (mínimo). No recibe el saldo para pintar la carta.
- Un plato de carta no siempre es un rubro. Un cuarto y un medio de pollo a la leña bajan el mismo `pollo-lena`. El mixto leña baja pollo y panceta. La milanesa, si no tiene rubro, no tiene número.

## Veredicto

La idea encaja con lo que ya hay: un número, dos pantallas. No hace falta un segundo inventario.

El trabajo es unir plato ↔ rubro y **mostrar** el saldo. Hoy el mapa de ventas cubre pocos nombres. Sin ese enlace, “100 milanesas” no existe en el kardex.

## Contrato (una línea)

`plato.stock` visible = saldo **queda** del rubro (cocido si el plato sale cocido; si no, crudo). Al pasar el plato a `pedido`, baja 1 (o el factor) en el kardex y en la carta.

## Cómo se vería en mozos (Tab A11)

En la tarjeta del buscador, debajo del nombre, una sola línea chica:

```
Milanesa
Hay 100
```

Si queda poco (umbral del rubro): `Hay 8` en ámbar. Si queda 0: el plato no se ofrece (igual que hoy con `stock <= 0`). Si el plato **no** tiene rubro: no se inventa un 100; no se muestra cantidad.

Toque grande, texto ≥ 14, sin abrir otra pantalla. El número no tapa Sumar / G / V.

## Cómo bajaría el número

1. El mozo envía la comanda. El plato pasa a `pedido`.
2. El backend, con el mapa plato → rubro (y factor), resta esa cantidad del kardex del día. Es la misma baja que ya hace “Venta comandas”.
3. Recalcula `queda` del rubro y lo escribe en `plato.stock` de **todos** los platos que usan ese rubro (cuarto y medio de leña ven el mismo 99).
4. Emite a `/mozos` y `/admin` un evento corto, por ejemplo `inventario:stock`, con `{ rubro, queda, platoIds }`.
5. Mozos pinta el número nuevo. `inventario.html` ya refresca con el kardex; al recargar o por socket, Venta y Queda bajan.

Si se anula o se elimina el plato, el saldo vuelve a subir. Una comanda PRUEBA no baja.

No restar dos veces: o el mapa de reportes, o este paso al `pedido`. Una sola resta.

## Qué agregar (cuando se implemente)

### Backend

1. Campo en el plato: `rubroInventario` (clave del kardex) y, si hace falta, `factorInventario` (1 por defecto; medio leña sigue en 1 hasta que el negocio diga 2).
2. Completar el mapa nombre → rubro para lo que ya se vende (milanesa, filete, ceviche, leña, pachamanca, etc.). Lo que no tenga rubro no muestra cantidad.
3. Al crear/editar movimiento o al entrar venta: copiar `queda` → `plato.stock` de los platos de ese rubro.
4. Evento `inventario:stock` a `/mozos` y `/admin`. Cocina puede ignorarlo o usarlo solo en la alerta.

### Panel

- En `platos.html`, elegir el rubro del inventario. Sin rubro = sin número en mozos.
- `inventario.html` no cambia de forma. La hoja sigue siendo la cuenta. El 100 de milanesas es el Queda de esa fila.

### Mozos

- `PlatoBuscadorCard`: bajo el nombre, `Hay {stock}` si el plato tiene rubro.
- Incluir `stock` (y el rubro, si se manda) en la comparación del `memo`, para que la fila se actualice.
- Escuchar `inventario:stock` y parchar el catálogo en memoria. No volver a bajar toda la carta.
- Si `stock` llega a 0, el plato deja de ofrecerse, igual que ahora.

### Cocina

Revisada: no pinta la carta. Sigue con la franja de mínimo. No fuerza el número bajo el plato en el KDS.

## Cómo se ve el flujo

```
Inventario  Queda milanesa = 100
     │
     ▼
plato.stock = 100     →  mozos: "Hay 100"
     │
pedido de 1 milanesa
     │
     ▼
kardex Venta +1, Queda 99
plato.stock = 99      →  mozos: "Hay 99"
inventario.html       →  misma fila en 99
```

## Orden si se llega a hacer

1. Enlace plato ↔ rubro (panel + mapa). Sin esto no hay milanesas en el kardex.
2. Copiar `queda` a `plato.stock` al mover inventario o al vender.
3. Pintar `Hay N` en la tarjeta de mozos y el socket.
4. Comprobar: un pedido baja mozos e inventario; anular sube; PRUEBA no mueve; dos platos del mismo rubro muestran el mismo N.

## Qué no hacer

- Un segundo stock solo en la app.
- Recetas (un plato que descuenta harina, huevo y carne) en esta fase.
- Mostrar cantidad en platos sin rubro.
- Restar al armar el ticket, antes de Enviar. Solo al quedar en `pedido`.
- Copiar el diseño de escritorio a la Tab A11.

## Pendiente de confirmar antes de codificar

- ¿La cantidad se ve en todos los platos con rubro, o solo en algunos (carnes, leña)?
- ¿Al llegar a 0 se oculta el plato (hoy) o se muestra “Hay 0” y no se puede sumar?
- ¿El 1/2 pollo a la leña baja 1 o 2 de `pollo-lena`?
