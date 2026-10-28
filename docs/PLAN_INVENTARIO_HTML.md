# Progreso de inventario.html

**Pantalla:** `backend-gambusinas/public/inventario.html`  
**App:** `inventarioApp()` en Alpine.js.  
**Verdad:** el kardex del backend. Esta hoja lo muestra y anota. Cocina y mozos no pintan estos cuadros y el envío de comandas no se frena por el saldo.

Planes relacionados: `PLAN_INVENTARIO_RELACION_PLATOS.md`, `PLAN_INVENTARIO_VENTA_ESPECIAL.md`, `PLAN_INVENTARIO_SALIDA.md`, `PLAN_INVENTARIO_EDITOR_MAPA.md`.

## Qué quedó armado

1. Hoja del día con cuatro bandas: Apertura, Entró hoy, Salió hoy y Queda.
2. Pollo fresco es fila y agrupador. Debajo van Pechuga de Pollo (con Filete de Pollo) y Pierna de Pollo.
3. Círculos de saldo en la tabla: verde si el saldo real pasa de 4 (o del mínimo), rojo si está en cero o por debajo.
4. Líneas entre filas de la misma familia. Una troncal une Pollo fresco con Pierna de Pollo sin mezclar esa rama con la de pechuga.
5. Cuadros de Ingreso, Corrección, Transformación y Conteo con fondo blanco y número negro, y − / +.
6. Crudo y cocido sobre las mismas filas de la hoja.
7. Transformar como mapa de izquierda a derecha: pollo, panceta, carnero, arroz, y el grupo de carnes, trucha y pescado entero que entra directo.
8. Cada número de Transformar se mueve con − y +.
9. Venta especial para lo apartado a evento.
10. Las ventas de comandas bajan el saldo. Si el saldo es 0 y se vende 1, queda en −1 y puede seguir bajando.

## Fórmulas

```
ingreso total = saldo anterior + ingreso + corrección
saldo         = ingreso total − venta − transformación
saldo real    = conteo, si hubo conteo; si no, el saldo
diferencia    = conteo − saldo
```

No hay piso en 0. El día del kardex es el ciclo `04` (04:00 a 04:00, Lima). Antes de las 04:00 el día operativo es el anterior.

## Inventario Tabla

Columnas, de izquierda a derecha:

| Banda | Columnas |
|---|---|
| 1. Apertura | Producto, Saldo ant. |
| 2. Entró hoy | Ingreso, Corrección, Ingreso total |
| 3. Salió hoy | Venta comandas, Transformación |
| 4. Queda | Saldo, Conteo, Queda (Saldo real), Diferencia, Estado / Mín. |

Cada agrupador de la hoja es un producto con ingreso, como Pollo fresco: Pato fresco, Panceta, Carnero y Arroz crudo abren a sus cortes. Carnes y Trucha no tienen un solo origen, así que cada corte es su propia fila con ingreso. No hay fila padre vacía ni el cuadro «Caso aparte». Crudo y cocido cambia el ingreso de esa misma fila.

Árbol:

- Pollo fresco
  - Pechuga de Pollo
    - Filete de Pollo
      - Milanesa de pollo
      - Filete de pollo
    - Pollada, Pollo pachamanca, Pecho a la leña y el resto de aderezos de pieza
  - Pierna de Pollo
    - Pierna a la leña
    - Pollada y Pollo pachamanca (la misma fila que bajo pechuga: un solo stock)

El buscador, Abrir todos y Plegar grupos están en la hoja. El período (Hoy, Ayer, 7 días, Todos, Personalizado) queda a la izquierda del título. Imprimir saca solo la tabla. Reporte del día abre ingreso y ventas de un día.

## Crudo y cocido

Cuadros Pachamanca, Pollo, Pescado, Panceta y Arroz. Columnas: Saldo anterior, Cocido, Crudo, Total, Final. El − y el + del número son cortos. Cambiar crudo o cocido cambia esa misma fila de Inventario Tabla. No hay un segundo saldo.

## Transformar

