# Plan: inventario.html, qué le falta

Fecha: 24 de octubre de 2026.  
Estado: solo plan. No implementar hasta que se pida.

La pantalla ya es una hoja de producción. No hace falta convertirla en otro sistema. Lo que falta es que el día, la anotación y el reporte cuenten la misma historia.

## Veredicto

Está bien encaminada. Día (Hoja), Crudo y cocido, Transformar, Stock y Conteo cubren el trabajo. La fórmula de ingreso, el conteo, el rendimiento y el deshacer ya están.

No está perfecta. El hueco grande es el **reporte del día**: lo que se anotó ayer en Transformar no aparece solo al abrir el botón. Hay dos relojes (cierra 23:59 y cierra 04:00) y el reporte a veces lee un registro viejo en vez de los movimientos de ese día.

## Qué ya no hay que rehacer

- La hoja del día en cuatro bandas: apertura, entró, salió, queda.
- Crudo y cocido con saldo anterior, cocido, crudo, total y final.
- Transformar con origen, destino y aviso si lo obtenido pasa lo ingresado.
- Stock con 0 crítico, 1 a 10 bajo, 11 o más normal.
- Conteo para la cámara.
- Un reporte por día en `inventario_reportes`.

## Qué corregir primero

1. **Un solo día en toda la página.** Período, fecha y reporte tienen que señalar el mismo día. Si el día de trabajo es ayer, el botón Reporte del día abre ayer, sin un segundo clic.
2. **El reporte lee los movimientos de ese día.** El registro guardado es la copia. Si la copia está vacía y sí hubo «Pasa a», se muestra el movimiento. Ayer (23 de octubre) tiene que verse: pollo a filete, sándwich y evento; tollo a chicharrón; perico a ceviche.
3. **El error del reporte se ve dentro del cuadro**, no escondido detrás. Si la carga falla, el cuadro lo dice.
4. **Al cerrar a las 04:00 la copia queda fija** y ya trae las transformaciones. Mientras el día sigue abierto, la copia se actualiza.

## Cómo se vería mejor

Misma página, menos dudas. Arriba, una sola barra de día para las cinco secciones:

```
Inventario
[ Ayer ] [ Hoy ] [ fecha ]          Día de trabajo: 23 oct

[ Día ] [ Crudo y cocido ] [ Transformar ] [ Stock ] [ Conteo ]  [ Reporte de este día ]
```

El botón abre el día que ya está elegido. Adentro, tres bloques cortos:

1. Entró y salió: cocido y crudo.
2. Transformaciones: origen, destino, cantidad, total.
3. Si el día ya cerró: «Guardado a las 04:00». Si sigue abierto: «Se sigue actualizando».

En Transformar, debajo de pollo y pescado, una tira del mismo día (no otro calendario):

```
Hoy se transformó
Pollo → Filete          20
Pollo → Sandwich         5
Pollo → Evento          50
```

Si el día no tiene nada, el texto es «Este día todavía no tiene transformaciones». Al pasar al día siguiente, las cajas vuelven a 0 y el reporte anterior queda guardado.

## Qué se puede agregar después, si hace falta

- Lista de reportes ya cerrados, para abrir cualquier fecha y no solo ayer, hoy y mañana.
- Imprimir o bajar el reporte del día en una hoja.
- En cada línea del reporte, la hora y quién anotó.
- Guardar la transformación como traslado (origen y destino), y dejar «Pasa a» solo como texto en pantalla.

## Qué no agregar

Recetas, proveedores, costos, facturas, varios almacenes, ni esta pantalla dentro de mozos o cocina. Cocina sigue solo con la alerta de mínimo.

## Orden si se llega a hacer

1. Un solo día compartido por período, fecha y reporte.
2. El botón de Transformar abre ese día y muestra sus transformaciones.
3. El registro del día se actualiza en curso y se fija a las 04:00.
4. Recién ahí: archivo de días cerrados e impresión.
