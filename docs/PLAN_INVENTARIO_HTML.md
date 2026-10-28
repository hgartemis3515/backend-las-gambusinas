# Plan: lógica de inventario.html

**Pantalla:** `backend-gambusinas/public/inventario.html`  
**App:** `inventarioApp()` (Alpine.js). El backend es la fuente de verdad del kardex. Cocina y mozos no pintan esta hoja.  
**Día:** calendario de la hoja y ciclo `04` en el kardex (04:00 a 04:00, Lima).

## Fórmulas de la hoja

```
ingreso total = saldo anterior + ingreso + corrección
saldo         = ingreso total − venta − transformación
saldo real    = conteo físico, si hubo; si no, el saldo
diferencia    = conteo − saldo
```

El saldo puede quedar negativo. Una venta con saldo 0 lo deja en −1 y puede seguir bajando. El envío de comandas no se frena por ese número.

## Secciones

| Pestaña | Qué hace |
|---|---|
| Inventario Tabla | Hoja del día. Grupos, números editables, venta de comandas. |
| Crudo y cocido | Los mismos productos, partidos en crudo y cocido. Escriben la misma fila de la tabla. |
| Transformar | Despiece. Al pulsar Pasar a la hoja escribe ingreso y transformación en la tabla. |
| Stock | Saldos actuales, sin un total único. |
| Relación de platos | Qué plato de la carta come qué rubro, y en qué cantidad. |

## Árbol de Pollo fresco

Pollo fresco es fila y agrupador, con sus propios números.

- Pechuga de Pollo agrupa Filete de Pollo, pollada, pachamanca, pecho a la leña y el resto de aderezos de pechuga.
- Filete de Pollo agrupa Milanesa de pollo y Filete de pollo.
- Pierna de Pollo agrupa Pierna a la leña, pollada y pachamanca. Esas dos últimas son la misma fila que bajo pechuga: un solo stock.

## Transformar

| Cuadro | Regla |
|---|---|
| Pollo fresco | 1 fresco → 2 piernas y 2 pechugas. Salen las dos del mismo fresco. |
| Filete | 1 pechuga enviada → 2 filetes. Pierna → filete solo si Configuración tiene factor mayor que 0. |
| Aderezo | 1 pierna o 1 pechuga suma 1 en ese rubro y resta 1 de su corte. |
| Libres | Si piernas libres o pechugas libres pasarían de 0, no se guarda y sale el aviso ámbar. |
| Panceta | Sin factor. Se anotan pancetas que salen y trozos obtenidos. |
| Carnero | 1 a 1 hacia Carnero pachamanca. |
| Arroz | El crudo se reparte en Arroz pollo, Arroz blanco y Arroz pato. No pasa a chaufa. |
| Pescado | Tollo → chicharrón. Perico → ceviche. |
| Evento | Pollo fresco, Carne Bistec, Arroz crudo y Papas se apartan a Pollo Evento, Carne Evento, Arroz Evento y Papa Evento. |

Pasar a la hoja copia esos números a Inventario Tabla y guarda movimientos (`Pasa a …` en el origen, `Sale de …` en el destino).

## Venta de comandas

`GET /api/inventario/kardex?carta=1` devuelve `filas` y `ventas`. La hoja suma las ventas del rango a la columna Venta. Las ventas de días anteriores bajan el saldo anterior, para que el faltante no se borre al cambiar de día.

El mapa está en `src/utils/inventarioSalidaVentas.js`. Una leña vendida sale de Pollo leña. Un filete con papas y arroz sale de filete, papas y arroz pollo. El chaufa no come arroz blanco. El envío de la comanda no consulta este saldo.

## Venta especial

Solo resta el stock apartado para evento. No toca la columna Venta del salón. Aplicar guarda un egreso con motivo `Venta especial`.

## Funciones de inventarioApp

### Arranque y API

| Función | Qué hace |
|---|---|
| `init` | Exige token y permiso `ver-inventario`. Carga ejemplo, platos, kardex y el socket. |
| `token` | Lee `adminToken` de localStorage o sessionStorage. |
| `api` | `fetch` a `/api` con el bearer. Lanza si la respuesta no es ok. |
| `initSocket` | En `/admin` refresca el kardex al llegar comanda o alerta de inventario. |
| `fechaHoy` / `ymdOperativo` / `diaOffset` / `sumarDias` | Fechas en America/Lima. Antes de las 04:00 el día operativo es el anterior. |
| `rangoPeriodo` / `setPeriodo` | Hoy, ayer, 7 días, todos o un rango. |
| `cargarKardex` | Pide kardex y movimientos del rango y los pinta. |
| `aplicarKardex` | Reparte filas por rubro, suma venta de comandas y actualiza el disponible de evento. |
| `paso` | `POST /inventario/movimientos`. Egreso manda cantidad positiva. |

### Hoja