Mapa de izquierda a derecha: origen, cortes y cuadros de platos. Cada flecha sale del centro del cuadro padre y llega al centro de su hijo, aunque el cuadro crezca o se oculte una rama. Los mapas que vienen del Editor (Pato, Pota y los nuevos) usan el mismo molde, y el número de cada mapa sigue su orden en la sección. Pasar a la hoja escribe ingreso y transformación en Inventario Tabla y guarda movimientos (`Pasa a …` en el origen, `Sale de …` en el destino). Si un reparto dejaría libres en negativo, no se guarda y sale el aviso ámbar.

| Mapa | Regla |
|---|---|
| 1. Pollo fresco | 1 fresco = 2 pechugas y 2 piernas a la vez. 1 pechuga enviada a filete = 1 filete. Pierna a filete solo si Configuración tiene factor mayor que 0. |
| Cuadro de filete | Reparte los filetes generados entre Filete de pollo y Milanesa. No se puede asignar más de los generados. |
| Cuadros de pechuga y de pierna | Los mismos platos de pieza, sin filetes. 1 pieza mandada suma 1 en ese aderezo y resta 1 de su corte. |
| 2. Pato fresco | 1 fresco = 2 pechugas y 2 piernas. Pechuga abarca el arroz con pato de pecho; pierna, el de pierna. La venta resta el corte. |
| 3. Pota | Sin despiece. Abarca Ceviche de chicharrón de pota y Chicharrón de pota. El ingreso se anota directo. |
| 4. Panceta y carnero | Panceta: se anotan pancetas que salen y trozos, sin factor. Carnero: 1 a 1 hacia Carnero pachamanca. |
| 5. Arroz | El crudo se reparte en Arroz pollo, Arroz blanco y Arroz pato. Arroz blanco no pasa a chaufa. |
| 6. Carnes, trucha y pescado entero | No hay despiece. El ingreso se anota directo en la hoja, con − y +. |
| Pescado de transformación | Tollo hacia chicharrón. Perico hacia ceviche. |
| Apartar para evento | Pollo fresco, Carne Bistec, Arroz crudo y Papas pasan a Pollo Evento, Carne Evento, Arroz Evento y Papa Evento. |

El editor de estos mapas (un botón para crear, editar o eliminar), el despiece de Pato fresco, los platos extra del filete y el mapa de Pota están en la hoja. El detalle está en `PLAN_INVENTARIO_EDITOR_MAPA.md`.

## Ventas de comandas

`GET /api/inventario/kardex?carta=1` devuelve `filas` y `ventas`. `aplicarKardex` suma esas ventas a la columna Venta. Las ventas anteriores al rango bajan el saldo anterior (`aplicarSaldoPrevioDeVentas` en el repositorio), así el faltante no desaparece al día siguiente.

El mapa de nombres está en `src/utils/inventarioSalidaVentas.js`. Una leña sale de Pollo leña. Un filete con papas y arroz sale de filete, papas y arroz pollo. El chaufa de pollo no come arroz blanco. El envío de la comanda no mira este saldo.

## Venta especial

Solo resta lo apartado para evento. No toca la columna Venta del salón. Aplicar guarda un egreso con motivo `Venta especial` en `evento-pollo`, `evento-carne`, `evento-arroz` o `evento-papa`.

## Funciones

### Arranque

| Función | Qué hace |
|---|---|
| `init` | Pide token y permiso `ver-inventario`. Carga el ejemplo, los platos, el kardex y el socket. |
| `token` / `api` | Bearer y `fetch` a `/api`. |
| `initSocket` | En `/admin`, vuelve a cargar el kardex si llega una comanda o una alerta. |
| `fechaHoy` / `ymdOperativo` / `diaOffset` / `sumarDias` | Fechas en America/Lima. |
| `rangoPeriodo` / `setPeriodo` | Hoy, ayer, 7 días, todos o un rango. |
| `cargarKardex` / `aplicarKardex` | Traen filas, movimientos y ventas, y los pintan. |
| `paso` | `POST /inventario/movimientos`. En egreso la cantidad va positiva. |

### Hoja

