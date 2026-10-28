# Plan: Relación de platos en inventario

Estado: solo plan. No hay cambios de código.
Pantalla: `backend-gambusinas/public/inventario.html`
Carta de rubros: `backend-gambusinas/src/utils/inventarioRubros.js`
Platos guardados: `GET /api/platos` (activos), con `categoria` y `complementos`.
Cómo se ve la pantalla hoy: `docs/DOC_INVENTARIO_PANTALLA.md`.

## 1. Qué queda al terminar

1. La pestaña **Día (Hoja)** pasa a llamarse **Inventario Tabla**.
2. La pestaña **Conteo** pasa a ser **Relación de platos**: lista de platos guardados, con categoría y complementos, y una herramienta para decir qué rubro del inventario come cada plato y cuánto.
3. En Inventario Tabla, los rubros de una misma familia de despiece se pliegan en un grupo, con el mismo gesto que las comandas agrupadas (fila padre, ▶/▼, hijos debajo).
4. El despiece, si se usa, parte 1 fresco en 2 piernas y 2 pechugas. Pierna y pechuga no se mezclan: cada una puede ir a filete o a un aderezo (Pollada, Pollo pachamanca, Pollo leña, Menú y los demás de la carta). Esa conversión es opcional. La compra a veces ya viene en piernas, en pechugas o en filetes, y se anota directo en Inventario Tabla sin pollo fresco.
5. El botón **Configuración** que ya está en la pantalla abre el modal donde se cambia todo eso: factores, qué corte va a filete, la lista de aderezos, las cantidades de cada plato, el 1 a 1 del carnero, la nota de panceta manual y el reparto del arroz. Carne, trucha y pescado entero entran directo, sin transformación.
6. Lo que ingresa de arroz es **Arroz crudo**. Se transforma en Arroz pollo, Arroz blanco o Arroz pato. Arroz blanco no pasa a Arroz chaufa.
7. Transformar y Crudo y cocido no tienen saldo propio. Los dos escriben en las filas de **Inventario Tabla** (la sección que hoy se llama Día (Hoja)). El arroz transformado también.
8. Los nombres de las secciones quedan en blanco `#ffffff` y un 30 % más grandes.

## 2. Qué sigue igual

- La columna **Inventario** de la hoja (conteo físico) y el botón **Contar cámara**. El saldo real de la hoja sigue siendo el conteo si alguien contó. La pestaña Conteo desaparece; el conteo no.
- **Contar cámara** abre el modal de conteo físico que ya existe (`abrirCorreccion` con título Inventario). Deja de cambiar a la pestaña `conteo`, porque esa pestaña ya no existe. El enlace «Verificar en modo Conteo» de la alerta pasa a decir «Contar cámara».
- Fórmula de la hoja: ingreso total, saldo, saldo real y diferencia, como en la sección 5 de `DOC_INVENTARIO_PANTALLA.md`.
- El mapa de ventas de reportes (`inventarioSalidaVentas.js`). Este plan no descuenta la venta de una comanda con la receta nueva. La relación es para armar, agrupar y transformar. El descuento automático por venta queda fuera.
- Pestañas Crudo y cocido, Transformar, Stock, y el resto del menú Configuración (compacto, ocultar cuadro de saldo, eliminar hoy, poner en 0).
- Colores de los encabezados de columna de la hoja. Esos colores dicen qué columna es. Solo cambian los nombres de sección.
- Cocina y mozos. Esta pantalla solo vive en el panel.

## 3. Nombres y tamaño

Nombres de sección = las pestañas y los títulos de bloque (`h2` de cada panel, el botón Configuración, el título de Relación de platos, «Despiece de pollo», «Transformación de pescado», «Stock», «Historial de movimientos»).

| Dónde | Hoy | Después |
|---|---|---|
| Pestañas | `text-xs` (12 px), inactiva en gris, activa texto negro sobre oro | 15.6 px, texto `#ffffff` |
| Título de bloque | `text-sm` (14 px), oro | 18.2 px, texto `#ffffff` |
| Botón Configuración | `text-xs` (12 px) | 15.6 px, texto `#ffffff` |

La pestaña activa se distingue con borde blanco de 2 px. El texto de la activa también es `#ffffff`. El fondo oro con letras blancas no se usa: el oro `#d4af37` no sostiene blanco.

Texto de la pestaña de la hoja: **Inventario Tabla**.
Título de impresión (hoy «Inventario · Día (Hoja)»): **Inventario Tabla · {fecha}**.
El id interno de la vista puede seguir siendo `tabla`.

## 4. Relación de platos

Reemplaza el bloque `vistaTab === 'conteo'` (hoy «Conteo físico de cámara»).

### Lista

Carga `GET /api/platos` con activos. Cada plato muestra:

- categoría
- nombre
- grupos de complementos y el nombre de cada opción

Un plato puede tener líneas de receta propias. Una opción de complemento puede tener las suyas, cuando el complemento es lo que consume (un extra). Las dos cosas se editan con el mismo formulario.

