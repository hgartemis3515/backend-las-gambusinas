# Inventario del panel — documentación y brief de rediseño

**Pantalla:** `backend-gambusinas/public/inventario.html`  
**Fecha:** 23 de octubre de 2026  
**Para qué sirve este archivo:** contexto real de la sección, la cuenta que pinta hoy, qué la rodea en el restaurante, y el prompt para pegar en Google AI Studio.

La fuente de verdad es el código. Los planes `PLAN_INVENTARIO.md` y `PLAN_INVENTARIO_SALIDA.md` describen la intención; donde divergen, abajo se dice qué hace la pantalla ahora.

---

## 1. Objetivo

Llevar, en el día, la existencia de los productos que el restaurante prepara y vende: pollo, pescado, pachamanca, arroz, panceta y el resto de la carta de producción.

No es un inventario de insumos de almacén (aceite, sal, vasos). La unidad es el **rubro de cocina**: lo que entra crudo, lo que se transforma y lo que sale ya elaborado.

Cada día debe responder, sin Excel:

1. Con cuánto amaneció cada producto.
2. Cuánto ingresó hoy.
3. Cuánto salió por venta y cuánto se transformó en otro producto.
4. Cuánto debería quedar.
5. Cuánto contó alguien en físico, y la diferencia.
6. Si ese resto está en zona crítica, para que cocina lo vea.

El período (Hoy, Ayer, 7 días, Todos, Personalizado) solo elige qué días se miran. No borra los días viejos.

## 2. Lugar en el sistema

Un solo negocio, varias apps. El inventario se anota en el **panel** (HTML del backend). El backend calcula. Cocina solo avisa. Mozos no tienen esta pantalla.

| Pieza | Rol con el inventario |
|---|---|
| Panel `inventario.html` | Hoja del día, crudo/cocido, transformación, historial, conteo. Permiso `ver-inventario`. |
| API `/api/inventario/*` | Kardex, movimientos, alertas, umbral por rubro, borrar el día. |
| Mongo `inventario_movimientos` | Cada ingreso, egreso, corrección o conteo. El saldo no se guarda suelto: se recalcula. |
| Mongo `inventario_rubros` | Mínimo de alerta por rubro, crudo y cocido. `0` = no avisa. |
| Reportes | El contador de platos vendidos. Se cruza con un mapa fijo y aparece como «Venta (reportes)». |
| App cocina | Franja roja `AlertaInventarioFranja` en Ver Cocina Completo y Personalizado. No resta stock. |
| App mozos | No muestra inventario. La carta sigue usando `plato.stock`, que **esta pantalla no actualiza**. |
| Cierre de caja | Emite `inventario:cierre` en `/admin`. El panel abre el modal «Reporte de inventario». |
| Auditoría | Corrección, conteo, ingreso, egreso y «eliminar datos de hoy» quedan en `auditoria`. |

Día del inventario: **calendario Lima, 00:00 a 23:59**. El comentario del código dice que el inventario cierra a las 23:59.

El día de **reportes** es otro: **04:00 a 03:59** del día siguiente (día operativo). Una venta a la 01:30 es «ayer» en reportes y «hoy» en inventario. Por eso la misma leña puede no caer en el mismo rótulo de día.

## 3. Qué problema de restaurante resuelve

En cocina de pollería y pachamanca el cuadre no es «un SKU con código de barras». Es una hoja de producción:

- Entra pollo entero (crudo).
- Se parte en filete, chicharrón, pachamanca, pollada, menú, sándwich, evento, Beata, Sr. Juan, Bubu.
- Entra pescado (tollo, perico). Sale chicharrón de pescado o ceviche.
- Lo vendido debería bajar el cocido.
- Al cierre alguien cuenta lo que queda en cámara y anota la diferencia (merma, error de anotación, plato de personal).

Sistemas parecidos en la industria, y qué conviene copiar de cada uno:

