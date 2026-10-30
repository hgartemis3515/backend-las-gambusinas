# Relación completa de platos de inventario

**Pantalla:** `public/inventario.html`, pestaña Relación. Al abrir, `cargarPlatos()` pide `GET /api/platos` y rearma los vínculos. La lista de 8 platos escrita en el HTML solo aparece si ese pedido falla.
**Carta leída:** Mongo `platos`, activos, 2026-10-30. **138 platos.** 63 tienen vínculo en la pestaña. 82 no descuentan inventario al venderse.
**Crudo, cocido, factores y despiece:** `docs/PLAN_MIGRACION_CRUDO_COCIDO.md`.

Hay dos relaciones distintas. No son la misma lista.

1. **Pestaña Relación.** Mira el nombre del plato y el texto de sus complementos. Sirve para mostrar el grupo en pantalla. Se guarda en `config.relaciones` y, si se pulsa Guardar en Configuración, también en `localStorage` clave `inventario-conversiones`.
2. **Venta.** La comanda pasa primero por el contador de reportes (`src/utils/contadorPlatosReporte.js`). Pachamanca, leña y bebidas MIX cambian de nombre antes de llegar a inventario. Después `rubrosDeFila` en `src/utils/inventarioSalidaVentas.js` elige la clave. Esa clave baja por la cascada crudo → cocido → reserva del otro plan.

Siempre se agrega, aunque no esté en la carta: **Filete junior** → rubro de pantalla Filete, cantidad 0.5. Pollada (2 piernas + 2 pechugas) y Menú (1 pierna + 2 pechugas) son aderezos de producción. No tienen plato comercial con ese nombre. Pan con pollo es el que apunta a Menú.

## Regla de la pestaña

Se prueba el nombre, en este orden. La primera que coincide es el rubro principal. Después se suman guarniciones si el nombre o los complementos las mencionan.

| Si el nombre contiene | Rubro en pantalla | Cantidad |
|---|---|---|
| filete de pollo | Filete | 1 |
| 1/4 pollo, cuarto de pollo | Pollo leña | 1 |
| pachamanca y (pollo en el nombre o en complementos) | Pollo pachamanca | 1 |
| chicharrón de pollo a la bbq | Chi. pollo a la BBQ | 1 |
| acevichada y pollo | Chi. pollo acevichada | 1 |
| chicharrón de pollo chico | Chicharrón de pollo | 0.5 |
| fuente, chicharrón y pollo | Chicharrón de pollo | por completar |
| chaufa y pollo | Chaufa de pollo | por completar |
| saltado y pollo | Salt de pollo | por completar |
| milanesa | Milanesa | 1 |
| pan con pollo | Menú | por completar |
| arroz con pato, arroz de pato | Arroz pato | 1 |
| arroz con pollo | Arroz con pollo | 1 |
| tamal | Tamal | 1 |
| gaseosa, inca kola, coca-cola, sprite, fanta | Gaseosas | 1 |
| papa frita, papas fritas | Papas | 1 |

Guarnición extra, si aún no está el rubro: papa frita → Papas × 1. La palabra arroz, salvo chaufa, arroz con pollo y arroz con pato → Arroz pollo, cantidad por completar. Tamal → Tamal × 1. Gaseosa → Gaseosas × 1.

Ensalada está en la lista de rubros del formulario y queda bloqueada: no es stock.

## Regla de la venta

| Ficha del contador | Qué nombre llega a inventario |
|---|---|
| pachamanca | Pollo de pachamanca, Cerdo de pachamanca, Res de pachamanca o Carnero de pachamanca, según el sabor marcado |
| mixto-lena | 1/4 pollo a la leña, y aparte Panceta de chancho leña |
| cuarto-lena | 1/4 pollo a la leña |
| medio-lena | 1/2 pollo a la leña baby |
| chancho-lena | Chancho a la leña, o Chancho a la leña BBQ si el nombre dice bbq |
| mix | el nombre de cada opción del grupo variante, no el nombre del plato padre |
| pliegue o suelto | el nombre del plato |

