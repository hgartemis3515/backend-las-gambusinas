# Plan: en mozos se ve el stock, no el saldo

Fecha: 24 de octubre de 2026.  
Estado: solo plan. No implementar hasta que se pida.  
Sustituye el número del plan `PLAN_MOZOS_CANTIDAD_INVENTARIO.md`. El resto de ese plan (unir plato y rubro, bajar al enviar) sigue valiendo.

## Qué número es

En `inventario.html` hay dos cifras distintas.

| Dónde | Qué es | ¿Lo ve el mozo? |
|---|---|---|
| Día (Hoja), columna **Saldo** | Cuenta del día: ingreso total − venta − transformación | No |
| Día (Hoja), **Ingreso total** y **Final** de crudo | Otra cuenta del día | No |
| Sección **Stock**, chip de cada producto (`queda`) | Lo que hay disponible. 0 crítico, 1 a 10 bajo, 11 o más normal | Sí |

El número bajo el nombre en mozos es el chip de **Stock**. Si milanesa marca 100 ahí, la carta dice 100. No se copia la columna Saldo.

Hoy ese chip es `queda`: si hubo conteo físico, es el conteo; si no hubo, cae al saldo calculado. Al implementar, el mozo lee siempre el mismo campo que pinta el chip de Stock, no la columna Saldo.

`plato.stock` de platos.html es otro campo, escrito a mano. No es la fuente. La fuente es el stock del inventario.

## Qué pide el negocio

Bajo el nombre del plato en mozos sale el stock. Cada pedido baja ese stock en la app y en la sección Stock de `inventario.html`. La columna Saldo de la hoja sigue su fórmula y no es la cifra que se muestra al mozo.

## Contrato (una línea)

`disponible` del plato = chip de Stock del rubro (`queda`). Al pasar a `pedido`, baja ese stock en inventario y en mozos. El Saldo de la hoja no se publica en la carta.

## Cómo se ve

```
Milanesa
Stock 100
```

Ámbar si el estado del stock es Bajo (1 a 10). En 0, crítico: el plato no se ofrece. Sin rubro, no se muestra número.

## Al entrar un pedido

1. El plato pasa a `pedido`.
2. Baja 1 (o el factor) del stock de ese rubro. El chip de Stock pasa de 100 a 99.
3. Mozos recibe el stock nuevo y pinta 99.
4. La columna Saldo de la hoja no se usa para ese texto. La venta del día puede seguir anotándose en el kardex, pero la cifra publicada es el stock.

Anular el plato sube el stock. Una comanda PRUEBA no lo mueve. No se resta dos veces.

## Orden si se llega a hacer

1. Enlace plato ↔ rubro, igual que el plan anterior.
2. Publicar el chip de Stock (`queda`), no el Saldo.
3. Al vender, bajar ese stock y avisarlo por socket a mozos y al panel.
4. Probar: 100 en Stock → «Stock 100» en mozos → un pedido → 99 en las dos. La columna Saldo puede ser otro número y no se copia.

## Qué no hacer

- Mostrar Saldo, Ingreso total o Final debajo del nombre.
- Usar el `stock` manual de platos.html como si fuera el inventario.
- Restar antes de Enviar.