| Referencia | Qué hacen bien | Qué no copiar aquí |
|---|---|---|
| Hoja Excel de producción / mise en place | Densidad, una fila por producto, números grandes, ± al lado. Es el modelo mental del usuario. | Once columnas iguales sin leyenda. Celdas que parecen editables y no lo son. |
| Odoo Inventario | Operaciones con nombre: recepción, transferencia interna, ajuste, desecho. Cada una deja rastro. | Almacén multi-ubicación, lotes, códigos de barras. |
| Toast, Square, Lightspeed | Conteo físico en un modo aparte, grande, de una sola tarea. Estado claro: ok / bajo / agotado. | Inventario solo de bebidas embotelladas. |
| MarketMan, Apicbase, BlueCart | Recetas, proveedores, costo, orden de compra. | Recetas y facturas. El negocio las dejó fuera. |
| MarketMan «actual vs teórico» | Diferencia entre lo que debería quedar y el conteo, con color. | El costo en dólares en cada celda. |
| KDS (la propia app cocina) | Una franja, un dato, se lee de lejos. | Traer la hoja de 11 columnas a la pantalla de comandas. |

La interfaz que mejor encaja **no es un dashboard de tarjetas**. Es una hoja de producción con tres modos de trabajo y una sola cuenta visible.

## 4. Las tres vistas de hoy

La página usa Alpine.js, Tailwind (CDN), la cáscara del dashboard (topbar, sidebar, oro `#d4af37`, fondo `#0a0a0f`, Inter). Permiso `ver-inventario`. Si no lo tiene, no carga datos.

### 4.1 Tabla (vista por defecto)

Buscador por nombre. Una fila por producto de la carta de producción.

Columnas, de izquierda a derecha, con el color de encabezado actual:

| Columna | Color | Se edita | Qué es |
|---|---|---|---|
| Producto | Oro | No | Nombre del rubro. La primera columna queda fija al desplazar. |
| Saldo anterior | Crema | ± y caja | Lo que arrastra el kardex de antes del rango. El ± no edita el cierre de ayer: anota un **ingreso con fecha de ayer**. |
| Ingreso | Verde | ± y caja | Ingresos del rango, salvo los que dicen «Pasa a …». |
| Corrección | Amarillo | Abre modal | Suma de regulaciones. Exige motivo. Marca `#` si el número no es 0. |
| Ingreso total | Ámbar | No | Ver fórmula en la sección 5. |
| Salida (A) Venta | Rojo claro | Caja | Solo egresos cuyo motivo empieza por «Venta». **No suma** las ventas de reportes. |
| Salida (B) Transformación | Naranja | Abre modal | Kilos o unidades que «pasan a» otro producto. Muestra la inicial del destino (F, C, P…). |
| Saldo | Azul | No | Ingreso total − venta − transformación. |
| Inventario | Violeta | Abre modal | Conteo físico de hoy. Marca `#` si hubo conteo. |
| Saldo real | Oro claro | No | El conteo, si hubo; si no, el saldo. |
| Diferencia | Cian | No | Conteo − saldo. Azul si sobra, rojo si falta. Vacío si nadie contó. |

Debajo, solo en esta vista:

- **Cuánto queda.** Saldo real de cada producto. Si el día no tuvo movimientos, aquí se muestra el saldo anterior (en la tabla de arriba esas celdas salen en 0).
- **Estado del stock.** Pastilla Crítico / Bajo / Normal. Los cortes están fijos en la pantalla: crítico si queda 5 o menos, bajo hasta 10. **No usa** el umbral guardado en `inventario_rubros`.
- **Historial del día** (o «Registros del período»): fecha, producto, tipo, ingresó, salió, motivo. Aquí sí entran las ventas de reportes, con motivo «Venta (reportes)».
- **Anotar movimiento:** formulario de «sale un rubro / ingresa otro», con crudo o cocido y motivo.

### 4.2 Crudo y cocido

Cuadros: Pachamanca, Pollo, Pescado, Panceta, Arroz. Cada fila tiene Cocido, Crudo y Total. Esos números son el saldo que baja (`baja` del kardex), no el ingreso del día.

El ± anota un ingreso de ese tipo (crudo o cocido).

Abajo, un historial corto del día: qué (crudo/cocido), producto, cantidad. Si no hay nada: «Registro no realizado».

El selector de fecha (‹ hoy ›) solo aparece en esta vista y en Transformación. La Tabla usa el período de arriba.