Nombre ya partido, clave de inventario:

| Nombre que llega | Clave |
|---|---|
| 1/4 pollo a la leña | pollo-lena × 1 |
| 1/2 pollo a la leña baby | pollo-lena × 1 |
| Panceta de chancho leña | panceta × 1 |
| Chancho a la leña | chancho-lena × 1 |
| Chancho a la leña BBQ | chancho-lena-bbq × 1 |
| Pollo de pachamanca | pachamanca-pollo × 1 |
| Cerdo de pachamanca | pachamanca-chancho × 1 |
| Res de pachamanca | pachamanca-res × 1 |
| Carnero de pachamanca | pachamanca-cordero × 1 |

Si no entra en esa tabla, el nombre se prueba contra el mapa de despiece y, si tampoco, contra el texto: filete de pollo → `filete`; chicharrón bbq → `chi-pollo-bbq`; acevichada → `chi-pollo-acevichada`; otro chicharrón de pollo → `chicharron-pollo`; milanesa junior → `milanesa-junior`; milanesa → `milanesa`; chaufa de pollo → `chaufa-pollo`; saltado de pollo → `salt-pollo`; pan con pollo → `menu`; tamal → `tamal`; arroz verde → `arroz-verde`; arroz con mariscos → `arroz-mariscos`; arroz chaufa sin pollo → `arroz-chaufa`; arroz blanco → `arroz-blanco`; arroz con pato → `arroz-pato`; otro arroz que no sea chaufa ni arroz con pollo → `arroz-tipo-pollo`. Papa frita suma `papas`. Gaseosa y licor arman `gaseosa-{slug}` o `licor-{slug}`.

El mapa de pollo cuelga estos platos de `filete` y, si el nombre tiene rubro propio, la venta se muda a ese rubro. Filete de pollo y la fuente se quedan en `filete`.

| Plato del mapa | Come | Venta |
|---|---|---|
| Filete de Pollo | 1 filete | filete |
| Milanesa de pollo | 1 | milanesa |
| Filete junior | 0.5 | filete-junior |
| Fuente de Chicharrón de pollo | 2 | filete |
| Arroz chaufa de pollo | 1 | chaufa-pollo |
| Chicharrón de pollo acevichada | 1 | chi-pollo-acevichada |
| Chicharrón de pollo a la BBQ | 1 | chi-pollo-bbq |
| Chicharrón de pollo chico | 1 | filete, salvo que el nombre ya haya caído en chicharrón |
| Lomo saltado de pollo | 1 | salt-pollo |
| Arroz con pato, complemento pecho | 1 | pechuga-pato |
| Arroz con pato, complemento pierna | 1 | pierna-pato |
| Ceviche de chicharrón de pota | 1 | pota |
| Chicharrón de pota | 1 | pota |

Lomo saltado de bistec, lomo saltado de lomo fino, chaufa de bistec y chaufa de chancho no tienen clave de carne. El chaufa que no dice pollo descuenta `arroz-chaufa`. `lomo-fino`, `bisteck`, `salt-bistec`, `chaufa-bistec` y `chaufa-chancho` existen en la hoja y no reciben esta venta.

## Catálogo

Cantidad `—` es «por completar»: el vínculo se muestra y no tiene número cerrado.

### Alita Broaster Y BBQ (3)

**C12 · Alita acevichadas (6 piezas ) papas fritas + ensalada**

- Cocina: Alitas acevichadas
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Papa Frita, Ensalada
- Pestaña: Papas × 1
- Venta: papas × 1

**C10 · Alita broaster( 6 piezas) papa fritas + ensalada**

- Cocina: Alita broaster 6
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Papa Frita, Ensalada
- Pestaña: Papas × 1
- Venta: papas × 1

**C11 · Alitas  a la BBQ (6 piezas ) papa fritas + ensalada**

- Cocina: Alitas BBQ 6
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Papa Frita, Ensalada
- Pestaña: Papas × 1
- Venta: papas × 1

