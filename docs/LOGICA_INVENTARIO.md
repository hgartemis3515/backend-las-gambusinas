# Lógica de Inventario

Fecha: 18 de noviembre de 2026.
Reemplaza a `ANALISIS_LOGICA_INVENTARIO.md`. La guía de uso sigue en `GUIA_INVENTARIO.md`.

Este documento explica cómo debe cuadrar el inventario, qué estaba mal, cómo quedó cada sección y qué decisiones quedan pendientes.

## 1. Resumen

El inventario tenía **dos cuentas distintas**: el servidor llevaba una y la pantalla otra, con parches para acercarlas. Por eso los números se descuadraban entre días, entre columnas y entre pestañas.

Ahora hay **una sola cuenta**, en `src/utils/inventarioLibro.js`. Recorre en orden de hora todos los movimientos y ventas, día por día, y la pantalla solo muestra el resultado.

| Comprobación con tus datos reales (10 al 17 de noviembre) | Antes | Ahora |
| --- | --- | --- |
| Saldo anterior de hoy = Queda de ayer | 89 filas no cuadraban | 651 de 651 cuadran |
| Ingreso total = Saldo anterior + Ingreso | 20 filas no cuadraban, aun sumando Corrección | 610 de 610 cuadran |
| Queda = Ingreso total − Venta − Transformación ± Ajustes | Se rompía con conteos | 746 de 746 cuadran |
| Cuadro de Transformar = Queda de la tabla | Podían diferir | 746 de 746 iguales |
| Plato repetido en una comanda dentro del modal de ventas | 16 casos | 0 en 1.994 líneas |

## 2. Las reglas

El día operativo va de **04:00 a 04:00** (hora de Lima). A las 02:00 sigue siendo el día que empezó a las 04:00 de la víspera.

```
Saldo anterior = Queda del día anterior (+ ajuste de apertura, si alguien lo hizo)
Ingreso total  = Saldo anterior + Ingreso
Queda          = Ingreso total − Venta − Transformación + Cubierta + Corrección
```

- **Ingreso**: compras y pases que entraron a esta fila.
- **Venta**: lo que las comandas y las descargas manuales restaron de esta fila.
- **Transformación**: lo que salió de esta fila hacia otro corte o plato.
- **Cubierta**: venta de un plato que salió de otro producto (la pieza principal). No baja dos veces.
- **Corrección**: todos los ajustes de stock. Incluye el lápiz, la columna Corrección y la diferencia que encontró un conteo. **No entra en Ingreso total.**

Si Queda da menos de 0, la hoja muestra `0 (−N)` y lo marca como emergencia ese día. **El faltante no pasa al día siguiente**: se abre en 0.

Cada fila cuadra sola. Las filas con platos (Pecho, Pierna, Filete, Octavo) muestran debajo una línea **Grupo** con la suma de la fila y sus platos.

## 3. Problemas encontrados y cómo quedaron

