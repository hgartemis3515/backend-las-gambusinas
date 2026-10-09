# Plan — Inventario del restaurante (`inventario.html`)

**Fecha:** 8 de octubre de 2026
**Estado:** fases 1 a 3 implementadas. Sin egreso automático ni copia a `plato.stock`.
**Alcance:** panel del backend, API nueva, aviso en app cocina. Mozos no registran inventario.

Una sección del panel, al estilo de `reportes.html`, para llevar el inventario de **todos los platos** del catálogo. Cada plato tiene dos existencias: **crudo** y **cocido**. El cuadre es un kardex. El saldo final es la existencia después de ingresos y egresos. La regulación ajusta el conteo físico, y lo que queda es el saldo inicial del cuadro siguiente.

---

## 1. Qué pide el negocio

| Pieza | Qué muestra |
|-------|-------------|
| Kardex | Saldo inicial, ingresos, total, egreso, saldo final, regulación y lo que baja al próximo registro. |
| Registro | Cada entrada y cada salida del producto, con fecha, cantidad, tipo y quién la hizo. |
| Crudo / cocido | La misma tabla partida en dos filas (o dos columnas) por plato. |
| Alerta crítica | Aviso cuando el saldo que queda está en el mínimo o por debajo. Se ve en el panel y en cocina. |

La regulación es el conteo físico y va después del saldo final. Si falta, se resta. Si sobra, se suma. Lo que queda baja al cuadro siguiente como saldo inicial. No se borra el historial.

## 2. Cómo está hoy

- El menú del panel vive en `public/assets/js/shared.js` (`pages`). Reportes es `reportes: { label: 'Reportes', href: '/reportes.html' }` y pide el permiso `ver-reportes`. El buscador (`cosmos-search.js`) y la barra superior también apuntan a esa página.
- Cada plato (`plato.model.js`) ya tiene `stock` (número, mínimo 0). La carta de mozos oculta el plato si `stock` es 0. No hay movimientos, ni crudo/cocido, ni alerta.
- En cocina, «sin stock» solo quita el plato de esa comanda. No mueve el inventario.
- No existe `inventario.html` ni una colección de movimientos.

El inventario nuevo no reemplaza el plato. El plato sigue siendo el producto. `stock` del plato, más adelante, puede copiar el saldo cocido para que mozos dejen de vender lo que se acabó. Eso no entra en la primera entrega.

## 3. La cuenta de una fila

Por plato y por tipo (crudo o cocido), en un turno o en el día:

```
total             = saldo inicial + ingresos
saldo final       = total − egreso
baja al siguiente = saldo final + regulación
```

El saldo final es la existencia según los movimientos, antes del conteo. La regulación va con signo: falta es negativa, sobra es positiva. Se aplica sobre el saldo final y no lo reescribe.

`baja al siguiente` es lo que queda. Se copia como **saldo inicial** de la fila siguiente del mismo plato y del mismo tipo. La fila anterior no se edita. La alerta crítica mira ese saldo que queda, no el saldo final a solas: un conteo que encontró falta tiene que poder disparar el aviso.

Ejemplo, arroz cocido:

| Saldo inicial | Ingresos | Total | Egreso | Saldo final | Regulación | Baja al siguiente |
|---------------|----------|-------|--------|-------------|------------|-------------------|
| 10 | 4 | 14 | 6 | 8 | −1 (falta 1) | 7 |
| 7 | 0 | 7 | 2 | 5 | 0 | 5 |

8 = 14 − 6. Lo que baja es 8 + (−1) = 7, y ese 7 abre la fila siguiente.

## 4. Contrato

Colección nueva `inventario_movimientos`. Un documento por entrada, salida o regulación. El kardex se calcula; no se guarda un saldo suelto que se pueda descuadrar.

```js
{
  plato: ObjectId,          // ref platos
  platoId: Number,          // id numérico del plato, para cocina
  nombre: String,           // snapshot
  tipoProducto: 'crudo' | 'cocido',
  clase: 'ingreso' | 'egreso' | 'regulacion',
  cantidad: Number,         // regulación: + sobra, − falta
  motivo: String,           // compra, producción, venta, merma, conteo
  comanda: ObjectId,        // solo si el egreso nació de una comanda
  usuario: ObjectId,
  fecha: Date
}
```

Umbral de alerta, en el plato (dos números, default 0 = sin alerta):

```js
alertaCritica: {
  crudo: { type: Number, default: 0, min: 0 },
  cocido: { type: Number, default: 0, min: 0 }
}
```

Saldo real de un tipo = suma de ingresos − suma de egresos + suma de regulaciones, desde el origen. En una fila del día, el saldo inicial es ese saldo justo antes del primer movimiento del grupo. El saldo final de la fila es saldo inicial + ingresos − egresos, sin la regulación de ese mismo grupo. Lo que baja al siguiente es el saldo final más la regulación, y coincide con el saldo real al cierre. No hace falta un documento de apertura.