### 4.3 Transformación

Dos cuadros:

- **Pollo.** Cantidad ingresada de `pollo-origen` crudo. Destinos: Filete, Chicharrón de pollo, Pachamanca, Pollada, Menú, Sandwich, Evento, Beata, Sr. Juan, Bubu. El ± de «obtenida» traslada: resta del origen (ingreso negativo, motivo `Pasa a {destino}`) y suma al destino (motivo `Sale de Pollo`).
- **Pescado.** Tollo → Chicharrón de pescado. Perico u ojo de uva → Ceviche. El destino entra como cocido.

Historial corto de transformaciones debajo.

### 4.4 Configuración y modales

- **Aprovechador.** Preferencia local. Quita esquinas y huecos para pegar los cuadros, como una planilla. No cambia números.
- **Eliminar datos de hoy.** Borra los movimientos cuya fecha cae en el día calendario de hoy. Queda en auditoría. El texto del modal dice que pone en 0 el saldo anterior; eso solo ocurre si ese saldo era un movimiento de hoy. Lo arrastrado de días previos sigue.
- **Corrección / Inventario.** Modal con ±, número y motivo obligatorio (máx. 200).
- **Salida (B).** Elige destino, cantidad, y lista lo ya transformado. Destinos extra en todos los productos: Río Lindo (marca `R`) y Otros (texto libre). Esos dos no crean un rubro destino: solo restan del origen.
- **Reporte de inventario.** Se abre solo al recibir `inventario:cierre` (cierre de caja). Lista correcciones, salidas (ventas de reportes + egresos manuales), transformaciones y saldos distintos de 0.

## 5. La cuenta que pinta la Tabla

El backend arma un kardex por rubro y por tipo (`crudo` | `cocido`):

```
total       = saldo inicial + ingresos
saldo final = total − egresos
baja        = saldo final + regulación
cierre      = saldo corrido (incluye conteo como valor absoluto, no como suma)
```

La clase `inventario` (conteo) no suma: reemplaza el balance desde ese momento. Un conteo nuevo pisa al anterior del mismo rango.

La Tabla **no muestra** crudo y cocido por separado. Suma los dos y luego aplica otra cuenta, en el navegador:

```
hayDia        = hubo ingreso, corrección, venta manual, transformación o conteo
ingresoTotal  = si hay corrección: saldo anterior + corrección
                si no:            saldo anterior + ingreso
saldo         = ingreso total − venta manual − transformación
inventario    = conteo, si hubo; si no, el saldo
saldoReal     = conteo, si hubo; si no, el saldo
diferencia    = conteo − saldo   (solo si hubo conteo)
queda         = saldoReal si hayDia; si no, saldo anterior
```

Si el día no tuvo movimiento, Ingreso total, Saldo, Inventario y Saldo real se pintan en **0**, y «Cuánto queda» usa el saldo anterior. La misma fila dice dos cosas distintas.

La venta de reportes **no entra** en Salida (A) ni en el saldo de la fila. Entra en el historial y en el reporte de cierre. Escribir en Salida (A) crea un egreso con motivo «Venta», que es otra cifra, manual.

La transformación no es una clase propia. Es un ingreso negativo con motivo que empieza por `Pasa a `, más un ingreso positivo `Sale de {origen}` en el destino.

## 6. Carta de productos

Definida en `src/utils/inventarioRubros.js`. La Tabla lista `KARDEX`. Pachamanca es la suma de pollo, chancho, res y cordero.

Grupos de Crudo y cocido: Pachamanca, Pollo (más el origen), Pescado (más el origen), Panceta, Arroz.

Mapa venta de reportes → rubro (`inventarioSalidaVentas.js`), factor 1:

| Fila de reportes | Rubro |
|---|---|
| 1/4 pollo a la leña | `pollo-lena` |
| 1/2 pollo a la leña baby | `pollo-lena` |
| Panceta de chancho leña | `panceta` |
| Pollo / cerdo / res / carnero de pachamanca | el rubro de esa carne |

Chancho a la leña, bebidas, guarniciones y el resto de la carta **no mueven** inventario. El medio pollo cuenta 1, no 2.