| Función | Qué hace |
|---|---|
| `calcIngresoTotal` / `calcSaldo` / `calcSaldoReal` / `calcDiferencia` | Las fórmulas de arriba. Sin piso en 0. |
| `estadoFila` | Crítico, Bajo o Normal según saldo real y mínimo. |
| `formatNum` / `nudge` | Muestra el número. `nudge` suma o resta 1 sin bajar de 0 en los cuadros de transformar. |
| `stepField` / `updateIngresoDirecto` / `updateCorreccion` | Editan ingreso y corrección en la fila. |
| `filasPollo` / `filasDeGrupo` / `toggleNodo` / `toggleGroup` / `expandAllGroups` | Abren y cierran grupos. Pollo fresco usa el árbol. |
| `matchesSearch` / `groupHasMatch` / `getRowsByGroup` / `getFilteredRowsByGroup` / `getLooseRows` / `getFilteredLooseRows` | Filtro del buscador. |
| `getRow` / `getGroupName` | Fila por id. Si no existe, devuelve ceros. |
| `pulseRowTotal` | Destello corto al cambiar un total. |
| `imprimirHoja` | Imprime solo la tabla de la hoja. |
| `exportarInventarioCSV` | Arma el CSV del estado actual. El botón de la barra ya no lo llama. |
| `borrarHoy` | Pone en cero ingreso, corrección, venta, transformación y conteo. Deja el saldo anterior. |
| `restaurarEjemploDespiece` | Rearma el ejemplo de 10 pollos. Lo usa el arranque. No hay botón. |
| `cargarCasoCompraDirecta` | Pollo fresco 0, pierna 15, filete 8. |
| `openCountModal` / `guardarConteoCamara` / `limpiarConteoProducto` | Conteo físico. El saldo real pasa a ser ese conteo. |

### Crudo y cocido

| Función | Qué hace |
|---|---|
| `cuadrosCrudo` | Arma Pachamanca, Pollo, Pescado, Panceta y Arroz desde las mismas filas. |
| `ajustarCrudoCampo` / `fijarCrudoCampo` | Suben o bajan crudo o cocido de esa fila. |
| `adjustCrudoCocido` | Reparte el saldo entre crudo y cocido sin un segundo stock. |

### Transformar

| Función | Qué hace |
|---|---|
| `piernasObtenidas` / `pechugasObtenidas` | Frescos por el factor (2 y 2). |
| `filetesDePechuga` / `filetesDePierna` / `totalFiletesGenerados` | Filetes según lo enviado y el factor. |
| `piernasUsadas` / `pechugasUsadas` / `piernasLibres` / `pechugasLibres` | Lo repartido y lo que aún no se manda. |
| `setPollosFrescosConvertir` | Cambia frescos. No deja libres en negativo. |
| `updatePechugasAFilete` / `updatePiernasAFilete` / `updateAderezoCorte` | Reparten cortes. El aviso ámbar bloquea el exceso. |
| `arrozLibre` / `fijarArrozCrudo` / `fijarArrozDestino` | Reparte el arroz sin pasarse del crudo. |
| `pasarALaHoja` | Escribe la tabla y llama a `guardarDespieceEnServidor`. |
| `guardarDespieceEnServidor` | Movimientos del despiece. |
| `moverPescado` / `fijarPescado` | Cantidades del cuadro de pescado. |
| `apartarEvento` | Pasa materia a producto de evento. |
| `textoRend` | Muestra obtenido / ingresado. |

### Reporte del día y venta especial

| Función | Qué hace |
|---|---|
| `abrirReporteDia` / `irReporteDia` / `cargarReporteDia` / `vistaReporteHoja` | Ingreso y ventas de comandas de un día. |
| `abrirVenta` | Detalle de en qué comanda se vendió un rubro. |
| `abrirVentaEspecial` / `aplicarVentaEspecial` | Resta solo el stock de evento. |
| `fechaReporteDia` / `marcaReporteDia` / `tituloReporteDia` / `textoReporteDia` | Textos y fecha del cuadro. |

### Relación de platos

| Función | Qué hace |
|---|---|
| `cargarPlatos` | Lee `/api/platos` y arma la relación por nombre y por guarnición. |
| `getRelacionGroups` / `toggleRelGroup` / `isRelGroupOpen` | Grupos por rubro, sin sumar el padre. |
| `agregarLineaRelacion` | Alta manual. Ensalada no es rubro. Papa frita se guarda como Papas. |
| `openConversionesModal` / `guardarConfiguracion` | Factores, aderezos y relaciones. Se guardan en `localStorage`. |
| `agregarAderezoDraft` / `quitarAderezoDraft` | Alta y baja de aderezos en el modal. |

## Qué no hace esta pantalla

- No impide enviar una comanda.
- No escribe el campo `stock` de la carta.
- Cocina y mozos no leen estos cuadros.
