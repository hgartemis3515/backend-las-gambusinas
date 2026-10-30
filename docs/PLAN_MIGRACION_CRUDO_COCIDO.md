# Plan: configuración crudo y cocido para otra PC

**Fuente:** `Backend-LasGambusinas/public/inventario.html` (`inventarioApp`).  
**Platos y vínculos de la carta:** `docs/PLAN_RELACION_PLATOS_INVENTARIO.md`.  
**Fecha de lectura:** 2026-10-30.  
**Mongo de esta PC:** `inventario_rubros` y `inventario_mapas` están vacías. La otra PC, con el mismo código y sin documentos guardados, arranca con la semilla de abajo.

Lo que no viaja con el repo es el navegador de esta máquina. Si en Configuración se cambiaron factores o colores, hay que copiar a mano estas claves de `localStorage`:

| Clave | Qué guarda |
|---|---|
| `inventario-conversiones` | Factores, aderezos y relación de platos |
| `inventario-row-colors` | Color de filas y grupos |

En la consola del navegador, en esta PC: `copy(localStorage.getItem('inventario-conversiones'))`. En la otra: `localStorage.setItem('inventario-conversiones', '…')` y recargar. Igual con `inventario-row-colors`.

Los saldos del día no forman parte de esta configuración. Viven en movimientos (`POST /api/inventario/movimientos`).

## Dónde está cada cosa

| Pieza | Archivo |
|---|---|
| Filas de la hoja, claves, factores, aderezos, relación, cuadros Crudo y cocido, pase a la hoja | `public/inventario.html` |
| Semilla `tieneCocido` + `reservaClave` y cadena de venta | `src/utils/inventarioCascadaVenta.js` |
| Árbol de despiece y de qué corte cuelga cada plato | `src/utils/inventarioMapas.js` |
| Nombre de carta → rubro de inventario | `src/utils/inventarioSalidaVentas.js` |
| Lista de rubros guardables | `src/utils/inventarioRubros.js` |
| Persistencia al pulsar Guardar en Configuración | `PUT /api/inventario/rubros/:clave` → colección `inventario_rubros`. `PUT /api/inventario/mapas` → `inventario_mapas` |

Si en la otra PC ya hay documentos en `inventario_rubros` con `tieneCocido` booleano, esos ganan a la semilla. Materia nunca puede quedar con cocido.

## Regla

Materia (sin cuadro cocido, Configuración no puede encenderlo). Una venta que cae ahí solo mueve `crudo`:

- `pollo-origen` — Pollo fresco
- `pechuga-pollo` — Pechuga de Pollo
- `pierna-pollo` — Pierna de Pollo
- `filete` — Filete Pollo Crudo

El resto, si `tieneCocido` está apagado, muestra un solo ingreso y ese ingreso es crudo.

Cadena de una venta, de arriba abajo:

1. Cocido del mismo rubro, solo si `tieneCocido`.
2. Crudo del mismo rubro.
3. Crudo de `reservaClave`, solo si es una de las cuatro materias.

El último eslabón puede quedar negativo. Los anteriores solo se usan si su disponible es mayor que 0. `atribuirVentas` además mete el cocido del propio rubro al frente aunque el checkbox esté apagado, para gastar cocido viejo (Transformar o ventas anteriores) antes del crudo.

Ingreso de la tabla: cuadro de arriba = crudo (`Ingreso crudo`), cuadro de abajo = cocido (`Ingreso cocido`) solo si `tieneCocido`. Corrección, transformación y conteo existen por tipo cuando hay cuadro cocido.

## Semilla de cuadro cocido

Todo lo que no está en esta tabla queda `tieneCocido: false` y `reservaClave: ''`.

