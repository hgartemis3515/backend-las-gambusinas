# Análisis de la lógica de Inventario

Fuentes: `docs/GUIA_INVENTARIO.md` y `public/inventario.html`.  
Fecha: 9 de noviembre de 2026.

La guía describe la intención. Este documento dice qué hace el código de verdad, qué errores de lógica impiden transformar o esconden la resta, y qué falta hacer.

## Cómo está armada la lógica

Hay un solo saldo por producto. Vive en la fila de Inventario Tabla.

```
Ingreso total = Saldo anterior + Ingreso + Corrección
Saldo         = Ingreso total − Venta + Cubierta − Transformación
Saldo real    = Conteo de cámara, si alguien contó; si no, el Saldo
```

Transformar no tiene almacén propio. El botón **+** solo debe subir la transformación del origen y el ingreso del destino. El stock de hoja del origen es `Saldo` crudo (`calcSaldoTipo`), no el número grande de la columna Queda.

Ese número grande (`saldoRealColumna`) suma el saldo del producto **más el saldo de los platos que cuelgan de él**. Por eso pecho leña, pachamanca, pollada o arroz con pollo pueden hacer que el padre “siga en 13” aunque la pieza ya se movió.

El mapa de Transformar, además, guarda contadores de sesión (`despiece`: frescos, pechos a filete, octavos, aderezos). Esos contadores se ponen en cero al abrir la página. El kardex no los reconstruye. La hoja sí recuerda los movimientos ya guardados.

## Dónde se traba la transformación

### 1. El botón mira un saldo y la pantalla enseña otro

| Lo que ve la persona | Función | Qué incluye |
| --- | --- | --- |
| Columna Queda y pestaña Stock | `saldoRealColumna` | Saldo del producto + platos hijos. Si hay conteo, el conteo. |
| Stock de hoja en la tarjeta de pecho o pierna | `stockHojaCrudo` | Solo el saldo crudo del producto, sin hijos y sin el conteo. |
| Tope de filete, octavos y aderezos | ese mismo saldo crudo | Si da 0, el **+** no avanza. |

Si Queda o Stock dicen 13 porque el 13 está en los platos hijos, o porque hay un conteo de cámara, el botón sigue viendo 0 y no transforma.

Al transformar hacia un hijo (pachamanca, pecho leña, pollada, arroz con pollo), la columna Queda del padre no baja: lo que sale del padre vuelve a sumarse en el hijo. La persona lee “no restó el stock”.

**Falta:** un solo número, el saldo crudo del producto, en la tarjeta, en Queda y en el tope del botón. Los platos hijos se listan aparte, no se suman al stock que se puede transformar. El conteo de cámara no debe tapar ese saldo mientras se transforma.

### 2. El primer clic no escribe la fila

`aplicarDeltaPadre` guarda el valor y **sale sin tocar la fila** la primera vez que ve una clave. Si `marcarPadresPintados` no corrió antes, el primer pecho a filete, la primera pierna a pachamanca o el primer octavo no restan nada. El segundo clic sí.

**Falta:** aplicar el delta también en esa primera vez, o pintar las claves antes de cualquier volcado.

### 3. Filete comprado no se puede repartir

Los platos de filete solo aceptan filetes generados en esta sesión (`pechugasAFilete` × factor). Si el filete entró por compra y el stock de hoja del filete es 13, el grupo de platos dice que no hay filetes generados y no deja armar milanesa, chaufa ni el resto.

**Falta:** el tope de esos platos debe ser el stock de hoja del filete, no solo los filetes nacidos hoy del pecho.

### 4. Octavo de un día anterior no alimenta los platos

Arroz con pollo, pollo a la olla y caldo solo salen de los octavos anotados ahora (`despiece.octavos`). Si el octavo ya está en la hoja y el contador de sesión está en 0, el **+** del plato se niega: “no hay octavos libres”.

**Falta:** el mismo criterio que el pecho. Si hay stock de hoja de octavo, se puede convertir en esos tres platos, y cada porción resta un octavo de la hoja.

### 5. Arroz, panceta, pescado, pota y carnero no usan el stock de hoja

| Cuadro | Qué limita el botón | Qué ignora |
| --- | --- | --- |
| Arroz | El número escrito en “arroz crudo” del mapa | El stock de hoja del arroz |
| Panceta | Nada al sacar pancetas. Las tiras se limitan a `pancetas × 6` | El stock de hoja de panceta o de tira |
| Pescado y pota | Nada | El stock de hoja del entero |
| Carnero | Nada | El stock de hoja del carnero |
| Mapas sueltos (pato y los nuevos) | Nada | El stock de hoja del origen |