Esas ventas se calculan al vuelo. No se guardan como movimiento. Si anulan la comanda, desaparecen del historial. El día de esa venta, en este cruce, es el día calendario, no el de las 04:00.

## 7. API y tiempo real

| Método | Ruta | Uso en la pantalla |
|---|---|---|
| GET | `/api/inventario/kardex?carta=1&desde&hasta` | Filas, carta y ventas del rango. |
| GET | `/api/inventario/movimientos?desde&hasta` | Historial manual. |
| GET | `/api/inventario/alertas` | Franja roja del panel y de cocina. |
| POST | `/api/inventario/movimientos` | ±, corrección, conteo, traslado, formulario. |
| DELETE | `/api/inventario/hoy` | Borrar movimientos de hoy. |
| PUT | `/api/inventario/rubros/:clave` | Umbral. La pantalla de inventario no lo edita hoy. |

Clases que acepta el alta: `ingreso`, `egreso`, `regulacion`, `inventario`.

Sockets en `/admin` que recargan la hoja (con 800 ms de espera): `inventario:alerta`, `nueva-comanda`, `comanda-actualizada`. `inventario:cierre` abre el reporte.

Cocina escucha `inventario:alerta` en `/cocina` y pinta nombre, tipo y saldo. No abre esta tabla.

## 8. Diseño actual, en corto

- Hoja densa, letra 16 px en la tabla principal, cajas blancas pequeñas, ± dorados.
- Encabezados de color para separar columnas. Sirve, pero no hay leyenda ni grupos («entró / salió / conté»).
- `animate.css` y `page-transitions.js` están cargados. La tabla no anima el cambio de un número ni el aviso de una venta nueva.
- Modales: caja centrada, fondo negro al 70 %, sin transición propia.
- Alerta crítica: un párrafo largo, todos los productos en una sola línea.
- Once columnas obligan a scroll horizontal en un portátil de 1366 px.
- El nombre «Aprovechador» no dice qué hace.
- Dos ideas de «crítico»: la franja (umbral del rubro) y la pastilla (5 y 10 fijos).

## 9. Qué mejorar

Prioridad para el rediseño. Nada de esto está implementado: es la recomendación para el brief.

### Cuenta (lógica que el usuario tiene que poder creer)

1. **Una sola cifra de «queda».** La tabla y «Cuánto queda» deben mostrar el mismo número. Si no hubo movimiento hoy, Saldo real sigue siendo el saldo anterior, no 0.
2. **Salida (A) = ventas de reportes, solo lectura.** La merma o el consumo de personal es otra columna o el formulario, no una segunda «Venta».
3. **Saldo anterior solo lectura.** Ajustar el pasado es una corrección con motivo, no un ingreso fechado ayer desde el ±.
4. **Ingreso total con una sola fórmula**, dicha en la pantalla: `saldo anterior + ingresos + corrección`. Hoy, si hay corrección, el ingreso del día desaparece de esa columna.
5. **Un solo «crítico».** El umbral del rubro alimenta la franja, la pastilla y cocina. 5 y 10 dejan de ser mágicos. Bajo puede ser umbral × 2 si el negocio no define otro corte.
6. **Transformación como traslado**, no como texto `Pasa a`. La UI puede seguir diciéndolo en castellano; el brief no debe inventar campos nuevos sin marcarlos como propuesta.
7. **Rendimiento visible** en Transformación: obtenido / ingresado. Aviso si pasa de 100 % o si el destino se pasa del origen.
8. **Día dicho en el encabezado.** «Día calendario, cierra 23:59. Reportes cierran a las 04:00.» Así la diferencia de la leña de madrugada no parece un bug mudo.
9. **No sumar unidades de productos distintos** en el pie «Suma» de «Cuánto queda» como si fueran la misma cosa (un pollo + un arroz no es «2»). Quitar ese total o agruparlo por familia.

### Interfaz (la más entendible)

La mejor interfaz para este puesto de trabajo es una **hoja de producción del día**, no un tablero de tarjetas ni un ERP.

Tres modos, un producto = una fila:

1. **Día.** Lo que se mira a cada rato. Cuatro bandas, no once columnas sueltas:
   - Apertura: producto + saldo anterior.
   - Entró: ingreso + corrección.
   - Salió: venta (reportes) + transformación.
   - Queda: saldo teórico, conteo, diferencia.