| Clave | Nombre en la hoja | Cuadro cocido | Si no hay saldo, restar de |
|---|---|---|---|
| `pollada` | Pollada | sí | ninguno |
| `menu` | Menú | sí | ninguno |
| `pollo-lena` | Pecho a la leña | sí | ninguno |
| `pierna-lena` | Pierna a la leña | sí | ninguno |
| `pachamanca-pollo` | Pollo pachamanca | sí | ninguno |
| `pachamanca-chancho` | Cerdo pachamanca | sí | ninguno |
| `pachamanca-res` | Carne Pachamanca | sí | ninguno |
| `pachamanca-cordero` | Carnero pachamanca | sí | ninguno |
| `salt-pollo` | Salt de pollo | sí | `filete` |
| `chaufa-pollo` | Chaufa de pollo | sí | `filete` |
| `milanesa` | Milanesa de pollo | sí | `filete` |
| `filete-junior` | Filete junior | sí | `filete` |
| `chicharron-pollo` | Chicharrón de pollo | sí | `filete` |
| `milanesa-junior` | Milanesa junior (rubro de carta, sin fila propia en la hoja) | no | `filete` |
| `chi-pollo-bbq` | Chi. pollo a la BBQ | no | `filete` |
| `chi-pollo-acevichada` | Chi. pollo acevichada | no | `filete` |

Reservas válidas en el select de Configuración: vacío, `pollo-origen`, `pechuga-pollo`, `pierna-pollo`, `filete`. Otra clave responde 400.

## Hoja: id de fila → clave

`claveDeFila` en `inventario.html`. La fila es lo que se ve. La clave es lo que se guarda.

### Pollo

| Id fila | Clave | Notas |
|---|---|---|
| `pollo_fresco` | `pollo-origen` | Materia. Siempre crudo |
| `pechuga` | `pechuga-pollo` | Materia. Siempre crudo |
| `pierna` | `pierna-pollo` | Materia. Siempre crudo |
| `filete` | `filete` | Materia. Siempre crudo. Último recurso de los platos que cuelgan de filete |
| `filete_junior` | `filete-junior` | Cocido + reserva filete. La venta come 0.5 filete |
| `milanesa` | `milanesa` | Cocido + reserva filete. 1 filete |
| `chi_pollo_bbq` | `chi-pollo-bbq` | Sin cuadro. Reserva filete |
| `chi_pollo_acevichada` | `chi-pollo-acevichada` | Sin cuadro. Reserva filete |
| `chicharron_pollo` | `chicharron-pollo` | Cocido + reserva filete |
| `salt_pollo` | `salt-pollo` | Cocido + reserva filete. 1 saltado = 1 |
| `chaufa_pollo` | `chaufa-pollo` | Cocido + reserva filete. No sale del arroz blanco |
| `pollada` | `pollada` | Cocido, sin reserva. Nace de pechuga y pierna en Transformar |
| `pollo_pachamanca` | `pachamanca-pollo` | Cocido, sin reserva |
| `pollo_lena` | `pollo-lena` | Cocido, sin reserva. En el árbol se llama Pecho a la leña |
| `pierna_lena` | `pierna-lena` | Cocido, sin reserva |
| `menu` | `menu` | Cocido, sin reserva. Pan con pollo cae aquí |

### Pato, panceta, carnes, trucha, carnero, arroz, sueltos

| Id fila | Clave | Grupo | Crudo / cocido de semilla |
|---|---|---|---|
| `pato_fresco` | `pato` | pato | solo crudo |
| `pechuga_pato` | `pechuga-pato` | pato | solo crudo |
| `pierna_pato` | `pierna-pato` | pato | solo crudo |
| `panceta` | `panceta` | panceta | solo crudo |
| `trozo_panceta` | `trozo-panceta` | panceta | solo crudo |
| `cerdo_pachamanca` | `pachamanca-chancho` | panceta | cocido, sin reserva |
| `carne_bistec` | `bisteck` | carnes | solo crudo. Entra directo |
| `lomo_fino` | `lomo-fino` | carnes | solo crudo. Entra directo |
| `carne_pachamanca` | `pachamanca-res` | carnes | cocido, sin reserva |
| `carne_guiso` | `carne-guiso` | carnes | solo crudo. Entra directo |
| `trucha_entera` | `trucha` | trucha | solo crudo. Entra directo |
| `filete_trucha` | `filete-trucha` | trucha | solo crudo. Entra directo |
| `carnero` | `carnero` | carnero | solo crudo. La clave vieja «cordero» no se usa |
| `carnero_pachamanca` | `pachamanca-cordero` | carnero | cocido, sin reserva |
| `arroz` | `arroz` | arroz | solo crudo |
| `arroz_blanco` | `arroz-blanco` | arroz | solo crudo en semilla. Transformar lo ingresa como cocido |
| `arroz_verde` | `arroz-verde` | arroz | igual |
| `arroz_pato` | `arroz-pato` | arroz | igual |
| `arroz_chaufa` | `arroz-chaufa` | arroz | igual |
| `arroz_mariscos` | `arroz-mariscos` | arroz | igual |
| `arroz_pollo` | `arroz-tipo-pollo` | arroz | igual. Guarnición, no es el plato arroz con pollo (`arroz-pollo`) |
| `pescado_entero` | `pescado-entero` | suelto | solo crudo |
| `pota` | `pota` | suelto | solo crudo |
| `papas` | `papas` | suelto | solo crudo |
| `tamal` | `tamal` | suelto | solo crudo |