Índice: `{ plato: 1, tipoProducto: 1, fecha: -1 }`.

## 5. API

Prefijo `/api/inventario`. Quien entra al panel de inventario. Cocina solo lee la alerta.

| Método | Ruta | Efecto |
|--------|------|--------|
| GET | `/api/inventario/kardex?desde&hasta` | Una fila por plato activo y por tipo. Columnas: saldo inicial, ingresos, total, egreso, saldo final, regulación, saldo que baja. |
| GET | `/api/inventario/movimientos?plato&tipo&desde&hasta` | Registro de entradas y salidas. |
| POST | `/api/inventario/movimientos` | Alta manual: ingreso, egreso o regulación. |
| GET | `/api/inventario/alertas` | Platos cuyo saldo que queda (después de la regulación) es menor o igual al umbral, y el umbral es mayor que 0. |
| PUT | `/api/platos/:id` | Guarda `alertaCritica` junto al plato. No es una ruta nueva. |

El egreso por venta no se dispara solo en esta fase. Cocina y el panel anotan la salida. En una fase posterior, entregar el plato en la comanda puede crear el egreso de **cocido** (cantidad del plato) si el negocio lo confirma. Hasta entonces el registro es manual y no se toca `plato.stock`.

Socket nuevo, solo para la alerta: `inventario:alerta` en `/cocina` y `/admin`, al crear un movimiento que deja el saldo en zona crítica o al salir de ella. No reemplaza eventos de comanda.

## 6. Panel (`inventario.html`)

Misma cáscara que `reportes.html`: topbar, sidebar, Alpine, Tailwind del dashboard. Alta en `shared.js` como `inventario: { label: 'Inventario', icon: '📦', href: '/inventario.html' }`, permiso `ver-inventario` (mismo grupo que reportes). Enlace en el buscador y en la barra, al lado de Reportes.

Cuatro bloques en la misma página:

1. **Kardex.** Filtro por día. Tabla: plato, tipo (crudo o cocido), saldo inicial, ingresos, total, egreso, saldo final, regulación, saldo que baja. El saldo final es antes del conteo. La última columna es lo que queda y el saldo inicial del próximo cuadro.
2. **Registro.** Tabla cronológica: fecha, plato, tipo, clase (entrada, salida, regulación), cantidad, motivo, usuario. Botón para anotar un movimiento.
3. **Crudo y cocido.** La misma lista de platos activos, dos saldos lado a lado y el umbral de cada uno.
4. **Alerta crítica.** Franja fija arriba si hay algún saldo en umbral. Lista corta: plato, tipo, saldo, umbral.

Un plato inactivo no entra al kardex del día. Los que ya tuvieron movimientos siguen en el registro histórico.

## 7. App cocina

No administra el kardex. En el KDS (vista general y personalizada) una franja muestra los platos en alerta crítica que lleguen por `GET /api/inventario/alertas` y por `inventario:alerta`. El cocinero ve el nombre y si es crudo o cocido. No resta stock desde la tarjeta del plato en esta fase.

Mozos no muestran esta pantalla. Cuando el saldo cocido se copie a `plato.stock`, la carta ya sabe ocultar el plato en 0. Eso queda fuera de este plan.

## 8. Fases

1. Modelo, API de kardex, movimientos y alertas. Permiso `ver-inventario`.
2. `inventario.html` con las cuatro tablas y el alta de un movimiento.
3. Franja de alerta en cocina.
4. Después, si el negocio lo pide: egreso automático al entregar el plato, y copia del saldo cocido a `plato.stock`.

## 9. Pruebas

- Plato sin movimientos: saldo inicial 0, total 0, saldo final 0, no aparece en alerta si el umbral es 0.
- Ingreso 10 crudo: total 10, saldo final 10, regulación 0, baja 10. El siguiente cuadro abre en 10.
- Egreso 3 cocido y regulación −1: saldo final = saldo inicial + ingresos − 3. Lo que baja es ese saldo final − 1.
- Regulación +2: el saldo final no cambia; lo que baja sube 2 y el registro guarda el sobrante.
- Saldo que queda en 2 y umbral 2: entra a alerta crítica en el panel y en la franja de cocina, aunque el saldo final antes del conteo fuera mayor.
- Plato inactivo: no sale en el kardex del día; sus movimientos viejos siguen en el registro.
- Un mozo no abre `inventario.html`.

## 10. Fuera de este plan

- Recetas (un plato descuenta varios insumos). El producto es el plato, no el ingrediente.
- Compras con proveedor, costo o factura.
- Inventario en la app de mozos.
- Borrar un movimiento. Una corrección es otra regulación.