2. **Conteo.** Una tarea. Lista grande, número enorme, motivo, siguiente producto. Pensado para quien está en cámara con el teclado, no para leer once columnas.
3. **Transformar.** Un flujo, no dos tablas: origen a la izquierda, destinos a la derecha, una línea que se parte. Total obtenido contra total ingresado.

Detalles que bajan la carga:

- Leyenda fija de la fórmula, de una línea, y la misma frase al pasar el mouse por Saldo.
- Venta de reportes en gris, con un punto «viene de comandas». No parece una caja editable.
- Iniciales F/C/P sustituidas por el nombre corto del destino, o un chip.
- Buscador que deja marcada la fila y permite flechas entre celdas editables.
- Productos en 0 y sin movimiento del día se pueden plegar. Los críticos quedan arriba.
- «Aprovechador» pasa a llamarse **Compacto**.
- Vacío de historial: «Hoy no hay anotaciones», no un error.
- Deshacer el último ± (el borrado del día entero queda en Configuración, con el texto corregido: borra movimientos de hoy, no el arrastre de ayer).
- Quién anotó y a qué hora, en un tooltip del `#`. El dato ya puede salir del movimiento; si el API no manda el usuario en el listado, el prototipo lo muestra como propuesta.

Seguir en castellano de Perú, unidades en el número pelado (el negocio no cargó kg vs unidad por rubro). No agregar recetas, proveedores, costos ni pantalla de mozos.

### Movimiento (animado, sin estorbar la digitación)

La hoja se usa para cargar números rápido. La animación confirma el cambio; no decora.

- Modal: 160 ms, opacidad + escala de 0.98 a 1, curva ease-out. Cierre igual de corto.
- ± : 80 ms de escala 0.96 al pulsar. El número nuevo hace un destello oro de 400 ms en esa celda, sin rebote.
- Fila tocada por socket (venta o alerta): borde izquierdo oro que aparece en 200 ms. No parpadea toda la fila.
- Crítico: solo el punto de estado pulsa en 2 s. La fila quieta, para poder seguir tipeando.
- Cambio de pestaña: fundido de 140 ms. La tabla no se desliza (el slide mueve las columnas y se pierde el lugar).
- Alerta nueva: la franja entra desde arriba, 200 ms. Lista en vertical, un producto por línea, no un párrafo.
- `prefers-reduced-motion`: nada de lo anterior, salvo el color.
- No usar bounce, tada, shake ni animate.css de adorno. No GSAP en esta hoja.

### Qué no pedir en este rediseño

- Copiar el saldo a `plato.stock` (mozos ocultarían el plato). Es otra decisión de negocio.
- Egreso automático al entregar en cocina, si Salida (A) ya lee reportes.
- Recetas, compras, facturas, múltiples almacenes.
- Inventario dentro de la app de mozos o del KDS, más allá de la franja que ya existe.

## 10. Prompt para Google AI Studio

Copiar desde la línea siguiente hasta el final del bloque.