### Receta

Una línea es: plato (y, si aplica, grupo + opción de complemento) + rubro del inventario + cantidad. La cantidad acepta decimales (`0.5`).

Papa frita y la ensalada no están en la carta de `inventarioRubros.js`. La herramienta solo enlaza rubros que ya existen (`clavesGuardables`). Si eligen un producto que no está, la línea no se guarda y se ve «falta en la carta». El arroz que entra es `arroz`, con nombre de hoja **Arroz crudo**. El arroz ya transformado es Arroz pollo, Arroz blanco o Arroz pato.

### Pierna y pechuga, filete o aderezo

Son dos cortes distintos. El despiece los cuenta en filas separadas. Cada corte tiene dos salidas, y elegir una no obliga a la otra:

- **Filete.** 1 pechuga nace en 2 filetes. 1 pierna también puede volverse filete: el factor se escribe en el modal. Al nacer esa casilla va vacía y Transformar no convierte piernas a filete hasta que el factor sea mayor que 0.
- **Aderezo.** 1 pierna o 1 pechuga que se manda a un aderezo suma 1 en ese rubro y resta 1 de su propio corte. Pollada, Pollo pachamanca, Pollo leña y Menú aceptan los dos cortes. La lista se edita en el mismo modal: agregar, quitar, renombrar, y marcar si ese aderezo recibe pierna, pechuga o las dos.

El filete que sale después se reparte entre platos con otra cantidad (Filete de pollo come 1, Filete junior come 0.5). Eso es receta, no despiece.

### Propuesta con los platos que ya están guardados

Leído del respaldo de platos activos del 27 oct 2026 (87 platos) y de los rubros de `inventarioRubros.js`. Son cantidades de partida. Todas se cambian en el modal.

Platos de la carta que comen pollo:

| Plato guardado | Categoría | Rubro | Corte | Cantidad |
|---|---|---|---|---|
| Filete de pollo + papas fritas + arroz + ensalada | POLLO - CARNES | `filete` | el filete ya convertido | 1 |
| Filete de pollo + papas fritas + arroz + ensalada | POLLO - CARNES | Arroz pollo, Arroz blanco o Arroz pato | el arroz ya transformado, no el crudo | por completar |
| 1/4 pollo + papas fritas + ensalada | POLLO A LA LEÑA | `pollo-lena` | pierna o pechuga | 1 |
| Pachamanca 1, 2 y 3 sabores, opción de complemento Sabores = Pollo | PACHAMANCAS | `pachamanca-pollo` | pierna o pechuga | 1 |
| Pachamanca 4 sabores (el nombre ya incluye 1/4 pollo) | PACHAMANCAS | `pachamanca-pollo` | pierna o pechuga | 1, en el plato, sin repetir si también marcan el sabor Pollo |
| Chicharrón de pollo a la BBQ + arroz + papas fritas | CHICHARRONES | `chi-pollo-bbq` | pierna o pechuga | 1 |
| Chicharrón de pollo acevichada + arroz y yuca frita | CHICHARRONES | `chi-pollo-acevichada` | pierna o pechuga | 1 |
| Chicharrón de pollo chico + yuca frita + zarza criolla | CHICHARRONES | `chicharron-pollo` | pierna o pechuga | 0.5 |
| Fuente de Chicharrón pollo | CHICHARRONES | `chicharron-pollo` | pierna o pechuga | por completar |
| Arroz chaufa de pollo | SALTADOS - CHAUFAS | `chaufa-pollo` | pechuga o filete | por completar |
| Lomo saltado de pollo | SALTADOS - CHAUFAS | `salt-pollo` | pechuga o filete | por completar |
| Milanesa con arroz + papas fritas + ensalada | POLLO - CARNES | `milanesa` | filete | 1 |
| Pan con Pollo | SÁNDWICHES (Desayuno) | `sandwiches` | pierna o pechuga | por completar |

En 1, 2 y 3 sabores de pachamanca el pollo es una opción del complemento (también están Chancho, Res y Carnero). Solo la opción Pollo come pierna o pechuga. Chancho de ese complemento es Panceta, no pollo. Res es Carne Pachamanca. Carnero es el 1 a 1 de Carnero pachamanca.

Aderezos que están en el inventario y no tienen un plato activo con ese nombre en ese respaldo. Igual entran a Transformar y al modal, para poder partir piernas y pechugas hacia ellos:

| Aderezo | Clave | Nota |
|---|---|---|
| Pollada | `pollada` | no hay plato «Pollada» |
| Menú | `menu` | no hay plato «Menú» |
| Filete junior | `filete-junior` | la receta propuesta sigue en 0.5 de `filete`; el despiece no llena esta fila |
| Arroz con pollo | `arroz-pollo` | no hay plato con ese nombre |
| Pollo a la olla | `pollo-olla` | no hay plato con ese nombre |
| Sandwich, Evento, Beata, Sr. Juan, Bubu | `sandwiches`, `evento`, `beata`, `sr-juan`, `bubu` | ya son destinos del despiece de hoy; no son platos de esta carta |