| # | Lo que veías | Causa | Cómo quedó |
| --- | --- | --- | --- |
| 1 | Ayer quedó 10 y hoy el saldo anterior dice 1 | Tres causas juntas. Queda sumaba los platos y Saldo anterior no (Pierna: Queda 142, saldo anterior 7). Un faltante perdonado se corregía mirando solo **un día** atrás, y al segundo día volvía a restar. Las ventas anteriores a un conteo seguían restando después del conteo. | Se calcula día por día desde el inicio. Queda de ayer pasa completa a hoy. |
| 2 | Ingreso total no es la suma de saldo anterior e ingreso | Sumaba la Corrección (oculta en la tabla) y el Ingreso total de los platos. | Es exactamente Saldo anterior + Ingreso de la fila. El grupo va en su línea. |
| 3 | El modal de Ingreso total no coincide | Mostraba otra cosa: el stock de los platos, sin la suma. | Arriba muestra la cuenta: `Saldo anterior + Ingreso = Ingreso total`. |
| 4 | El mismo plato sale dos veces en Venta comandas | Una línea por cada origen. Si dos polladas salían una de cocido y otra de crudo, o un plato gastaba dos productos, se veían separadas. Además, una venta partida en dos repetía su primer plato y perdía el segundo. | Una línea por plato y comanda, con etiquetas de dónde salió cada parte. Las partes ya no repiten platos. |
| 5 | El total del modal de ventas no coincide con la columna | La columna y el modal contaban cosas distintas. | «De esta fila» es igual a la columna. Si hay más, una nota explica que salió de sus platos o de la pieza principal. |
| 6 | El cuadro de Transformar no muestra el stock real | Ignoraba los conteos, y la tabla sumaba platos. | Tabla, Transformar y lápiz leen el mismo número. |
| 7 | Después de un conteo, Queda no bajaba con las ventas | Queda se quedaba fija en lo contado. | El conteo deja el stock en ese número y lo que venga después sigue restando. |
| 8 | Editar stock guardaba un ingreso | Subir el stock registraba Ingreso, y en Pollo fresco además lo convertía en piezas. | Es un **Ajuste de stock**: deja el número escrito, no toca Ingreso ni Ingreso total y no convierte nada. |
| 9 | Editar stock daba otro número si entraba una venta | Calculaba con lo que había al abrir el modal. | Vuelve a leer el stock justo antes de guardar. |
| 10 | Descuadre no ayudaba | Marcaba como emergencia productos sin cocido que tenían stock (Chicharrón de chancho, Pieza de pota). «Dejar en 0» creaba saldos anteriores que descuadraban el día siguiente. | Dice qué pasó y ofrece la salida correcta (ver sección 4). |
| 11 | Después de medianoche «Hoy» salía vacío | «Hoy» usaba la fecha del calendario. De 00:00 a 03:59 mostraba el día siguiente. | «Hoy» es el día operativo. |
| 12 | Inca Kola 300ml aparecía como «Seco de Res + frijoles + arroz» | La fila de una bebida tomaba el nombre del primer plato que la gastó. | Usa el nombre de la bebida. |
| 13 | Al cambiar de fecha, una fila conservaba números de otro día | Las filas sin datos no se limpiaban. | Sin datos, la fila queda en 0. |
| 14 | Rangos largos con transformaciones incompletas | La lista se cortaba en 3.000 movimientos. | La Transformación la calcula el servidor. El límite de la lista subió a 20.000. |

## 4. Sección por sección

### Inventario Tabla: corregida

Cada columna es de la fila y cumple las fórmulas de la sección 2. El Saldo anterior sale en ámbar cuando tiene un ajuste de apertura, y al pasar el cursor dice cuánto quedó el día anterior. El Estado (Normal, Bajo, Crítico) se mide con el total del grupo.

### Venta comandas: corregida

La venta sigue la misma cascada de siempre, que está bien: primero el cocido del plato, luego su crudo y al final la pieza de reserva, según la configuración de cada producto. Lo que cambió es cómo se muestra (problemas 4 y 5).

### Transformar: corregida

Los pases siguen igual: el origen baja en Transformación y el destino sube en Ingreso. Las cajas muestran Queda. Las etiquetas «+N ingreso hoy» ya no cuentan los ajustes de stock.

### Editar stock (lápiz): corregida

- Se escribe cuánto hay y la diferencia queda como `Ajuste de stock`, en Corrección y en la auditoría.
- Octavos y platos por presa conservan su marca de pecho o pierna.
- Si estás viendo un día pasado, el ajuste se guarda al cierre de ese día y lo avisa en el modal.

### Conteo de cámara: corregido

Deja el stock en lo contado desde esa hora. La columna Diferencia muestra lo que sobró o faltó en ese momento. Acepta medios (por ejemplo 13,5).

### Descuadre: rehecho

Muestra el período que estás viendo, con tres tipos de caso:

| Caso | Qué significa | Qué puedes hacer |
| --- | --- | --- |
| **Faltó stock** | Se restó más de lo que había. | «Pasar crudo a cocido» si hay crudo libre, o «Ingresar lo que falta». |
| **Apertura ajustada** | El día no abrió con lo que quedó el anterior, porque alguien lo ajustó. | «Volver a lo que quedó ayer». |
| **Conteo** | Lo contado no coincidía con el stock. Ya quedó corregido, es informativo. | Nada. No enciende la alerta. |

### Sin cambios de lógica: funcionan bien

- **Relación de platos**: vincula productos y platos, y define cuánto gasta cada plato.
- **Descarga manual y descarga especial**: restan con la misma cascada y se pueden eliminar.
- **Bloqueo**: bloquea platos y productos, y aparta reservas.
- **Mapas de Transformar**: el editor de mapas no cambió.
- **Cierre del día a las 04:00**, **reporte del día** y **alertas de stock**: siguen igual, y ahora leen el número correcto.

## 5. Lo que debes revisar

Estas decisiones son tuyas. No cambié nada de esto.

1. **Platos que restan dos productos.** Están así en Relación de platos. Si no es lo que quieres, quita el vínculo que sobra:

   | Plato | Resta de | Por qué revisarlo |
   | --- | --- | --- |
   | Arroz Chaufa Chancho | Pieza de panceta **y** Chaufa de chancho | Es el caso que más se veía como «duplicado». |
   | Seco de carnero chico | Seco de carnero **y** Carnero crudo | Gasta las dos filas. |
   | Arroz con pollo | Arroz con pollo **y** Arroz verde + Pato | Parece un vínculo equivocado. |
   | Ceviche c/ Chicharrón de Pota | Pieza de pota **y** Pieza de pescado | Confirma si lleva las dos. |

2. **Ajuste «noche en cero».** El 16 de noviembre a las 17:44 hay 74 movimientos en 61 productos con el motivo `Saldo anterior · noche en cero`. Ningún código del sistema escribe ese texto, así que vino de un proceso externo o manual. Por eso ese día muchos productos abren distinto a lo que quedó el 15. Aparecen como **Apertura ajustada** en Descuadre. Si fueron intencionales, no hagas nada.

3. **Dos números de hoy cambian** al activar esta versión: **Pierna a la leña cocido pasa de 1 a 2** y **Delicias pasa de 0 a 6**. La cuenta anterior había perdido esas unidades por el problema 1. Los otros 93 saldos de hoy quedan igual. Si el físico dice otra cosa, corrígelo con el lápiz.

4. **Platos agregados a una comanda ya abierta.** La venta cuenta a la hora en que se creó la comanda. Si se agrega un plato después de un conteo, ese plato queda antes del conteo y no lo resta. Afecta solo a comandas abiertas durante el conteo.

5. **Papas** sigue fuera de Descuadre y sin emergencia, como estaba.

## 6. Lógica que sobra

Quité las funciones que estos cambios dejaron sin uso. Quedan **74 funciones en `inventario.html` que nada llama**, de versiones anteriores. No afectan los números y no las borré para no mezclar esa limpieza con este arreglo:

`soltarGrafico`, `abrirSectores`, `setPeriodoSectores`, `usarRangoSectores`, `periodosSectores`, `abrirDescargaSector`, `moverSaborPlatoVE`, `apartarEvento`, `moverCantidadBloqueo`, `textoRend`, `ajustarCrudoCampo`, `polloTransVista`, `ajustarIngresoFila`, `moverPescado`, `fijarPescado`, `esSaldoSuficiente`, `salidasAuditoria`, `guardarEditarOctavo`, `hayCocidoEditar`, `guardarEditarStockGrupo`, `guardarEditarStock`, `abrirModalNuevoPlato`, `guardarNuevoPlatoCarta`, `abrirModalEditarRelacion`, `predictiveTooltip`, `getGroupPredictiveAlertCount`, `exportarInventarioCSV`, `moverOctavoIngreso`, `puedeSumarPlato`, `corteDeFamilia`, `moverSaldoTransformacion`, `enTurnoCuadro`, `fijarIngresoDirecto`, `moverDespiece`, `fijarTrozosPanceta`, `fijarPescadosUsados`, `fijarPiezasPescado`, `fijarPotasUsadas`, `fijarPiezasPota`, `stepField`, `updateCorreccion`, `adjustCrudoCocido`, `formulaCorte`, `esPlatoSoloPierna`, `asegurarOctavos`, `piezasPorOctavos`, `octavosLibres`, `updatePlatoFilete`, `piernasLibres`, `pechugasLibres`, `updatePechugasAFilete`, `updateOctavos`, `updatePlatoOctavo`, `crudoVisibleAderezo`, `restarCrudoVisible`, `restarCrudoPlato`, `updateAderezoCorte`, `volcarTransformacionEnTabla`, `programarGuardadoDespiece`, `aporteDespieceDe`, `fijarArrozCrudo`, `guardarDespieceEnServidor`, `platoCartaSeleccionadoInfo`, `esNodoSeleccionadoEnMapa`, `editarMapaActualDesdeRelacion`, `getRelacionGroups`, `toggleRelGroup`, `aplicarDeltaPadre`, `aplicarLotePlato`, `guardarPaseTipo`, `platosDeMapa`, `estadoMapa`, `volcarMapasDinamicosEnFilas`, `guardarMapasDinamicos`.

## 7. Cómo está armado

```
Movimientos (inventario_movimientos) ─┐
                                      ├─> armarLibro ─> filas por producto y tipo ─> inventario.html
Ventas de comandas ───────────────────┘
```

| Archivo | Qué hace |
| --- | --- |
| `src/utils/inventarioLibro.js` | La cuenta: abre y cierra cada día, aplica movimientos y reparte ventas. |
| `src/utils/inventarioCascadaVenta.js` | Reglas de venta: tipos de stock de cada producto, orden de la cascada y reparto de platos. |
| `src/utils/inventarioSalidaVentas.js` | Convierte comandas en consumo de productos, usando la Relación de platos. |
| `src/repository/inventario.repository.js` | Lee los datos y entrega el kardex, los reportes y las alertas. |
| `public/inventario.html` | Muestra las filas. Al editar, actualiza al instante y luego recarga lo guardado. |

**Tipos de stock.** Un producto sin cocido tiene un solo stock, aunque lleguen movimientos marcados como cocido. Un producto solo cocido (Pieza de panceta, tamales, arroz blanco y verde) guarda todo en cocido.

**Movimientos.**

| Clase | Motivo | Efecto |
| --- | --- | --- |
| `ingreso` | Cualquiera | Suma en Ingreso. |
| `ingreso` | `Pasa a …` | Sale por Transformación. |
| `ingreso` | `Saldo anterior…` o `Ajuste apertura…` | Ajusta la apertura del día. |
| `egreso` | Descarga manual o especial | Resta en Venta. |
| `regulacion` | `Ajuste de stock…` o `Corrección…` | Suma o resta en Corrección. |
| `inventario` | `Conteo…` | Deja el stock en ese número y se ve en Conteo. |
| `inventario` | `Puesta en cero` | Deja el stock en 0. |

**Ajustes antiguos.** Los `Saldo anterior` positivos de antes servían para tapar negativos. Como el negativo ya no se arrastra, primero saldan lo que el cierre ya había perdonado y solo el resto suma stock. Sin esta regla habría aparecido stock que no existe, como 728 papas. Los ajustes nuevos usan `Ajuste apertura` y suman completos.

## 8. Cómo se comprobó

- Con los movimientos y ventas reales del servidor, **solo con lecturas**. No se escribió nada en tu base de datos.
- Con la pantalla real en un navegador, sobre una **copia de prueba aparte**: 18 de 18 comprobaciones correctas. Incluyen editar stock, ver ventas, resolver un descuadre, contar y comparar con Transformar.
- Con pruebas automáticas: `npx jest tests/inventario`. Las nuevas están en `tests/inventario-libro.test.js` y `tests/inventario-hoja.test.js`.