```
Eres diseñador de producto senior y director de interfaz para software de restaurante. Rediseña la pantalla de inventario de Las Gambusinas. Entrega UN solo archivo HTML autocontenido (Tailwind por CDN + Alpine.js 3 por CDN, sin build, sin React). Datos de mentira, en español de Perú. No llames a ninguna API.

Al inicio del HTML, en un comentario, escribe en español: qué cambiaste de la cuenta, qué es solo visual, y qué animaciones usaste. Después, dentro de la página, un panel plegable "Decisiones" con lo mismo, corto, para que el dueño lo lea.

CONTEXTO
Restaurante de pollería, pachamanca y pescado en Perú (Las Gambusinas). El inventario no es un almacén de insumos. Es la hoja de producción del día: cuánto había, cuánto entró, cuánto se vendió, en qué se transformó el pollo o el pescado, cuánto queda y cuánto contaron en físico.

Lo usa una persona en el panel de administración, en una PC de 1366 px y otra de 1920 px. También tiene que leerse a 1024 px. No es la app del mozo ni la pantalla de cocina. Cocina solo ve una franja roja de alerta.

Marca visual que debes respetar:
- Fondo #0a0a0f, tarjetas #1a1a28, sidebar ya existe: NO dibujes sidebar ni topbar. Solo el contenido de la página, con padding 24px.
- Oro #d4af37, texto blanco, secundario #a0a0b8, muted #5a5a7a.
- Fuente Inter.
- Tablas densas. Esto es una herramienta de carga de números, no una landing ni un dashboard de tarjetas.

QUÉ HACE HOY (y debes mejorar, no copiar el desorden)
Hay 3 vistas: Tabla, Crudo y cocido, Transformación.
Períodos: Hoy, Ayer, 7 días, Todos, Personalizado.
La Tabla tiene 11 columnas: Producto, Saldo anterior, Ingreso, Corrección, Ingreso total, Salida (A) Venta, Salida (B) Transformación, Saldo, Inventario, Saldo real, Diferencia.
Problemas reales que el rediseño tiene que resolver:
1. Si el día no tuvo movimientos, la tabla pinta saldo 0 pero otra tabla de abajo muestra el saldo anterior. El usuario ve dos verdades. En tu prototipo hay UNA sola cifra de "queda".
2. Escribir en Salida (A) crea una venta manual. Las ventas reales de las comandas hoy solo aparecen en el historial, no bajan el saldo. En tu prototipo Salida venta es de solo lectura y SÍ baja el saldo. Viene de comandas. Se distingue con un punto y el texto "comandas". La merma no se llama venta.
3. El ± de Saldo anterior hoy graba un ingreso con fecha de ayer. En tu prototipo el saldo anterior no se edita. Ajustar es la corrección, con motivo.
4. Hoy, si hay corrección, Ingreso total ignora el ingreso del día. Fórmula que debes usar y mostrar en una leyenda fija de una línea:
   ingreso total = saldo anterior + ingreso + corrección
   saldo = ingreso total − venta − transformación
   saldo real = conteo físico si hubo conteo; si no, el saldo
   diferencia = conteo − saldo (vacío si nadie contó; azul si sobra, rojo si falta)
5. Hay dos "crítico": la franja usa un mínimo por producto y las pastillas usan 5 y 10 fijos. Usa solo el mínimo del producto. Bajo = más que el mínimo y hasta el doble. Normal = por encima. Crítico = en el mínimo o por debajo, y el mínimo es mayor que 0.
6. La transformación hoy es un texto "Pasa a Filete". Muéstrala como un traslado: origen → destino, con rendimiento obtenido/ingresado. Aviso suave si el obtenido pasa del ingresado.
7. Las iniciales F, C, P al lado del número no se entienden. Usa el nombre del destino.
8. "Cuánto queda" no debe sumar pollo + arroz en un solo total.
9. El botón "Aprovechador" (pega los cuadros, quita radios) pasa a llamarse "Compacto".
10. "Eliminar datos de hoy" sigue existiendo, escondido en Configuración, con texto honesto: borra las anotaciones de hoy, no el saldo que vino de ayer. Pide confirmar.

PRODUCTOS DE EJEMPLO (úsalos todos en la Tabla)
Pollo, Pescado, Filete, Chicharrón de pollo, Pachamanca, Lomo fino, Trucha, Bisteck, Filete de trucha, Ceviche, Chicharrón de pescado, Pescado frito, Pota, Yuca, Pato, Seco de res, Cuy, Chicharrón de chancho, Pollada, Seco de cordero, Panceta, Pollo leña, Humita, Tamal, Arroz.
Inventa números creíbles de un día de servicio. Al menos 3 críticos, 3 en cero estable (se pueden plegar), 2 con conteo que no cuadra, 1 con transformación de pollo ya hecha.

Vistas Crudo y cocido, cuadros: Pachamanca (Pollo, Chancho, Res, Cordero), Pollo (el origen + Pollada, Presas de arroz con pollo, Presas de pollo a la olla), Pescado (el origen + Ceviche, Chicharrón de pescado, Pescado frito), Panceta, Arroz. Columnas: Cocido, Crudo, Total.

Vista Transformar:
- Pollo crudo ingresado se reparte en Filete, Chicharrón de pollo, Pachamanca, Pollada, Menú, Sandwich, Evento, Beata, Sr. Juan, Bubu.
- Pescado Tollo → Chicharrón de pescado. Pescado Perico → Ceviche.
Muestra ingresado, obtenido y rendimiento. ± en los destinos. No hace falta que persista: al pulsar, el número cambia en pantalla y la celda destella.

INTERFAZ QUE QUIERO (la más clara para este trabajo)
No tarjetas por producto. Una hoja.

Tres modos en pestañas: Día, Crudo y cocido, Transformar. Más un modo Conteo, cuarta pestaña o botón primario "Contar".

Modo Día, cuatro bandas con encabezado de grupo, no 11 títulos sueltos:
- Apertura: producto (columna fija al hacer scroll) + saldo anterior.
- Entró: ingreso (editable con − input +) y corrección (abre modal con motivo).
- Salió: venta comandas (solo lectura) y transformación (abre un panel).
- Queda: saldo, conteo, diferencia, y un punto de estado.

Leyenda bajo el título, una sola línea, con la fórmula. Al pasar el mouse por Saldo, repite la cuenta de ESA fila con sus números ("40 + 10 + 0 − 6 − 4 = 40").

Franja de alerta arriba, un producto por línea: nombre, crudo o cocido, saldo, mínimo. No un párrafo largo.

Buscador. Filas que no coinciden se ocultan. Botón "Ocultar en cero" para los que no se movieron y están en 0.

Historial debajo: hora, producto, qué pasó en castellano (entró, salió por venta, se transformó en, corrección, conteo), cantidad, motivo. Ventas con la etiqueta "comandas".

Modo Conteo: una lista ancha, número grande, motivo, botón Guardar que pasa al siguiente producto crítico. Sin las once columnas.

Modo Transformar: origen a la izquierda, destinos a la derecha, conexión visual simple (línea o flecha CSS). Total y rendimiento.

Encabezado: "Inventario" y una frase corta: "Día calendario, cierra 23:59. Los reportes de venta cierran a las 04:00, por eso una venta de madrugada puede caer en otro día." Período a la derecha: Hoy, Ayer, 7 días, Todos, Personalizado. Al elegir Personalizado, dos fechas. Cambiar período solo filtra los datos de mentira (prepara dos días y conmuta).

Modal de corrección y de conteo: nombre del producto, − número +, motivo obligatorio, Guardar, Escape y clic afuera cierran.

Panel de transformación: a qué pasa, cantidad, lista de lo ya transformado, Río Lindo y Otros como destinos que solo restan (no crean fila nueva).

ANIMACIÓN (confirma el cambio, no adorna)
- Modal 160ms, fade + scale de 0.98 a 1, ease-out.
- Botón −/+: scale 0.96 durante 80ms.
- Celda cuyo número cambió: destello oro 400ms, sin rebote.
- Fila actualizada: una barra oro de 2px a la izquierda, 200ms. No parpadea la fila entera.
- El punto crítico pulsa suave cada 2s. La fila no.
- Cambio de pestaña: fundido 140ms. Prohibido deslizar la tabla.
- Franja de alerta: entra 200ms desde arriba.
- Respeta prefers-reduced-motion: sin movimiento, el color se queda.
- Prohibido bounce, tada, shake, confeti, gradientes animados y cualquier librería de animación. CSS y Alpine alcanzan.

DETALLE DE INTERACCIÓN
- Todo control con foco visible.
- Contraste de texto sobre oro: casi negro #1a1200, como hoy.
- Cajas numéricas blancas, número centrado, sin flechas nativas del input.
- Estados vacíos en castellano: "Hoy no hay anotaciones", "Ningún producto coincide".
- No inventes costos, proveedores, recetas, códigos de barras ni app de mozos.
- No cambies los nombres de los productos.
- Los números de ejemplo tienen que cuadrar con la fórmula. Revísalos antes de entregarlos.
- Si propones algo que la pantalla de hoy no hace, márcalo en "Decisiones" como propuesta, y que el prototipo ya lo muestre funcionando.

Entrega solo el HTML completo, listo para abrir en el navegador.
```
