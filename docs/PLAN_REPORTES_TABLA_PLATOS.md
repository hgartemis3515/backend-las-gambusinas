# PLAN — Tabla de plato en reportes.html

> Creado: 04/10/2026 · Estado: implementado

## Resumen

En `public/reportes.html`, pestaña **Platos**, a la izquierda de **Actualizar** hay un botón **Tabla de plato**. Abre un modal con el mismo desglose que ya muestra la página (`📋 Desglose Detallado de Platos`) en un panel ancho, con la tabla completa y un botón **Imprimir**.

No hay endpoint nuevo. Los datos siguen siendo `tablaData.platos` del período ya cargado (Hoy, DIA, NOCHE, fechas manuales, etc.).

## Dónde está

| Pieza | Archivo |
|---|---|
| Botón junto a Actualizar (solo si `repTab === 'Platos'`) | `public/reportes.html` header |
| Modal `#modal-tabla-platos` | mismo archivo, antes del modal de cocinero |
| Estado `modalTablaPlatos` e `imprimirTablaPlatos()` | `reportesApp()` |
| Estilos de impresión | `<style>` del mismo HTML, clase `body.imprimiendo-tabla-platos` |
| Este plan | `docs/PLAN_REPORTES_TABLA_PLATOS.md` |

## Modal

- Ocupa casi toda la ventana (`min(1280px, 96vw)` × `min(900px, 92vh)`).
- Título: **📋 Desglose Detallado de Platos**.
- Subtítulo: período (`getCurrentRangeText`), fechas y cantidad de platos.
- Columnas: #, Plato, Categoría, Cant., P. Unit. (IGV incl.), Total (IGV incl.), % Total, Complementos.
- Los complementos se muestran completos (en la tabla de la página siguen recortados a 3).
- El cuerpo hace scroll; la cabecera de la tabla queda fija.
- El pie suma cantidad y monto, igual que la tabla de la pestaña.
- Cierra con ✕, clic fuera o Escape (tiene prioridad sobre los modales de cocinero y comanda).

## Impresión

**Imprimir** agrega `imprimiendo-tabla-platos` al `body` y llama a `window.print()`. Al terminar (`afterprint`) quita la clase.

En ese modo solo se imprime el modal:

- Hoja horizontal (`@page size: landscape`).
- Fondo blanco y texto negro.
- Se ocultan Actualizar, Imprimir y cerrar (clase `no-print`).
- Aparece un encabezado de impresión con el título y el período.
- La tabla no se recorta: `thead` se repite por página y las filas no se parten.

## Qué no cambia

- La tabla embebida de la pestaña Platos (altura máxima 400px) sigue igual.
- Gráficos, KPIs y el bloque Mesa vs Para llevar no entran en la impresión.
- Excel del header no se modificó.
