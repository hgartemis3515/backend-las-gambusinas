# PLAN — Envío mozo → KDS y entregar plato entero

> Creado: 24/09/2026 · Estado: implementado
> Medición después del recorte de JSON y de Defender: el envío del mozo ronda **3 segundos**. Antes eran 3 a 8.

---

## 0. Cómo está armado el local

Esta PC es el servidor. Mongo y el backend escuchan aquí.

| Quién | Cómo entra | Qué espera |
|---|---|---|
| Mozos | App de mozos → IP de esta PC, API del backend | Que al soltar la comanda la cocina la vea al momento |
| Cocina | Otra computadora abre la app de cocina por la IP de esta PC, **puerto 3001** | Que la tabla KDS pinte la comanda y que «entregar plato entero» responda al toque |
| Esta PC | Sirve el backend y la app | Cada clic de las otras dos máquinas pasa por este proceso de Node |

El mozo ya recibe el «enviado» cuando la comanda está guardada. Los 3 segundos que siguen notándose son el tiempo hasta que **la tabla KDS de la otra computadora** muestra el pedido. No es el disco de 22 MB: ese archivo ya no se reescribe en cada envío.

## 1. Por qué la cocina tarda en ver el envío

`POST /comanda` guarda la comanda, responde al mozo y **después** hace esto, en serie, antes de avisar a cocina:

1. Vuelve a leer la comanda y autoasigna cada plato a un cocinero.
2. Vuelve a leer la comanda y autoasigna las guarniciones.
3. Recién ahí llama a `emitNuevaComanda`.
4. `emitNuevaComanda` **vuelve a hacer populate** de mozo, mesa, área, cliente y platos, y manda el socket `nueva-comanda` a la sala del día.
5. Enseguida manda otro socket, `emitComandaActualizada`, con la misma comanda.

La app de cocina en el puerto 3001 no pinta la tarjeta hasta el paso 4. Si el primer aviso sale sin `procesandoPor`, las tablas de cocineros filtran el plato y queda vacío. Por eso hoy se espera a la asignación. El costo es que el KDS espera dos lecturas, dos motores de asignación y un populate de más.

El populate del paso 4 repite el que ya se hizo al crear la comanda. El segundo socket del paso 5 hace que la cocina refresque otra vez lo que acaba de recibir.

## 2. Por qué «entregar plato entero» se siente lento

En la tabla KDS, `batchFinalizarPlatos` (`appcocina/src/components/Principal/comandastyle.jsx`) recorre las líneas **una por una** y espera cada `PUT /comanda/:id/plato/:platoId/estado` antes de lanzar la siguiente.

Cada PUT, en esta PC:

- busca la comanda y la línea,
- cambia el estado (con «entero absoluto» recorre recoger → salio → entregado),
- puede cerrar guarniciones,
- guarda `entregadoPor`,
- devuelve la comanda y emite socket a cocina y mozos.

Un plato con varias líneas, o un entero que toca plato más guarniciones, son varias idas y vueltas desde la computadora de cocina hasta este servidor. La pantalla no termina hasta la última.

## 3. Qué hay que cambiar

### A. Que el KDS reciba la comanda en un solo aviso

Objetivo: la tarjeta aparece en cuanto el mozo suelta el envío, ya con cocinero asignado.

- Asignar platos y guarniciones y emitir **una** vez `nueva-comanda` con la comanda ya populada en memoria. No repetir `findById` + populate dentro de `emitNuevaComanda` si el objeto ya viene completo.
- No encadenar `emitComandaActualizada` justo después del alta. Ese segundo aviso es el que hace refetch en la cocina.
- Si la asignación tarda, pintar igual la tarjeta con los platos y completar `procesandoPor` en un parche corto, sin obligar a la cocina a volver a pedir el día entero.

El mozo no debe esperar nada de esto: la respuesta HTTP sigue saliendo al guardar.

### B. Entregar el plato entero en una sola petición

Un solo `PUT` (o el que ya existe, con la lista de líneas) marca todas las líneas de ese plato, cierra las guarniciones que correspondan y emite **un** socket. La cocina deja de esperar N respuestas seguidas.

La regla de negocio no cambia: con `entregarPlatoEnteroAbsoluto` el plato pasa a entregado; el permiso sigue siendo `entregar-plato-entero-kds`.

### C. Aprobar una comanda sin rehacer el día

`emitComandaAprobada` debe mandar el ticket y los platos liberados. La cocina actualiza esas líneas en la tarjeta que ya tiene. No hace falta que, al aprobar, el KDS vuelva a descargar todas las comandas del día.

## 4. Qué no vuelve a tocarse

- No reescribir `data/*.json` en el envío. Eso queda en el cierre de caja.
- No listar todas las comandas dentro de la respuesta al mozo.
- Defender ya excluye `data`, `node.exe` y `mongod.exe`. Ethernet 2 ya tiene prioridad 10. Si Radmin VPN se vuelve a conectar, hay que dejarle métrica 50 para que no se ponga delante del cable.
- Mozos y la computadora de cocina deben usar la IP `192.168.50.x` de esta PC. El puerto 3001 es la app de cocina; la API sigue en el backend de esta máquina.

## 5. Cómo se sabe que quedó

- Soltar una comanda en la app de mozos y ver la tarjeta en la tabla KDS de la otra computadora en menos de 1 segundo, con cocinero ya puesto.
- «Entregar plato entero» en un plato de varias líneas termina en un solo toque, sin una espera por línea.
- Aprobar esa comanda actualiza la misma tarjeta sin recargar la tabla.