Con arroz en hoja y el casillero del mapa en 0, no se puede repartir a blanco, verde, pato, chaufa ni mariscos. En panceta, pescado, pota y carnero el fallo es el contrario: se puede anotar más de lo que hay, y el saldo queda negativo o el ingreso viejo se pisa.

En los mapas sueltos, `volcarMapasDinamicosEnFilas` **reemplaza** el ingreso del corte por lo generado en el mapa. Una compra que ya estaba en la hoja desaparece.

**Falta:** el origen no puede pasar de su stock de hoja. El destino suma el resultado; no borra el ingreso que ya tenía.

### 6. El + de un plato falla en silencio

En pecho leña, sandwich, pachamanca, pollada y el resto, `moverIngresoPlato` hace `return` sin aviso si:

- el plato no tiene fila,
- el id lleva la palabra `mix` (`platoConTransformacion` lo rechaza),
- el saldo crudo del padre es 0 o menos.

El botón parece muerto. Mix leña no entra por este camino aunque esté dibujado en el árbol.

**Falta:** el mismo aviso ámbar que ya tiene el filete, y dejar pasar el mix con la misma regla de 1 pieza.

### 7. Pierna a filete se apaga sin decir nada

Si en Configuración el factor pierna → filete está vacío, el control pone el valor en 0 y termina. No hay aviso. La pierna con stock de hoja no puede volverse filete, que es lo pedido, pero la pantalla no lo explica.

**Falta:** mostrar el factor y, si está vacío, el texto “Pierna a filete está apagada en Configuración”.

### 8. La resta se guarda y al recargar se esconde en dos columnas

El kardex mete el pase negativo dentro de Ingresos. Al pintar la hoja, el panel **suma otra vez** ese pase al ingreso y lo anota también en Transformación. El saldo final sí baja, pero Ingreso e Ingreso total suben en la misma cantidad que Transformación. La flecha de ingreso y la de transformación se anulan a la vista, y parece que el stock de hoja no se movió.

Los contadores del mapa no se guardan. Al refrescar, pechos a filete, pachamanca y octavos vuelven a 0 aunque la hoja ya tenga el movimiento.

**Falta:** el pase solo debe vivir en Transformación, no sumarse de nuevo al Ingreso. Al abrir Transformar, los contadores del día deben salir de esos movimientos, no de cero.

### 9. La fórmula de la tarjeta suma de más

En pecho y pierna, el cuadro `total ↓ usado = libre` arma el total como stock de hoja **más** todo lo usado en la sesión. El stock de hoja ya restó la transformación. Si los dos números no son el mismo movimiento, el total queda inflado y el “↓” no coincide con lo que bajó la hoja.

**Falta:** mostrar tres cifras de la misma cuenta: stock antes, lo que se resta ahora, stock después.

## Qué dice la guía y el código no cumple

La guía dice que todos los cuadros de Transformar topan con el stock de hoja. En el código eso solo está en pecho y pierna (filete, aderezos y octavos de esos dos). Arroz, panceta, pescado, pota, carnero y los mapas sueltos no.

La guía dice que Pasar a la hoja escribe salida en Transformación e entrada en Ingreso. Eso ocurre, y además el ingreso del origen se infla con el mismo pase (error 8).

## Orden de lo que falta hacer

1. Unificar el número. El botón, la tarjeta y la columna Queda del producto suelto usan el saldo crudo, sin hijos y sin que el conteo lo tape.
2. Hacer que el primer clic sí reste (`aplicarDeltaPadre`).
3. Dejar de sumar el pase otra vez al Ingreso al cargar el kardex.
4. Filete, octavo y arroz: poder transformar el stock de hoja aunque el contador de sesión esté en 0.
5. Panceta, pescado, pota, carnero y mapas sueltos: no pasar del stock de hoja y no borrar el ingreso ya cargado.
6. Aviso ámbar en todo **+** que hoy no hace nada (mix, fila inexistente, pierna a filete apagada).
7. Al abrir el día, reconstruir los contadores de Transformar desde los movimientos, para que el mapa y la hoja cuenten la misma historia.

Sin el punto 1 y el 3, pecho con “13” en Queda o en Stock puede seguir sin pasar a filete, y la pierna puede transformarse a pachamanca sin que esa columna baje.