Pan con queso trae un complemento «leña: Pecho, Pierna» junto a opciones de prueba (Pan, Jose). No se usa como receta de pollo.

Los dos filetes (el plato de la carta con cantidad 1, y Filete junior con 0.5) se agrupan bajo el rubro Filete. Los cuatro platos de pachamanca, cuando llevan pollo, se agrupan bajo Pollo pachamanca. Los chicharrones de pollo se agrupan bajo su rubro.

### Agrupación en esta pantalla

Si varios platos comen el mismo rubro, se ven como un grupo de comandas (`comandas.html`, fila `tipo === 'grupo'`):

- fila padre con ▶/▼ y la pastilla **GRUPO**
- nombre del rubro y cuántos platos cuelgan
- al abrir, una fila por plato con su cantidad
- el plato Filete de pollo (1) y Filete junior (0.5) quedan bajo **Filete**
- las pachamancas con sabor Pollo quedan bajo **Pollo pachamanca**

El padre no suma 1 + 0.5 en un solo total de «platos». Muestra las líneas.

También se puede partir de un plato y ver sus rubros (Pollo a la leña → pollo, arroz, …). Las dos lecturas usan los mismos datos.

## 5. Agrupación en Inventario Tabla

Misma interacción: fila padre, ▶/▼, pastilla GRUPO, hijos con sus columnas de siempre.

El grupo es la familia de despiece, no la receta. Un plato que come pollo y arroz no mete el arroz dentro del grupo Pollo. El padre no suma unidades distintas.

Familias y quién entra:

| Familia | Filas | Transformación |
|---|---|---|
| Pollo | `pollo-origen`, `pierna-pollo`, `pechuga-pollo`, `filete` y cada aderezo (Pollada, Pollo pachamanca, Pollo leña, Menú, chicharrones, y los que el modal deje activos) | 1 fresco → 2 piernas y 2 pechugas. Cada corte va a filete o a un aderezo, por separado. `filete-junior` va en el grupo y el despiece no lo llena |
| Panceta | panceta entera, `trozo-panceta` | Manual. El chancho de esta pantalla se llama **Panceta**. Cerdo, en los platos, es esta familia |
| Carnes | Carne Bistec, Lomo Fino, Carne Pachamanca, Carne Guiso | Ninguna. Entran directo |
| Trucha | Trucha entera, Filete de trucha | Ninguna. Entran directo |
| Carnero | Carnero, Carnero pachamanca | 1 Carnero → 1 Carnero pachamanca. La clave vieja `cordero` sigue en `pachamanca-cordero` |
| Pescado entero | una fila, `pescado-entero` | Ninguna. Entra directo |
| Arroz | `arroz` (Arroz crudo), `arroz-tipo-pollo`, `arroz-blanco`, `arroz-pato` | El crudo es el ingreso. Se reparte en Arroz pollo, Arroz blanco y Arroz pato. No hay paso de Arroz blanco a Arroz chaufa |

`filete-junior` se pliega bajo Pollo. El 0.5 vive en la receta del plato Filete Junior contra el rubro `filete`.

La fila suma `pachamanca` de hoy no reemplaza a Pollo pachamanca, Carne Pachamanca ni Carnero pachamanca. Cada una se ve en su familia.

Yuca, humita y el resto siguen como fila suelta. El cuadro tollo → chicharrón y perico → ceviche que ya existe no se redefine aquí. El rubro `arroz-pollo` (Arroz con pollo, aderezo de pollo) no es Arroz pollo. El rubro `pato` no es Arroz pato. El chaufa de la carta (`chaufa-pollo` y los otros) no sale del arroz blanco.

## 6. Modal de Configuración

El botón Configuración que ya existe sigue abriendo su cuadro (compacto, ocultar saldo, borrar hoy, poner en 0). Dentro, **Conversiones** abre un modal. Ahí se edita la conversión, los aderezos y las relaciones. La pestaña Relación de platos muestra esos mismos datos y abre este modal para cambiarlos. No hay un segundo formulario.

Tres bloques en el modal:

1. **Factores**

| Familia | Qué se edita | Valor al nacer |
|---|---|---|
| Pollo | 1 fresco → piernas | 2 |
| Pollo | 1 fresco → pechugas | 2 |
| Pollo | 1 pechuga → filetes | 2 |
| Pollo | 1 pierna → filetes | vacío, hasta que lo escriban |
| Carnero | 1 Carnero → Carnero pachamanca | 1 |
| Panceta | nada: no hay factor | los trozos se escriben en Transformar |
| Carnes | nada | cuatro rubros, entran directo |
| Trucha | nada | Trucha entera y Filete de trucha, entran directo |
| Pescado entero | nada | entra directo |
| Arroz | 1 crudo → Arroz pollo | 1 |
| Arroz | 1 crudo → Arroz blanco | 1 |
| Arroz | 1 crudo → Arroz pato | 1 |