| Función | Qué hace |
|---|---|
| `calcIngresoTotal` / `calcSaldo` / `calcSaldoReal` / `calcDiferencia` | Las fórmulas. El saldo no se corta en 0. |
| `esSaldoSuficiente` | Verde si el saldo real pasa el umbral; si no, rojo. |
| `estadoFila` | Crítico, Bajo o Normal. |
| `formatNum` / `nudge` | Muestra el número. `nudge` suma o resta 1 sin bajar de 0 en los cuadros. |
| `stepField` / `updateIngresoDirecto` / `updateCorreccion` | Editan ingreso y corrección. |
| `filasPollo` / `filasDeGrupo` | Arman las filas visibles y las líneas entre círculos. |
| `toggleGroup` / `toggleNodo` / `expandAllGroups` | Abren y cierran grupos. |
| `matchesSearch` y los `get*Rows*` / `getRow` / `getGroupName` | Buscador y acceso a filas. |
| `imprimirHoja` | Imprime solo la tabla. |
| `borrarHoy` | Deja en cero el movimiento del día. Conserva el saldo anterior. |
| `restaurarEjemploDespiece` | Rearma el ejemplo de 10 pollos. Lo usa el arranque. |
| `cargarCasoCompraDirecta` | Fresco 0, pierna 15, filete 8. |
| `openCountModal` / `guardarConteoCamara` / `limpiarConteoProducto` | Conteo físico. |
| `exportarInventarioCSV` | Arma el CSV. La barra ya no tiene ese botón. |

### Crudo, transformar y evento

| Función | Qué hace |
|---|---|
| `cuadrosCrudo` / `ajustarCrudoCampo` / `fijarCrudoCampo` / `adjustCrudoCocido` | Crudo y cocido de la misma fila. |
| `piernasObtenidas` / `pechugasObtenidas` | Frescos × 2 y frescos × 2. |
| `filetesDePechuga` / `filetesDePierna` / `totalFiletesGenerados` | Filetes según lo enviado y el factor. |
| `aderezosSinFiletes` | Platos de pieza. Deja fuera filete, filete de pollo y milanesa. |
| `pechugasEnPlatosGrupo` / `piernasEnPlatosGrupo` | Piezas ya mandadas a esos platos. |
| `filetesUsadosEnPlatos` / `filetesLibresEnPieza` / `updatePlatoFilete` | Reparte filetes entre Filete de pollo y Milanesa. |
| `piernasUsadas` / `pechugasUsadas` / `piernasLibres` / `pechugasLibres` | Lo repartido y lo que aún no se manda. |
| `setPollosFrescosConvertir` / `updatePechugasAFilete` / `updatePiernasAFilete` / `updateAderezoCorte` | Cambian el despiece. El exceso no se guarda. |
| `arrozLibre` / `fijarArrozCrudo` / `fijarArrozDestino` | Reparte el arroz sin pasarse del crudo. |
| `pasarALaHoja` / `guardarDespieceEnServidor` | Escriben la tabla y los movimientos. |
| `moverPescado` / `fijarPescado` | Cuadro de pescado. |
| `apartarEvento` / `abrirVentaEspecial` / `aplicarVentaEspecial` | Apartan materia y restan la venta especial. |
| `textoRend` / `anotarHistorial` / `historialCorto` | Rendimiento y el registro corto de la pantalla. |

### Reporte y relación de platos

| Función | Qué hace |
|---|---|
| `abrirReporteDia` / `irReporteDia` / `cargarReporteDia` / `vistaReporteHoja` | Ingreso y ventas de un día. |
| `abrirVenta` | En qué comanda se vendió un rubro. |
| `fechaReporteDia` / `marcaReporteDia` / `tituloReporteDia` / `textoReporteDia` | Fecha y textos del cuadro. |
| `cargarPlatos` | Lee `/api/platos` y arma la relación, incluida la guarnición. |
| `getRelacionGroups` / `toggleRelGroup` / `isRelGroupOpen` | Grupos por rubro. El padre no suma. |
| `agregarLineaRelacion` | Alta manual. Ensalada no es rubro. Papa frita se guarda como Papas. |
| `openConversionesModal` / `guardarConfiguracion` | Factores, aderezos y relaciones, en `localStorage`. |
| `agregarAderezoDraft` / `quitarAderezoDraft` | Alta y baja de aderezos en el modal. |

## Qué no hace

- No impide enviar una comanda.
- No escribe el `stock` de la carta.
- Cocina y mozos no leen estos cuadros.