### Antojitos (2)

**C8 · Arroz a la cubana**

- Cocina: Arroz cubana
- Tipos: platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

**C7 · Tequeño con queso 8 unidades**

- Cocina: Tequeño queso 8
- Tipos: platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### BEBIDAS CALIENTES (Desayuno) (8)

**D12 · Anis**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D10 · Cafe**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D32 · Infusion**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D9 · Leche con Cafe**

- Cocina: Leche Cafe
- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D8 · Leche con Milo**

- Cocina: Leche Milo
- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D13 · Manzanilla**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D7 · Taza de leche**

- Cocina: Taza Leche
- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D11 · Te**

- Cocina: Té
- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### BEBIDAS FRÍAS (Carta normal) (15)

**H1 · 1/2 Jarra Chicha Morada**

- Cocina: 1/2 Jarra Morada
- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**H2 · 1/2 Jarra Jora**

- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**J111 · 1/2 Jarra Limonada**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**T521 · Agua San Mateo 1⁄2 Ltr.**

- Tipos: plato-carta normal, platos-desayuno, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**F412 · Agua San Mateo 2 1⁄2 Ltrs.**

- Tipos: plato-carta normal, platos-desayuno, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B90 · Cerveza Cuzqueña Trigo**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-cerveza-cuzquena-trigo × 1

**F704 · Cerveza Cuzqueña negra**

- Tipos: plato-carta normal, platos-desayuno, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-cerveza-cuzquena-negra × 1

**O793 · Cerveza Pilsen**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-cerveza-pilsen × 1

**G9 · Cerveza blanca Pilsen de 620ml**

- Cocina: Cerveza Blanca Pilsen
- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-cerveza-blanca-pilsen-de-620ml × 1

**G1 · Cerveza en lata de 355ml**

- Cocina: Cerveza lata
- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-cerveza-en-lata-de-355ml × 1

**P135 · Chicha Jora Jarra**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**Z436 · Chicha Morada Jarra**

- Tipos: plato-carta normal, platos-desayuno, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**A720 · Limonada Jarra**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**L930 · Vaso de Chicha**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**G00 · Vaso de Jora**

- Cocina: Vaso Jora
- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### BEBIDAS, REFRESCOS Y JUGOS (5)

**B2 · Agua mineral 1/2**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B1 · Frugos 1.5Lt**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B5 · Gaseosa 1 1⁄2L Inca o Coca**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: Tipo (obligatorio): Inca Kola, Coca Cola
- Pestaña: Gaseosas × 1
- Venta: gaseosa-gaseosa-1-1-2l-inca-o-coca × 1

**B4 · Gaseosa 1⁄2 litro (Cola o Inca)**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: Tipo (obligatorio): Coca Cola, Inca Kola
- Pestaña: Gaseosas × 1
- Venta: gaseosa-gaseosa-1-2-litro-cola-o-inca × 1

**B6 · Gaseosa 3L Inca o Coca**

- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: Tipo (obligatorio): Coca Cola, Inca Kola
- Pestaña: Gaseosas × 1
- Venta: gaseosa-gaseosa-3l-inca-o-coca × 1

### CARNE + LOMO SALTADO + CHAUFA (8)

**A19 · Arroz Chaufa Bistec**

- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: arroz-chaufa × 1

**A21 · Arroz Chaufa Chancho**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: arroz-chaufa × 1

**A20 · Arroz Chaufa Pollo**

- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Chaufa de pollo × — (por completar)
- Venta: chaufa-pollo × 1

**A36 · Bisteck a lo Pobre**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A33 · Bisteck+ Papas Fritas + Arroz + Ensalada**

- Cocina: Bisteck
- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Arroz, Papa Frita, Ensalada
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: papas × 1, arroz-tipo-pollo × 1

**A16 · Lomo Saltado Bistec**

- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A17 · Lomo Saltado Pollo**

- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Salt de pollo × — (por completar); Papas × 1; Arroz pollo × — (por completar)
- Venta: salt-pollo × 1

**A18 · Lomo saltado de Lomo Fino**

- Cocina: Lomo Saltado Lomo Fino
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

### CARNES (Desayuno) (3)

**2 · 1/2 Chicharrón de chancho + 4 panes**

- Cocina: 1/2 Chicharrón chancho
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Pan, Bebidas calientes
- Pestaña: sin vínculo
- Venta: no descuenta

**D27 · Bisteck al jugo + 4 panes**

- Cocina: Bisteck jugo
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Pan
- Pestaña: sin vínculo
- Venta: no descuenta

**D28 · Pollo al jugo + 4 panes**

- Cocina: Pollo Jugo
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Pan
- Pestaña: sin vínculo
- Venta: no descuenta

### CHICHARRONES (Carta normal) (7)

**A5 · 1/2 Chicharrón de chancho + camote frito + zarza criolla**

- Cocina: 1/2 Chicharrón chancho
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A8 · Chicharron de pollo + arroz + papas fritas**

- Cocina: Chicharron Pollo
- Tipos: plato-carta normal, platos-desayuno, platos-cena
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: chicharron-pollo × 1, papas × 1, arroz-tipo-pollo × 1

**A7 · Chicharron de pollo a la BBQ + arroz + papas fritas**

- Cocina: Chicharron Pollo BBQ
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Chi. pollo a la BBQ × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: chi-pollo-bbq × 1, papas × 1, arroz-tipo-pollo × 1

**A9 · Chicharrón de pollo acevichada + arroz y yuca frita**

- Cocina: Chicharron Pollo Acevichada
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Chi. pollo acevichada × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: chi-pollo-acevichada × 1, arroz-tipo-pollo × 1

**A10 · Chicharrón de pollo chico + yuca frita + zarza criolla**

- Cocina: Chicharron Pollo Chico
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Chicharrón de pollo × 0.5; Papas × 1; Arroz pollo × — (por completar)
- Venta: chicharron-pollo × 1

**A6 · Fuente de Chicharrón de chancho**

- Cocina: Fuente Chicharron Chancho
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A11 · Fuente de Chicharrón pollo**

- Cocina: Fuente Chicharron Pollo
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Chicharrón de pollo × — (por completar); Papas × 1; Arroz pollo × — (por completar)
- Venta: filete × 2

### Caldo (1)