Un fresco produce piernas y pechugas a la vez. No es un solo paso «1 = 4 piezas». Esos factores solo corren cuando alguien convierte. No bloquean el ingreso directo de piernas, pechugas o filetes en Inventario Tabla.

2. **Aderezos de pollo.** Tabla con nombre, clave, si acepta pierna y si acepta pechuga. Se puede agregar una fila, quitarla o cambiar el nombre. Al nacer incluye Pollada, Pollo pachamanca, Pollo leña, Menú, Chicharrón de pollo, Chi. pollo a la BBQ, Chi. pollo acevichada, Salt de pollo, Chaufa de pollo, Arroz con pollo, Pollo a la olla, Milanesa, Sandwich, Evento, Beata, Sr. Juan y Bubu. Los cuatro primeros aceptan pierna y pechuga. El resto también, y el modal permite apagar un corte.

3. **Relaciones.** Las filas de la sección 4, con plato, complemento, rubro y cantidad. Una cantidad «por completar» se guarda vacía y no mueve la hoja hasta que tenga número. Cambiar aquí una cantidad cambia la pestaña Relación de platos.

Junto a Panceta, el modal dice: «Chancho y cerdo son Panceta. Los trozos (10, 12 u otro número) se anotan en Transformar». Junto a Carnero: «La clave guardada de la pachamanca sigue siendo cordero». Junto al arroz: «Arroz blanco no se convierte en Arroz chaufa». El modal no tiene esa fila.

Regla al guardar: cada factor que tenga número es mayor que 0. La casilla vacía de pierna → filete se puede dejar vacía. Se guarda en el backend, no en el navegador.

## 7. Crudo y cocido

Crudo y cocido es la misma mercadería de Inventario Tabla, partida en crudo y en cocido. La clave es la misma. Anotar 15 piernas crudas aquí sube el saldo de la fila Pierna en Inventario Tabla. Anotar Pollo pachamanca cocido cambia esa fila de la Tabla. Arroz crudo es la fila cruda del arroz. Arroz pollo, Arroz blanco y Arroz pato son las filas que suben al transformar, y aquí se ven como el cocido de esa misma clave. No queda un número solo en esta pestaña.

En el cuadro Pachamanca, la fila `pachamanca-pollo` (hoy se llama «Pollo») se muestra **Pollo pachamanca**.

El pollo crudo recién ingresado sigue en el origen (`pollo-origen`, crudo). Piernas y pechugas son el despiece. Cuando una pierna o una pechuga se adereza, esa unidad pasa a la fila de ese aderezo (Pollo pachamanca, Pollada, Pollo leña, Menú, u otro que esté activo en el modal). El fresco, cada corte y cada aderezo no comparten fila.

Carnero pachamanca es la fila del 1 a 1, distinta del Carnero entero. Carne Pachamanca es una de las cuatro carnes que entran directo: no sale de transformar otra carne. Panceta no se adereza sola a pachamanca.

## 8. Despiece de pollo

El cuadro «Despiece de pollo» deja de repartir 1 pollo crudo = 1 unidad de Filete, Pachamanca, Pollada, etc. El historial viejo no se reescribe.

Convertir es opcional. Hace falta pollo fresco solo cuando ese día se parte un fresco. Si la compra son piezas o filetes, el ingreso se escribe en la fila de Inventario Tabla (Pierna, Pechuga o Filete) y Transformar puede quedar en cero. Un filete comprado no exige pechuga, y una pierna comprada no exige fresco. Esas filas también pueden recibir crudo o cocido; ese dato es el de la misma fila de la Tabla.

Cuando sí se convierte, guardar en Transformar mueve la Tabla: baja el origen y sube el destino. El cuadro muestra la cuenta y no deja repartir de más. El ejemplo de abajo es ese caso, no la única forma de tener piezas.

```
Pollos frescos           10
Piernas                  20    (10 × 2)
Pechugas                 20    (10 × 2)

Piernas → Pollo pachamanca     4
Piernas → Pollo leña           3
Piernas → Pollada              2
Piernas → Menú                 1
Piernas → filete               0    (la fila se ve; el factor sigue vacío)

Pechugas → filete              6    →  12 filetes
Pechugas → Pollo pachamanca    4
Pechugas → Pollada             2
Pechugas → Menú                2

Piernas libres                 10
Pechugas libres                 6
```

- Piernas = frescos × factor de pierna. Pechugas = frescos × factor de pechuga. Salen las dos del mismo fresco.
- Filetes de pechuga = pechugas enviadas a filete × factor de pechuga. Filetes de pierna = piernas enviadas a filete × el factor del modal. Con la casilla vacía, esa fila no suma filetes.
- Cada pierna o pechuga mandada a un aderezo suma 1 en ese rubro y resta 1 solo de su corte. En el ejemplo, Pollo pachamanca entra 8 (4 piernas + 4 pechugas), Pollada entra 4, Pollo leña entra 3 y Menú entra 3.
- Libre de piernas y libre de pechugas se calculan aparte. Si uno de los dos pasaría de 0, no se guarda. El aviso ámbar de hoy se usa para ese caso.
- Lo que sobra queda en `pierna-pollo` y `pechuga-pollo`.