Gaseosas y licores no están en la semilla de filas. Salen de la carta activa: clave `gaseosa-{slug}` o `licor-{slug}`, grupo `gaseosas` o `licores`, sin cuadro cocido.

## Factores (valores de fábrica)

Si `inventario-conversiones` no existe, estos son los números. `factorFiletesPorPierna` vacío = la pierna no hace filete.

| Factor | Valor | Pase |
|---|---|---|
| `factorPechugasPorFresco` | 2 | 1 pollo fresco → pechugas, en crudo |
| `factorPiernasPorFresco` | 2 | 1 pollo fresco → piernas, en crudo |
| `factorFiletesPorPechuga` | 1 | 1 pechuga → 1 filete, en crudo |
| `factorFiletesPorPierna` | vacío | no convierte |
| `factorCarneroPachamanca` | 1 | 1 carnero crudo → 1 carnero pachamanca cocido |
| `factorArrozBlanco` | 8 | 1 crudo → 8 blanco cocido |
| `factorArrozVerde` | 6 | 1 crudo → 6 verde cocido |
| `factorArrozPato` | 4 | 1 crudo → 4 pato cocido |
| `factorArrozChaufa` | 4 | 1 crudo → 4 chaufa cocido |
| `factorArrozMariscos` | 4 | 1 crudo → 4 con mariscos cocido |
| `factorArrozPollo` | 1 | 1 crudo → 1 arroz pollo cocido |
| Pato | 2 y 2 | 1 fresco → 2 pechugas y 2 piernas (nota del grupo, mapa `pato-fresco`) |
| Panceta | a mano | los trozos no tienen factor fijo |

## Qué entra crudo y qué entra cocido al pasar a la hoja

`guardarDespieceEnServidor`. El origen siempre sale en crudo. El destino depende del producto.

| Movimiento | Tipo | Motivo |
|---|---|---|
| Pollo fresco que sale | crudo − | `Pasa a piezas` |
| Pierna y pechuga que nacen | crudo + | `Sale de Pollo fresco` |
| Pierna y pechuga que se usan | crudo − | `Pasa a destinos` |
| Filete que nace | crudo + | `Sale de Pechuga` |
| Pollada, Pollo pachamanca, Pecho a la leña, Menú (aderezos) | cocido + | `Sale de piezas` |
| Panceta que sale | crudo − | `Pasa a trozos` |
| Trozos de panceta | crudo + | `Sale de Panceta` |
| Carnero que sale | crudo − | `Pasa a Carnero pachamanca` |
| Carnero pachamanca | cocido + | `Sale de Carnero` |
| Arroz crudo que sale | crudo − | `Pasa a tipos de arroz` |
| Arroz blanco, verde, pato, chaufa, mariscos, arroz pollo | cocido + | `Sale de Arroz crudo` |

Aderezos de fábrica (aceptan pierna y pechuga, cantidad 1, `venta: false` en el mapa porque el pase es Transformar, no la comanda):

- `pollada` — Pollada
- `pollo_pachamanca` — Pollo pachamanca
- `pollo_lena` — Pollo leña
- `menu` — Menú

Platos que cuelgan de `filete` (el mapa los marca `venta: true`). Cantidad = filetes que come una porción:

| Id | Plato | Come |
|---|---|---|
| `filete_pollo` | Filete de Pollo | 1. La venta se queda en `filete` crudo. No tiene fila de plato |
| `milanesa` | Milanesa de pollo | 1. La venta pasa a `milanesa` |
| `filete_junior` | Filete junior | 0.5. La venta pasa a `filete-junior` |
| `fuente_chi` | Fuente de Chicharrón de pollo | 2. Se queda en `filete` |
| `chaufa_pollo` | Arroz chaufa de pollo | 1. Pasa a `chaufa-pollo` |
| `chi_pollo_acevichada` | Chicharrón de pollo acevichada | 1. Pasa a `chi-pollo-acevichada` |
| `chi_pollo_bbq` | Chicharrón de pollo a la BBQ | 1. Pasa a `chi-pollo-bbq` |
| `chi_chico` | Chicharrón de pollo chico | 1. Se queda en `filete` si el nombre no cae en otro chicharrón |
| `salt_pollo` | Lomo saltado de pollo | 1. Pasa a `salt-pollo` |

Pollada y pachamanca de pollo no vuelven a restar pechuga ni pierna al vender. Esas piezas ya salieron en Transformar.

## Venta: nombre de carta → rubro

Primero el mapa exacto. Si no hay, el mapa de despiece (`cuelgaDe`). Si tampoco, estas reglas de `rubrosDeFila`.

| Nombre normalizado | Rubro | Factor |
|---|---|---|
| `1/4 pollo a la lena` | `pollo-lena` | 1 |
| `1/2 pollo a la lena baby` | `pollo-lena` | 1 (cuenta 1 hasta que el negocio diga si son 2 cuartos) |
| `panceta de chancho lena` | `panceta` | 1 |
| `chancho a la lena` | `chancho-lena` | 1 |
| `chancho a la lena bbq` | `chancho-lena-bbq` | 1 |
| `pollo de pachamanca` | `pachamanca-pollo` | 1 |
| `cerdo de pachamanca` / `cerdo pachamanca` | `pachamanca-chancho` | 1 |
| `res de pachamanca` | `pachamanca-res` | 1 |
| `carnero de pachamanca` | `pachamanca-cordero` | 1 |

Contiene, si no entró por el mapa:

| Texto | Rubro |
|---|---|
| filete de pollo | `filete` |
| 1/4 pollo, cuarto de pollo, pollo a la leña | `pollo-lena` |
| chicharrón de pollo + bbq | `chi-pollo-bbq` |
| acevichada + pollo | `chi-pollo-acevichada` |
| chicharrón + pollo | `chicharron-pollo` |
| pachamanca + pollo | `pachamanca-pollo` |
| milanesa junior | `milanesa-junior` |
| milanesa | `milanesa` |
| chaufa + pollo | `chaufa-pollo` |
| saltado + pollo | `salt-pollo` |
| pan con pollo | `menu` |
| tamal | `tamal` |
| papa frita / papas fritas | suma `papas` |
| arroz verde | `arroz-verde` |
| arroz con mariscos | `arroz-mariscos` |
| arroz chaufa (sin pollo) | `arroz-chaufa` |
| arroz blanco | `arroz-blanco` |
| arroz con pato / arroz de pato | `arroz-pato` y, si el corte viene en la fila, pechuga o pierna de pato |
| arroz (sin chaufa y sin arroz con pollo) | `arroz-tipo-pollo` |
| gaseosa, inca kola, coca-cola, sprite, fanta, guaraná | `gaseosa-{slug}` |
| vino, cerveza, pisco, ron, whisky, vodka, chilcano, tequila, sangría, licor, gin | `licor-{slug}` |

Si el mapa colgó el plato de `filete` y el nombre tiene rubro propio (saltado, chaufa de pollo, milanesa, filete junior, chicharrón bbq / acevichada / de pollo), la venta cambia a ese rubro. Filete de pollo y la fuente se quedan en `filete`.

Pato (`venta: true`): Arroz con pato, complemento `pecho` → `pechuga-pato` cantidad 1. Complemento `pierna` → `pierna-pato` cantidad 1. Alias: `arroz con pato`, `arroz de pato`.