**C6 · Caldo de pollo (1/8 pierna + huevo**

- Cocina: Caldo Pollo
- Tipos: platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### Desayuno (2)

**D26 · Desayuno Criollo Gambusinas**

- Cocina: Desayuno criollo ch-cerdo
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Pan, Tamal, Butifarra, Salsa, Bebida caliente
- Pestaña: Tamal × 1
- Venta: no descuenta

**D25 · Promo Butifarra**

- Cocina: Promo butifarra
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Zarza Criolla, Bebida caliente
- Pestaña: sin vínculo
- Venta: no descuenta

### Desayuno Continental (1)

**D90 · DCH**

- Tipos: platos-desayuno
- Ficha: mix
- Complementos: Guarniciones (obligatorio, variante de plato): Te, Cafe, Anis, Infusion, Taza de leche, Manzanilla, Leche cafe, Leche Milo · Guarniciones de pan (fijo): Panes, Mantequilla, Mermelada, Jugo de papaya
- Pestaña: sin vínculo
- Venta: cada opción se vende aparte: Te → no descuenta; Cafe → no descuenta; Anis → no descuenta; Infusion → no descuenta; Taza de leche → no descuenta; Manzanilla → no descuenta; Leche cafe → no descuenta; Leche Milo → no descuenta.

### ENTRADAS Y CALDOS (9)

**C35 · Caldo Solo con huevo**

- Tipos: platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**A3 · Ensalada Especial**

- Tipos: plato-carta normal
- Ficha: pliegue
- Complementos: Tipo (obligatorio, anexa al nombre): Limon, Vinagreta
- Pestaña: sin vínculo
- Venta: no descuenta

**M594 · Humita**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**A2 · Papa a la huancaína**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**A4 · Patasca**

- Tipos: plato-carta normal, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**T599 · Salchipapa**

- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A1 · Tamal Chancho + zarza criolla**

- Cocina: Tamal-Chancho
- Tipos: plato-carta normal, platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Zarza Criolla
- Pestaña: Tamal × 1
- Venta: tamal × 1

**A50 · Tamal Pollo + Zarza criolla**

- Cocina: Tamal Pollo
- Tipos: plato-carta normal, platos-desayuno
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Tamal × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: tamal × 1

**L596 · Yuca Frita + Huancaína**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### JUGOS (Desayuno) (6)

**D4 · Jarra de jugo de Naranja**

- Cocina: Jarra Naranja
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D3 · Jarra de jugo de Papaya**

- Cocina: Jarra Papaya
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D5 · Jarra de jugo de Papaya c/leche**

- Cocina: Jarra Papaya c/leche
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D6 · Jarra de jugo de Platano c/leche**

- Cocina: Jarra Platano c/leche
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D2 · Vaso de jugo de Naranja**

- Cocina: Vaso Naranja
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D1 · Vaso de jugo de Papaya**

- Cocina: Vaso papaya
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### LEÑA CON POLLO Y CHANCHO (6)

**A13 · 1/2 Pollo a la leña BABY PF + Ensalada**

- Cocina: 1/2 Pollo Leña BABY
- Tipos: plato-carta normal
- Ficha: medio-lena
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: el contador la renombra a «1/2 pollo a la leña baby» → pollo-lena × 1.

**1 · 1/4 Pollo a la leña + papa frita + arroz + ensalada**

- Cocina: 1/4 Pollo a la leña
- Tipos: plato-carta normal, platos-cena, platos-escolar
- Ficha: cuarto-lena
- Complementos: Guarnicion: Papa Frita, Arroz, Ensalada, Frijoles, ZC, Camote frito, Yuca frita, papa dorada · Variacion (obligatorio, anexa al nombre): Pie, Pec
- Pestaña: Pollo leña × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: el contador la renombra a «1/4 pollo a la leña» → pollo-lena × 1.

**K786 · Chancho a la Leña + Frejol + Arroz**

- Cocina: Chancho Leña
- Tipos: plato-carta normal
- Ficha: chancho-lena
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: el contador la renombra a «Chancho a la leña» → chancho-lena × 1.

**3 · Chancho a la Leña + PF + Arroz + Ensalada**

- Cocina: Chancho Leña
- Tipos: plato-carta normal
- Ficha: chancho-lena
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: el contador la renombra a «Chancho a la leña» → chancho-lena × 1.

**A15 · Chancho a la Leña BBQ**

- Cocina: Chancho Leña BBQ
- Tipos: plato-carta normal
- Ficha: chancho-lena
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla · BBQ (obligatorio, anexa al nombre): BBQ junto, BBQ aparte
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: el contador la renombra a «Chancho a la leña BBQ» → chancho-lena-bbq × 1.

**A60 · Mixto leña 1/4 pollo + 300gr panceta + P-frita + Arroz + ensalada**

- Cocina: Mix leña (Pollo y Panceta)
- Tipos: plato-carta normal
- Ficha: mixto-lena
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla · Tipo (obligatorio, anexa al nombre): Pie, Pec
- Pestaña: Pollo leña × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: se parte en dos: «1/4 pollo a la leña» → pollo-lena × 1. «Panceta de chancho leña» → panceta × 1.

### Menu (4)

**R932 · Arroz con pollo + papa a la huancaina**

- Cocina: Arroz Pollo
- Tipos: plato-carta normal, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla, Papa a la huancaina
- Pestaña: Arroz con pollo × 1; Papas × 1
- Venta: no descuenta

**V378 · Pollada + papa fritas + Arroz + ensalada**

- Tipos: plato-carta normal, platos-cena, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: papas × 1, arroz-tipo-pollo × 1

**E930 · Pollo a la olla + Arroz + Papa a la huancaína**

- Cocina: Pollo Olla Arroz Papa huancaina
- Tipos: plato-carta normal, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla, Papa a la huancaina
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

**Y336 · Seco de Res + frijoles + arroz**

- Tipos: plato-carta normal, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

### PACHAMANCAS (Carta normal) (4)

**A34 · Pachamanca 1 sabor**

- Cocina: Pachamanca
- Tipos: plato-carta normal
- Ficha: pachamanca
- Complementos: Sabores (obligatorio, anexa al nombre): Pollo, Cerdo, Res, Carnero · Guarnicion Pachamanca: Humita, Tamal
- Pestaña: Pollo pachamanca × 1; Tamal × 1
- Venta: cada sabor marcado descuenta el suyo: Pollo → pachamanca-pollo × 1; Cerdo → pachamanca-chancho × 1; Res → pachamanca-res × 1; Carnero → pachamanca-cordero × 1. Sin sabor no descuenta. La guarnición (humita, tamal) no sale del contador.

**A35 · Pachamanca 2 sabores**

- Cocina: Pachamanca 2
- Tipos: plato-carta normal
- Ficha: pachamanca
- Complementos: Sabores (obligatorio, anexa al nombre): Pollo, Cerdo, Res, Carnero · Guarnicion Pachamanca: Humita, Tamal
- Pestaña: Pollo pachamanca × 1; Tamal × 1
- Venta: cada sabor marcado descuenta el suyo: Pollo → pachamanca-pollo × 1; Cerdo → pachamanca-chancho × 1; Res → pachamanca-res × 1; Carnero → pachamanca-cordero × 1. Sin sabor no descuenta. La guarnición (humita, tamal) no sale del contador.

**A37 · Pachamanca 3 sabores**

- Cocina: Pachamanca 3
- Tipos: plato-carta normal
- Ficha: pachamanca
- Complementos: Sabores (obligatorio, anexa al nombre): Pollo, Cerdo, Res, Carnero · Guarnicion Pachamanca: Humita, Tamal
- Pestaña: Pollo pachamanca × 1; Tamal × 1
- Venta: cada sabor marcado descuenta el suyo: Pollo → pachamanca-pollo × 1; Cerdo → pachamanca-chancho × 1; Res → pachamanca-res × 1; Carnero → pachamanca-cordero × 1. Sin sabor no descuenta. La guarnición (humita, tamal) no sale del contador.

**A38 · Pachamanca 4 sabores**

- Cocina: Pachamanca 4
- Tipos: plato-carta normal
- Ficha: pachamanca
- Complementos: Sabores (obligatorio, anexa al nombre): Pollo, Cerdo, Res, Carnero · Guarnicion Pachamanca: Humita, Tamal
- Pestaña: Pollo pachamanca × 1; Tamal × 1
- Venta: cada sabor marcado descuenta el suyo: Pollo → pachamanca-pollo × 1; Cerdo → pachamanca-chancho × 1; Res → pachamanca-res × 1; Carnero → pachamanca-cordero × 1. Sin sabor no descuenta. La guarnición (humita, tamal) no sale del contador.

### PESCADO, TRUCHA, POTA (Carta normal) (13)

**A26 · Ceviche**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A25 · Ceviche c/ Chicharrón de Pota**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion (fijo): Ceviche · GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: pota × 1

**A41 · Ceviche de Trucha**

- Cocina: Ceviche Trucha
- Tipos: plato-carta normal, platos-cena
- Ficha: pliegue
- Complementos: Tipo (obligatorio, anexa al nombre): Normal, Sin aji, Picante · GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A24 · Ceviche de pescado + Huancaína**

- Cocina: Ceviche pescado
- Tipos: plato-carta normal
- Ficha: pliegue
- Complementos: Guarnicion (obligatorio, fijo): Huancaina · Tipo (obligatorio, anexa al nombre): Normal, Sin Aji, Picante · GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A27 · Chicharron de Pescado**

- Cocina: Chicharrón Pescado
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**V161 · Chicharrón de Pescado + yuca frita + zarza**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Yuca Frita, ZC
- Pestaña: sin vínculo
- Venta: no descuenta

**A30 · Chicharrón de Pota + yuca + zarza**

- Cocina: Chicharrón Pota
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion: Yuca, Zarza
- Pestaña: sin vínculo
- Venta: pota × 1

**A40 · Chicharrón de Trucha**

- Cocina: Chicharrón Trucha
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A22 · Duo Marino Ceviche Chicharron de pescado**

- Cocina: Duo Ceviche
- Tipos: plato-carta normal
- Ficha: pliegue
- Complementos: Guarnicion (fijo): Chicharron pescado · Tipo (obligatorio, anexa al nombre): Normal, Sin aji, Picante · GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A23 · Duo Truchero Ceviche Chicharron de trucha**

- Cocina: Duo truchero
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion (fijo): Chicharron Trucha · GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: no descuenta

**A28 · Jalea de Pescado + yuca frita c/zarza**

- Cocina: Jalea Pescado
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion: Yuca frita, Zarza
- Pestaña: sin vínculo
- Venta: no descuenta

**A29 · Pescado Frito + Arroz + Papa Frita**

- Cocina: Pescado Frito
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: Guarnicion: Arroz, Papa Frita
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: papas × 1, arroz-tipo-pollo × 1

**A39 · Trucha Frita + Arroz + Papa + Zarza criolla**

- Cocina: Trucha Frita
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

### PIQUEO GAMBUSINAS (1)

**C15 · Piqueo Gambusinas**

- Cocina: Alitas BBQ 6 tequeño 6 chicharron pollo
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Papa Frita, Zarza Criolla
- Pestaña: Papas × 1
- Venta: no descuenta

### POLLO (4)

**U342 · Filete Junior + papa frita + arroz + ensalada**

- Tipos: plato-carta normal, platos-cena, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: filete-junior × 0.5, papas × 1, arroz-tipo-pollo × 1

**A31 · Filete de pollo+ papa frita +arroz +ensalada.**

- Cocina: Filete pollo
- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Filete × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: filete × 1, papas × 1, arroz-tipo-pollo × 1

**A32 · Milanesa + Papas Fritas + Arroz + Ensalada**

- Cocina: Milanesa
- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Arroz, Papa Frita, Ensalada
- Pestaña: Milanesa × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: milanesa × 1, papas × 1, arroz-tipo-pollo × 1

**T643 · Milanesa Junior + Arroz + papa frita + ensalada**

- Tipos: plato-carta normal, platos-cena, platos-escolar
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Milanesa × 1; Papas × 1; Arroz pollo × — (por completar)
- Venta: milanesa-junior × 1, papas × 1, arroz-tipo-pollo × 1

### PORCIONES (7)

**O761 · Huevo**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**P925 · Porción de Arroz**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

**P1 · Porción de Camote**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**V166 · Porción de Camote Frito**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**J868 · Porción de Frejol**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**I518 · Porción de Papa Frita**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Papas × 1
- Venta: papas × 1

**J941 · Porción de Yuca**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### POSTRE (2)

**L123 · Delicia**

- Tipos: platos-desayuno, platos-cena, plato-carta normal
- Ficha: suelto
- Complementos: Sabores-+ (obligatorio): Limon, Maracuya, Chocolate
- Pestaña: sin vínculo
- Venta: no descuenta

**L321 · Helado Artesanal**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: Sabores (obligatorio): Chirimoya, Lucuma, Coco, Chocolate, Fresa, Maracumango, Quinua, Frutas del bosque
- Pestaña: sin vínculo
- Venta: no descuenta

### Piqueo Gambusinas (1)

**C14 · Piqueo Gambusinas**

- Cocina: Alita broster 6 tequeño 6 Chichrron pllo
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion: Papa Frita, Zarza Criolla, Ensalada, Guacamole
- Pestaña: Papas × 1
- Venta: no descuenta

### Pizza (1)

**C1 · Pizza Americana 20 x 20 personal (Jamon- Queso)**

- Cocina: Pizza 20x20
- Tipos: platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### Sandwich (3)

**C5 · Pan Queso fresco o palta o aceituna**

- Cocina: Pan
- Tipos: platos-cena
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Queso, Palta, Aceituna
- Pestaña: sin vínculo
- Venta: no descuenta

**C3 · Pan con Pollo**

- Cocina: Pan Pollo
- Tipos: platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Menú × — (por completar)
- Venta: menu × 1

**C4 · pan con chorizo**

- Cocina: Pan Chorizo
- Tipos: platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Chorizo
- Pestaña: sin vínculo
- Venta: no descuenta

### SÁNDWICHES (Desayuno) (10)

**D16 · Huevo revuelto + 2 panes**

- Cocina: Huevo revuelto
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Pan
- Pestaña: sin vínculo
- Venta: no descuenta

**D17 · Jamon del pais Nino + mostaza + zarza criolla**

- Cocina: Jamón del pais Nino
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion: Mostaza, Zarsa criolla
- Pestaña: sin vínculo
- Venta: no descuenta

**D18 · Pan con Pollo**

- Cocina: Pan Pollo
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: Menú × — (por completar)
- Venta: menu × 1

**D23 · Pan con aceituna**

- Cocina: Pan Aceituna
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D22 · Pan con huevo**

- Cocina: Pan Huevo
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D20 · Pan con palta**

- Cocina: Pan Palta
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D19 · Pan con queso**

- Cocina: Pan queso
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D24 · Pan de Mermelada c/Mantequilla**

- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D14 · Pan solo**

- Cocina: Pan
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**D15 · Tamal con 2 panes**

- Cocina: Tamal
- Tipos: platos-desayuno
- Ficha: suelto
- Complementos: Guarnicion (obligatorio): Pan
- Pestaña: Tamal × 1
- Venta: tamal × 1

### TRUCHA - CUY - CARNERO - PATO (Carta normal) (4)

**A42 · 1/2 cuy frito + arroz + papas doradas + zarza criolla**

- Cocina: 1/2 cuy frito
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

**A46 · Arroz con pato (1/4)**

- Tipos: plato-carta normal
- Ficha: pliegue
- Complementos: Guarnicion: Huancaina, Arroz, Huevo, Aceituna, Zarza criolla · Variante (obligatorio, anexa al nombre): Pecho, Pierna
- Pestaña: Arroz pato × 1
- Venta: arroz-pato × 1

**A43 · Cuy entero frito + arroz + papas doradas + zarza criolla**

- Cocina: Cuy entero frito
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

**A44 · Seco de carnero chico (250 gr + arroz + frijol + zarza criolla)**

- Cocina: Seco carnero chico
- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: GUARNICIONES: Arroz, Papa Frita, Ensalada, Frijol, Yuca Frita, Yuca Sancochada, Papa Dorada, Papa Sancochada, Camote Frito, ZarCriolla
- Pestaña: Papas × 1; Arroz pollo × — (por completar)
- Venta: arroz-tipo-pollo × 1

### Taper (1)

**J19 · Taper**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

### VINO (7)

**B14 · Anis Najar**

- Tipos: plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B10 · Copa**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**S549 · Intipalka**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B13 · Sangria (1 litro)**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: licor-sangria-1-litro × 1

**B12 · Tabernero Borgoña**

- Tipos: platos-desayuno, plato-carta normal, platos-cena
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**T106 · Tabernero Rose**

- Tipos: plato-carta normal, platos-cena, platos-desayuno
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta

**B11 · Tacama**

- Tipos: plato-carta normal
- Ficha: suelto
- Complementos: ninguno
- Pestaña: sin vínculo
- Venta: no descuenta