La lista de aderezos del cuadro es la del modal. Al nacer se ven, cada uno con caja de piernas y caja de pechugas: Pollo pachamanca, Pollo leña, Pollada, Menú, Chicharrón de pollo, Chi. pollo a la BBQ, Chi. pollo acevichada, y el resto de la sección 6. Pachamanca escribe en `pachamanca-pollo`.

Al guardar, se anotan movimientos como hoy (`Pasa a {destino}` en el origen, `Sale de {origen}` en el destino), con la cantidad ya convertida:

| Rubro en Inventario Tabla | Qué le pasa con el ejemplo |
|---|---|
| Pollo fresco (`pollo-origen`) | salen 10 |
| Pierna | entran 20 y salen 10; quedan 10 |
| Pechuga | entran 20 y salen 14; quedan 6 |
| Filete | entran 12 |
| Pollo pachamanca | entra 8 |
| Pollo leña | entra 3 |
| Pollada | entra 4 |
| Menú | entra 3 |

Eso es «la transformación aumenta el número»: el ingreso del destino sube en Inventario Tabla, y con él el ingreso total y el saldo de esa fila. El origen baja por la salida de transformación. Crudo y cocido de esas mismas filas lee y escribe ese saldo, no otro.

Compra directa, el otro caso, sin usar el ejemplo de los 10 frescos: Pierna ingreso 15, Filete ingreso 8, Pollo fresco en 0, despiece en cero. Esas 15 y esos 8 ya son el saldo de Inventario Tabla. En Crudo y cocido se ven como Pierna cruda 15 y Filete crudo 8.

### Panceta, a mano

El chancho de esta pantalla se llama Panceta. No hay factor fijo: una panceta puede salir en 10 trozos, en 12, o en otro número.

En Transformar hay un cuadro Panceta: cantidad de pancetas que se parten, y una caja donde se escribe cuántos trozos salieron. Guardar resta esas pancetas y suma los trozos escritos en `trozo-panceta`. Ejemplo: 1 panceta → 12 trozos. Trozo de panceta sube 12 en Inventario Tabla.

### Carnero, 1 a 1

Cuadro Carnero: lo que se anota en Carnero pasa igual a Carnero pachamanca. 3 carneros → ingreso 3 en Carnero pachamanca y salida 3 del Carnero entero.

### Arroz

Lo que ingresa es Arroz crudo (`arroz`). En Transformar se reparte en tres destinos. Cada unidad que se manda sale del crudo y entra en ese destino de Inventario Tabla. El factor nace en 1 y se cambia en el modal.

```
Arroz crudo ingresado     20

Arroz pollo                8
Arroz blanco               6
Arroz pato                 4

Crudo libre                2
```

No hay destino Arroz chaufa. Arroz blanco no se transforma en chaufa. El plato «Arroz chaufa de pollo» sigue relacionado al rubro `chaufa-pollo` (la carne), no a este arroz.

Arroz pollo de este cuadro es la clave nueva `arroz-tipo-pollo`. No escribe en `arroz-pollo` (Arroz con pollo). Arroz pato es `arroz-pato`. No escribe en `pato`.

### Sin cuadro de transformación

Carne Bistec, Lomo Fino, Carne Pachamanca y Carne Guiso se anotan como ingreso en Inventario Tabla. Trucha entera y Filete de trucha igual. Pescado entero igual. Transformar no muestra un despiece para ellos.

El día del movimiento es el día de trabajo de la pantalla (corte a las 04:00, como el resto del inventario). Al día siguiente el cuadro de transformar vuelve a cero para anotar de nuevo; el saldo que quedó sigue en la hoja por el arrastre, igual que ahora.

## 9. Rubros nuevos

| Clave | Nombre en la hoja | Cómo entra |
|---|---|---|
| `pierna-pollo` | Pierna | ingreso directo, o despiece opcional (2 por fresco) |
| `pechuga-pollo` | Pechuga | ingreso directo, o despiece opcional (2 por fresco) |
| `trozo-panceta` | Trozo de panceta | número escrito en Transformar |
| `carnero` | Carnero | ingreso directo; origen del 1 a 1 |
| `carne-guiso` | Carne Guiso | ingreso directo |
| `pescado-entero` | Pescado entero | ingreso directo |
| `arroz-tipo-pollo` | Arroz pollo | transformación desde Arroz crudo |
| `arroz-blanco` | Arroz blanco | transformación desde Arroz crudo. No pasa a chaufa |
| `arroz-pato` | Arroz pato | transformación desde Arroz crudo |

Nombres de hoja de rubros que ya existen:

| Clave actual | Nombre en la hoja |
|---|---|
| `bisteck` | Carne Bistec |
| `lomo-fino` | Lomo Fino |
| `pachamanca-res` | Carne Pachamanca |
| `trucha` | Trucha entera |
| `filete-trucha` | Filete de trucha |
| `pachamanca-cordero` | Carnero pachamanca |
| `panceta` | Panceta |
| `arroz` | Arroz crudo |

Van en `KARDEX` (no son filas suma). El rubro `filete` que ya existe también acepta ingreso directo, además de la conversión opcional desde pechuga o pierna. Crudo y cocido no mezcla Pierna ni Pechuga con Pollo pachamanca.

## 10. Datos

Colección o documento único, editado por quien ya puede anotar inventario (`ver-inventario`).

```
conversiones: {
  pollo: { frescoAPierna: 2, frescoAPechuga: 2, pechugaAFilete: 2, piernaAFilete: null },
  carnero: { aPachamanca: 1 },
  panceta: { modo: 'manual' },
  arroz: { aPollo: 1, aBlanco: 1, aPato: 1 },
  aderezosPollo: [
    { clave: 'pollada', nombre: 'Pollada', aceptaPierna: true, aceptaPechuga: true },
    { clave: 'pachamanca-pollo', nombre: 'Pollo pachamanca', aceptaPierna: true, aceptaPechuga: true },
    { clave: 'pollo-lena', nombre: 'Pollo leña', aceptaPierna: true, aceptaPechuga: true },
    { clave: 'menu', nombre: 'Menú', aceptaPierna: true, aceptaPechuga: true }
  ]
}

relaciones: [
  { platoId, nombrePlato, categoria,
    complementoGrupo: string|null,
    complementoOpcion: string|null,
    rubroClave, cantidad }
]
```

| Método | Ruta | Uso |
|---|---|---|
| GET / PUT | `/api/inventario/conversiones` | Factores del modal |
| GET / PUT | `/api/inventario/relaciones` | Recetas plato ↔ rubro |
| GET | `/api/platos` | Lista ya existente |
| POST | `/api/inventario/movimientos` | El despiece sigue grabando por aquí |

Dos personas guardando a la vez: gana el último guardado. No hace falta evento de socket en esta entrega; al abrir la pantalla se vuelve a leer.

Alias al emparejar nombres de plato con familia: `cerdo` y `chancho` → Panceta, `carnero` y `cordero` → carnero, `pollo` → pollo. Carne Bistec, Lomo Fino, Carne Pachamanca y Carne Guiso no se parten desde un entero. El alias no cambia el nombre guardado del plato.

## 11. Orden cuando se implemente

1. Nombres, blanco `#ffffff` y tamaño × 1.3. Retarget de Contar cámara.
2. Rubros nuevos (pierna, pechuga, trozo de panceta, carnero, carne guiso, pescado entero, arroz pollo, arroz blanco, arroz pato) y el grupo visual en Inventario Tabla. El rubro `arroz` se muestra como Arroz crudo.
3. API de conversiones y el modal único (factores, aderezos, relaciones, carnero 1 a 1, panceta manual, carnes y trucha y pescado entero en directo).
4. Pestaña Relación de platos leyendo esas relaciones, con la propuesta de la carta ya cargada.
5. Despiece de pollo con pierna y pechuga por separado, cada una hacia filete o hacia el aderezo que el modal tenga activo; panceta a mano, carnero 1 a 1 y arroz crudo hacia Arroz pollo, Arroz blanco y Arroz pato. Sin paso a chaufa. El destino sube en Inventario Tabla. El ingreso directo de piezas o filetes no pasa por ese despiece. Crudo y cocido usa las mismas filas.
6. Nombre Pollo pachamanca en crudo y cocido, y Carnero pachamanca distinto del Carnero entero.

## 12. Prompt para Google AI Studio

Copiar desde la línea siguiente hasta el final del bloque.