Pota (`venta: true`, cuelga de `pota`, cantidad 1): Ceviche de chicharrón de pota. Chicharrón de pota.

## Pestaña Crudo y cocido

Cuadros y filas, en este orden. Es la misma fila de Inventario Tabla. No es un segundo stock.

| Cuadro | Filas |
|---|---|
| Pachamanca | Pollo pachamanca, Cerdo pachamanca, Carnero pachamanca, Carne Pachamanca |
| Pollo | Pollo fresco, Pechuga, Pierna, Filete Pollo Crudo, Milanesa, Filete junior, Pollada, Pollo pachamanca, Pecho a la leña, Pierna a la leña, Menú |
| Pescado | Pescado entero |
| Panceta | Panceta, Trozo de panceta |
| Arroz | Arroz crudo, blanco, verde, pato, chaufa, con mariscos, arroz pollo |
| Pato | Pato fresco, Pechuga de pato, Pierna de pato |
| Pota | Pota |

Los ± de esa pestaña (`ajustarCrudoCampo`) solo cambian el estado local y empujan `ingreso = crudo + cocido`. No hacen `POST`. Lo que sí se guarda es el stepper de Ingreso de la tabla y «Pasar a la hoja».

Pescado en Transformar (local, no está en el pase al servidor de arriba): Tollo → Chicharrón de pescado. Perico u ojo de uva → Ceviche.

## Evento

Apartar resta crudo del origen. El producto de evento entra cocido. La venta especial resta cocido del producto de evento.

| Producto | Clave | Sale de |
|---|---|---|
| Pollo Evento | `evento-pollo` | `pollo-origen` |
| Carne Evento | `evento-carne` | `bisteck` |
| Arroz Evento | `evento-arroz` | `arroz` |
| Papa Evento | `evento-papa` | `papas` |

## Relación de platos de fábrica

Está en `config.relaciones`. Es la pestaña Relación, no la cascada de venta. Si el navegador tiene `inventario-conversiones`, esa copia pisa esta lista.

| Rubro | Plato | Cantidad | Nota |
|---|---|---|---|
| Filete | Filete de pollo + papas fritas + arroz + ensalada | 1 | filete. Complemento POLLO - CARNES |
| Filete | Filete junior | 0.5 | filete |
| Filete | Chicharrón de pollo a la BBQ + arroz + papas fritas | 1 | pieza. POLLO - CARNES |
| Pollo leña | 1/4 pollo + papas fritas + ensalada | 1 | pieza de Pollo leña. POLLO A LA LEÑA |
| Pollo pachamanca | Pachamanca 1 sabor | 1 | pieza. Opción Pollo |
| Papas | Filete de pollo + papas fritas + arroz + ensalada | 1 | papa fritas |
| Arroz pollo | Filete de pollo + papas fritas + arroz + ensalada | — | por completar |
| Papas | 1/4 pollo + papas fritas + ensalada | 1 | papa fritas |
| Tamal | Tamal | 1 | tamal |
| Gaseosas | Gaseosa | 1 | gaseosa |

## Cómo dejar la otra PC igual

1. Copiar el repo, o al menos `public/inventario.html`, `src/utils/inventarioCascadaVenta.js`, `src/utils/inventarioMapas.js`, `src/utils/inventarioSalidaVentas.js`, `src/utils/inventarioRubros.js`, `src/repository/inventario.repository.js` y el modelo `inventarioRubro.model.js`.
2. No hace falta volcar `inventario_rubros` ni `inventario_mapas`: aquí están vacías. La semilla de este documento es la configuración activa.
3. Si en esta PC se guardó Configuración, exportar `inventario-conversiones` (y colores) e importarlos en el navegador de la otra PC antes de abrir Inventario.
4. Abrir Inventario, Configuración, y comprobar que Pollada, Menú, leña, las cuatro pachamancas, saltado, chaufa de pollo, milanesa, filete junior y chicharrón de pollo tienen el checkbox de cocido, y que los cinco de filete más BBQ y acevichada reservan Filete pollo crudo. Pollo fresco, pechuga, pierna y filete deben decir solo se transforma.
5. Los saldos no se copian con este plan. Si también hay que llevar el kardex, exportar la colección de movimientos aparte.