```
Piensa el flujo completo antes de dibujar. Después entrega un solo HTML (Alpine.js + Tailwind por CDN) que sea el prototipo de la pantalla de inventario de un restaurante de pollería y pachamanca en Perú. Tema oscuro: fondo #0a0a0f, tarjetas #14141f, acento oro #d4af37. Datos de mentira, sin backend. Textos en español. No inventes módulos que este encargo no pide (no descontar ventas, no login, no app de mozos, no cocina).

Razona en este orden y deja el razonamiento en un comentario HTML al inicio, corto:
1. Qué es una familia de despiece y qué es una receta de plato. No las mezcles.
2. Cómo 10 pollos frescos se vuelven 20 piernas y 20 pechugas a la vez, solo si ese día se convierten. Pierna y pechuga no se suman. Cada una puede ir a filete o a un aderezo (Pollada, Pollo pachamanca, Pollo leña, Menú). 1 pechuga = 2 filetes. La pierna solo pasa a filete si en Configuración hay un factor. No se puede repartir más piernas o más pechugas de las que salieron. La compra de piezas o de filetes no exige pollo fresco: el ingreso se escribe directo en Inventario Tabla.
3. Por qué Transformar y Crudo y cocido no guardan un saldo aparte: los dos mueven las filas de Inventario Tabla.
4. Por qué la panceta no tiene factor (los trozos se escriben a mano) y por qué carne, trucha y pescado entero no tienen cuadro de transformar.
5. Por qué el grupo de la hoja no suma pollos + piernas + pechugas + filetes.
6. Por qué el texto blanco no va encima del oro brillante.
7. Cómo el arroz crudo se reparte en Arroz pollo, Arroz blanco y Arroz pato, y por qué Arroz blanco no se convierte en Arroz chaufa.

Luego construye la pantalla con estas pestañas: Inventario Tabla, Crudo y cocido, Transformar, Stock, Relación de platos. A la derecha, botón Configuración.

Nombres de sección (pestañas, botón Configuración y títulos de bloque): color #ffffff y tamaño 30 % mayor que una UI compacta de 12 px en pestañas (15.6 px) y 14 px en títulos (18.2 px). Pestaña activa: texto blanco y borde blanco de 2 px. Encabezados de columna de la tabla conservan colores distintos por columna; no los pongas todos blancos.

Inventario Tabla
- Una tabla con columnas: Producto, Saldo anterior, Ingreso, Corrección, Ingreso total, Venta, Transformación, Saldo, Inventario, Saldo real, Diferencia.
- Agrupa como un grupo de comandas: fila padre con ▶/▼ y pastilla GRUPO. Al abrir, las filas hijas muestran sus propios números. El padre no suma unidades distintas.
- Grupo Pollo, abierto de ejemplo, con estas filas y estos números ya aplicados:
  - Pollo fresco: salieron 10 por transformación. Saldo anterior 10, saldo 0.
  - Pierna: entraron 20, salieron 10, quedan 10.
  - Pechuga: entraron 20, salieron 14, quedan 6.
  - Filete: entraron 12 (solo de pechuga: 6 × 2).
  - Filete junior: 0, solo está en el grupo, el despiece no lo llenó.
  - Pollo pachamanca: entraron 8 (4 piernas + 4 pechugas).
  - Pollo leña: entraron 3 piernas.
  - Pollada: entraron 4 (2 piernas + 2 pechugas).
  - Menú: entraron 3 (1 pierna + 2 pechugas).
- Grupo Panceta: Panceta saldo 4; Trozo de panceta ingreso 12 (anotados a mano desde 1 panceta).
- Grupo Carnes, sin transformación, cuatro filas con ingreso directo: Carne Bistec 8, Lomo Fino 5, Carne Pachamanca 6, Carne Guiso 3.
- Grupo Trucha, sin transformación: Trucha entera 7, Filete de trucha 9.
- Grupo Carnero: Carnero saldo anterior 5 y salieron 3; Carnero pachamanca ingreso 3.
- Pescado entero en una fila suelta, saldo 6. No lo metas en un despiece.
- Grupo Arroz, fuera de Pollo: Arroz crudo ingresó 20 y salieron 18, saldo 2. Arroz pollo ingresó 8. Arroz blanco ingresó 6. Arroz pato ingresó 4. No hay fila Arroz chaufa en este grupo.
- La columna Ingreso de Pierna, Pechuga y Filete se puede escribir aunque Pollo fresco esté en 0. Esas cajas no exigen conversión.
- Debajo del grupo Pollo, un recuadro «Compra directa, sin fresco»: Pierna 15, Filete 8, Pollo fresco 0. No lo sumes a los saldos del despiece de los 10 frescos; es el otro caso.
- La columna Inventario sigue siendo el conteo físico. Un botón «Contar cámara» abre un modal para anotar el conteo de un producto. No hay pestaña llamada Conteo.

Relación de platos
- Lista platos reales de la carta, con categoría y complementos: «Filete de pollo + papas fritas + arroz + ensalada» (POLLO - CARNES), «1/4 pollo + papas fritas + ensalada» (POLLO A LA LEÑA), Pachamanca 1 sabor con complemento Sabores: Pollo, Chancho, Res, «Chicharrón de pollo a la BBQ + arroz + papas fritas», «Arroz chaufa de pollo», «Lomo saltado de pollo», «Milanesa con arroz + papas fritas + ensalada», «Pan con Pollo».
- Herramienta para agregar una línea: plato, complemento opcional, rubro del inventario, cantidad con decimales. Editar abre el mismo modal de Configuración.
- Líneas ya cargadas: el filete de la carta come 1 filete; Filete junior (rubro, sin plato con ese nombre) come 0.5 filete; el 1/4 de leña come 1 pieza de Pollo leña (pierna o pechuga); la opción Pollo de la pachamanca come 1 pieza de Pollo pachamanca; el chicharrón BBQ come 1 pieza. Esas líneas de un mismo rubro van agrupadas (▶/▼, pastilla GRUPO). No sumes 1 y 0.5 en el padre del filete.
- Pollada y Menú aparecen como aderezos de inventario aunque no haya un plato con ese nombre.
- Si alguien intenta relacionar «papa frita» o «ensalada», muestra «falta en la carta» y no la agregues como producto con stock. El arroz que se puede elegir es Arroz crudo, Arroz pollo, Arroz blanco o Arroz pato. El chaufa no se elige como hijo del arroz blanco.

Configuración
- El botón abre un menú corto (vista compacta, borrar hoy). Una acción «Conversiones» abre un modal.
- Pollo, editable: 1 fresco → 2 piernas, 1 fresco → 2 pechugas, 1 pechuga → 2 filetes, 1 pierna → filetes con la casilla vacía. Un fresco produce piernas y pechugas a la vez.
- Bloque Aderezos, editable: cada fila tiene nombre y dos casillas, «acepta pierna» y «acepta pechuga». Al abrir están activos Pollada, Pollo pachamanca, Pollo leña y Menú, los cuatro con los dos cortes. Hay botón para agregar y para quitar. Si quitan Pollada, desaparece del despiece.
- Bloque Relaciones, con las líneas de platos de arriba y la cantidad editable. Cambiar un número aquí se ve en la pestaña Relación de platos.
- Carnero, editable: 1 Carnero → 1 Carnero pachamanca. Texto fijo: «La clave guardada sigue siendo cordero».
- Panceta: sin casilla de factor. Texto fijo: «Chancho y cerdo son Panceta. Los trozos se anotan en Transformar; pueden ser 10, 12 u otro número».
- Carnes, Trucha y Pescado entero: texto «Entran directo, sin transformación», sin factores.
- Arroz, editable: 1 crudo → 1 Arroz pollo, 1 crudo → 1 Arroz blanco, 1 crudo → 1 Arroz pato. Texto fijo: «Arroz blanco no se convierte en Arroz chaufa». No dibujes esa conversión.
- Guardar solo acepta factores mayores que 0. La casilla vacía de pierna → filete puede quedar vacía. Si cambian el 2 de las pechugas, el despiece vuelve a calcular piernas y pechugas de los 10 frescos.

Transformar
- Texto visible: «Convertir es opcional. Si la compra ya viene en piezas o en filetes, anótala en Inventario Tabla y deja este cuadro en cero».
- Despiece de pollo, como ejemplo de cuando sí hay fresco: frescos 10, piernas 20, pechugas 20. Cada aderezo tiene dos cajas, piernas y pechugas. Reparto ya puesto: piernas 4 a Pollo pachamanca, 3 a Pollo leña, 2 a Pollada, 1 a Menú; pechugas 6 a filete (al lado «= 12 filetes»), 4 a Pollo pachamanca, 2 a Pollada, 2 a Menú. Piernas libres 10. Pechugas libres 6. La fila «Piernas → filete» se ve y queda en 0 porque el factor está vacío.
- Pierna y pechuga no se suman en una sola bolsa. Las dos pueden ir a filete o a aderezo.
- Si un reparto dejaría piernas libres o pechugas libres bajo 0, no cambies los números y muestra un aviso ámbar.
- Panceta: 1 panceta y una caja con 12 trozos. La caja se puede cambiar a 10 o a otro entero mayor que 0. No calcules los trozos con un factor.
- Carnero: 3 pasan a Carnero pachamanca, 1 a 1.
- Arroz: crudo ingresado 20. Cajas: Arroz pollo 8, Arroz blanco 6, Arroz pato 4. Libre 2. Si la suma pasa de 20, no cambies los números y muestra el aviso ámbar. No hay caja hacia Arroz chaufa.
- No dibujes despiece de Carne Bistec, Lomo Fino, Carne Pachamanca, Carne Guiso, Trucha entera, Filete de trucha ni Pescado entero.
- Un botón «Pasar a la hoja» escribe esos ingresos en Inventario Tabla (el destino sube, el origen baja). Crudo y cocido lee esas mismas filas.

Crudo y cocido
- Los nombres de fila son los de Inventario Tabla. Cambiar un crudo o un cocido cambia el saldo de esa fila en la Tabla. No es un stock distinto.
- Cuadro Pachamanca con una fila «Pollo pachamanca» (no «Pollo»), cocido 8. Pollada, Pollo leña y Menú no se meten en esa fila.
- Fila «Carnero pachamanca», cocido 3, distinta de un Carnero entero.
- Carne Pachamanca no sale de este despiece: es ingreso directo de la familia Carnes.
- El pollo fresco que todavía no se partió no aparece en la fila Pollo pachamanca.
- Cuadro Arroz: Arroz crudo en crudo 2. Arroz pollo cocido 8, Arroz blanco cocido 6, Arroz pato cocido 4. Esas filas son las de Inventario Tabla.

Stock
- Lista corta de saldos del ejemplo. No sumes un total único de productos distintos.

No uses librerías aparte de Alpine y Tailwind CDN. Números con fuente monoespaciada. Botones grandes, pensados para tocarse en una tablet de mostrador.
```
