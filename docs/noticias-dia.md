# Noticias del día

`noticias.html` es el panel del dashboard donde se redacta lo que ven la app de cocina y la app de mozos durante el día operativo. Las dos apps no publican: leen el mismo API y se enteran por socket cuando algo cambia.

El día operativo es el de Lima, de 04:00 a 04:00. Una noticia creada a la 01:30 queda en la fecha del día anterior.

## Qué hace cada parte

| Pieza | Rol |
| --- | --- |
| `public/noticias.html` | Redactar, publicar, editar y retirar. Muestra el TOP de la semana al lado del editor. |
| API `/api/noticias*` | Guarda el HTML, sirve el día vigente y calcula el TOP. |
| App cocina (`appcocina`) | Modal «Noticias de hoy» al entrar y cuando llega una noticia nueva. |
| App mozos (`Las-Gambusinas`) | Al entrar: primero el TOP de la semana, después las noticias. También se reabren a mano desde Más, y el menú de platos tiene un filtro TOP. |

Cocina no muestra el ranking. El TOP es para mozos (aviso al entrar y filtro de carta) y para quien publica (columna derecha del panel).

## Implementación

El panel escribe con Quill y recorta imágenes con Cropper. El contrato del API, el día operativo, el socket y el «visto» en el dispositivo no cambiaron.

El panel no tiene bundler. Las librerías del navegador viven en `public/assets/vendor/`, copiadas del `node_modules` del backend.

| Uso | Librería | Dónde está |
| --- | --- | --- |
| Editor | Quill 2.0.3, tema snow | `quill`, vendor `public/assets/vendor/quill/` |
| Recorte de imagen | Cropper.js 2.3.0 | `cropperjs`, vendor `public/assets/vendor/cropper/cropper.min.js` |
| Lista del panel y modal de cocina | GSAP 3.14, plugin Flip | Ya estaba. Panel: `public/assets/vendor/gsap/`. Cocina: `registerGsapPlugins.js` y `useGSAP` |
| Modal de recorte | Blendy | Ya estaba en `public/assets/vendor/blendy.min.js` |
| Hojas de mozos | Moti + Reanimated | Ya estaban en `Las-Gambusinas` |

No se suma otra librería de animación.

### Editor

`noticias.html` carga `quill.js` y `quill.snow.css`. Alpine crea un Quill sobre `#editor` con la barra propia `#toolbar`.

Barra, solo lo que el sanitizador puede guardar:

- Jerarquía: Texto, Título (h2), Subtítulo (h3)
- Tamaño: Chico 14, Normal, Grande 18, Muy grande 24, Enorme 32 px
- Negrita, cursiva, subrayado
- Color: paleta corta que se lee en fondo oscuro (dorado, rojo, ámbar, verde, azul, lila, blanco, gris)
- Alineación: izquierda, centro, derecha. Sin justificar.
- Lista con viñetas y numerada
- Imagen y quitar formato

Sin enlaces ni tachado: el sanitizador los borra.

Tamaño y alineación se registran como atributos de estilo (`attributors/style/size` y `attributors/style/align`), así Quill ya escribe `style="font-size: 24px"` y `style="text-align: center"` en vez de clases. `htmlParaGuardar` toma `getSemanticHTML()`, traduce cualquier clase `ql-align-*` que venga de contenido viejo, borra el resto de clases y cambia `&nbsp;` por espacio. El servidor sigue limpiando. Verificado: el HTML que sale del editor pasa por `sanitizarHtmlNoticia` sin perder título, tamaño, color, alineación, listas ni imagen.

Editar una fila carga el `cuerpoHtml` con `clipboard.dangerouslyPasteHTML`. Publicar y Guardar son el mismo botón; cambia de texto según haya `editandoId`. `Ctrl + Enter` publica desde el editor.

Ayudas al escribir:

- Contador `n/120` en el título y `n/8 imágenes`, `n caracteres` bajo el editor.
- El botón Publicar queda deshabilitado hasta que hay título y texto o imagen. Si se intenta igual, el estado dice qué falta y enfoca el campo.
- Borrador local (`noticias_borrador_v1`): se guarda 600 ms después de escribir. Al volver a la página aparece el chip «Borrador recuperado · descartar». Publicar o Limpiar lo borran. Mientras se edita una noticia existente no se guarda borrador.
- Vista previa «Así lo ve el mozo»: un teléfono dibujado a la derecha que repinta el título y el cuerpo en cada cambio, con la misma hoja oscura y botón Listo que ven las apps.
- Retirar pide confirmación en la misma fila («¿Retirar? Sí / No»), sin `confirm()` del navegador.
- Cada fila del archivo muestra la miniatura de la primera imagen, chips `vigente` / `retirada` / `hoy`, autor y cuántas imágenes tiene.

### Imágenes

El botón de imagen de Quill no inserta base64. Abre el selector (JPEG, PNG o WebP), muestra el archivo en el modal «Recortar imagen» y Cropper 2 recorta.

Modal:

- Arrastrar mueve el encuadre, la rueda acerca. Botones ⟲ ⟳ 90°, ＋ y －.
- Proporción: Libre, 16:9, 4:3 o 1:1. Al cambiar se recentra la selección.
- «Usar imagen» exporta con `getCropperSelection().$toCanvas({ width })` limitado a 1200 px (el alto sigue la proporción), lo pasa a JPEG al 0.86 y, si pesa más de 2 MB, reintenta al 0.70. Si aún pesa de más, muestra el error y no sube nada.
- Sube con `POST /api/noticias/imagen` (campo `imagen`) e inserta la `url` que responde el API con `insertEmbed`.
- Si `window.Cropper` no cargó, sube el archivo tal cual, como antes.

Máximo 8 imágenes: el botón avisa y no abre el selector cuando ya hay 8. El servidor sigue rechazando otro `src` que no sea `/uploads/noticias/...`.

### Animación

Si el sistema pide menos movimiento (`prefers-reduced-motion` en web, «Reducir movimiento» en el teléfono), no hay tween: todo aparece y cambia de golpe.

Panel (`gsap.matchMedia` decide):

- Entrada: las tarjetas suben con `stagger` y las filas del TOP entran desde la izquierda. El teléfono de vista previa flota despacio (`yoyo` infinito).
- Publicar o retirar: `Flip.getState` sobre las filas antes de recargar, `Flip.from` después. La fila nueva entra con un destello dorado que se apaga.
- Al publicar, el teléfono da un pulso corto y aparece un toast dorado abajo (`back.out`). Los errores salen en rojo.
- El modal de recorte sale del botón Imagen con Blendy (`BlendyWrapper.morph` / `unmorph`, `data-blendy-to="btn-imagen"`). Al cerrar, `restoreSource` deja el botón como estaba. Si Blendy no está, el wrapper cae a CSS.
- TOP: el puesto 1 lleva dorado con brillo, 2 plata, 3 bronce.

Cocina, `NoticiaDelDia` (`useGSAP` con `scope`, `revertOnUpdate`):

- Timeline: velo a opacidad 1, hoja desde `y: 32`, `scale: 0.96`, noticias con `stagger: 0.07`, botón Listo al final.
- «Listo» marca como vistas y hace `reverse()` de la misma timeline a 1.7×; al terminar desmonta. Tocar el fondo también cierra.
- Chip con cuántas son nuevas y etiqueta «Nuevo» en cada noticia que ese usuario no había cerrado. Fecha legible («martes, 14 de octubre»). Firma del autor al pie.
- Sigue oculto en monitor, kiosco y `modo=completo-fijo`.

Mozos, `NoticiasIngreso` (Moti + `AnimatePresence`):

- El `Modal` ya no usa `animationType`: la hoja entra con un spring (`translateY 48 → 0`, `scale 0.96 → 1`) y el velo hace fade. Al cerrar, sale hacia abajo y el `Modal` se desmonta cuando termina (`onExitComplete`).
- De TOP a Noticias con `exitBeforeEnter`: una hoja sale y la otra entra.
- TOP: cada fila entra desde la izquierda con 45 ms entre una y otra. Puesto 1 dorado con corona, 2 plata y 3 bronce con medalla; la fila 1 lleva fondo dorado tenue.
- La noticia sigue en un WebView. Aparece con fade cuando termina de cargar, y dentro del HTML cada tarjeta entra con una animación CSS escalonada (respeta `prefers-reduced-motion`). Las no leídas llevan «Nuevo» y la firma del autor.
- Tocar fuera de la hoja y el botón Listo cierran. Listo da un `Haptics.selectionAsync()`.
- Desde Más, «Noticias» abre la misma hoja con TOP y lo de hoy, sin marcar nada como visto.

Socket: `noticia-publicada` ahora trae `{ fechaOperativa, accion, noticiaId, titulo }` con `accion` en `creada`, `editada` o `retirada`. Las apps siguen recargando `/hoy` al recibirlo; el payload extra queda para avisos futuros.

## Panel `noticias.html`

Entra quien tiene rol `admin`, `supervisor` o `cajero`. Si no hay token va a `login.html`. Otro rol, aunque el menú le haya mostrado el enlace, vuelve a `index.html`.

El menú lateral (`shared.js`, clave `noticias`) sí deja ver el enlace a quien tenga el permiso `publicar-noticias`. La página en sí no: solo los tres roles de arriba.

Pantalla:

- Cabecera con la fecha operativa y un chip con cuántas noticias hay vigentes hoy.
- Título (máximo 120 caracteres) y editor Quill con la barra descrita arriba.
- Publicar crea. Si se abrió una fila con Editar, el mismo botón dice «Guardar cambios» (PUT) y «Cancelar edición» vuelve al modo nuevo.
- Columna derecha: teléfono de vista previa en vivo y TOP de la semana con el rango de fechas.
- Publicaciones: últimas 40, vigentes o retiradas, con miniatura, chips y confirmación en línea para retirar.

Las reglas de guardado (título obligatorio, texto o imagen, HTML sanitizado, máximo 8 imágenes) son las mismas de siempre.

## API

Montada en `index.js` con `app.use('/api', noticiasRoutes)`. Los archivos de imagen se sirven en `/uploads/noticias`.

| Método | Ruta | Quién | Efecto |
| --- | --- | --- | --- |
| GET | `/api/noticias/hoy` | Cualquier JWT válido (cocina o mozo) | Noticias vigentes de la fecha operativa, máximo 20, más nuevas primero. |
| GET | `/api/noticias/top-semana` | Cualquier JWT válido | Top 10 de platos de los últimos 7 días operativos. |
| GET | `/api/noticias` | Admin del dashboard y `puedePublicar` | Archivo: últimas 40, vigentes y retiradas. |
| POST | `/api/noticias` | Igual | Crea con la fecha operativa de ahora. |
| PUT | `/api/noticias/:id` | Igual | Cambia título, HTML e imágenes. No mueve la fecha. |
| PATCH | `/api/noticias/:id/retirar` | Igual | `vigente: false`. El registro sigue en el archivo. |
| POST | `/api/noticias/imagen` | Igual | JPEG, PNG o WebP, máximo 2 MB. Responde `{ url }`. |

`puedePublicar`: rol `admin`, `supervisor` o `cajero`, o el permiso `publicar-noticias`. Ese permiso viene de serie en supervisor y cajero (`roles.model.js` y `mozos.model.js`). Admin lo tiene por ser admin.

Lectura (`/hoy` y `/top-semana`) no pide ese permiso. Basta un JWT del mismo secreto. Cocina y mozos no pueden publicar.

Crear, editar y retirar emiten `noticia-publicada` con `{ fechaOperativa, accion, noticiaId, titulo }` a los namespaces `/mozos` y `/cocina`. Si el socket no está, la publicación igual se guarda.

## Qué se guarda

Colección `noticias`:

- `fechaOperativa` (`YYYY-MM-DD`)
- `titulo`
- `cuerpoHtml` ya sanitizado
- `imagenes`: rutas `/uploads/noticias/...` sacadas del HTML, máximo 8
- `autor`: id, nombre y rol de quien publicó
- `vigente`
- `createdAt` / `updatedAt`

Hace falta título, y texto o al menos una imagen. El HTML se corta a 40 000 caracteres. Se quitan script, style, iframe, eventos `on*` y `javascript:`. Solo quedan `p`, `br`, `div`, `span`, `b`, `strong`, `i`, `em`, `u`, `ul`, `ol`, `li`, `font`, `img`, `h1`–`h3`. En una imagen solo vale `src` que empiece por `/uploads/noticias/` y un nombre de archivo simple. Estilos permitidos: tamaño 12–36 px, color hex o rgb, alineación, negrita, cursiva, subrayado y unas familias de fuente.

## TOP de la semana

`topSemana` agrupa platos de comandas vigentes entre el día operativo de hace 6 días y el de hoy (ventana 04:00–04:00). Ignora platos eliminados o anulados. Orden: cantidad, luego soles, luego nombre. Cada fila trae puesto, id, nombre, `codigoMozo`, cantidad y soles.

El resultado se cachea mientras no cambie el día operativo. Un cierre de caja llama `invalidarTopSemana()` para que la siguiente lectura recalcule.

En la app de mozos el cliente vuelve a pedir el TOP como mucho cada 10 minutos, salvo que se fuerce (aviso por socket o pantalla Más).

## App de cocina

`NoticiaDelDia` se monta en toda vista ya logueada, menos monitor, kiosco y `?modo=kiosk` o `?modo=completo-fijo`. Esas pantallas fijas no tapan la comanda con el modal.

Al cargar, y cuando el socket `/cocina` recibe `noticia-publicada`, pide `GET /api/noticias/hoy`. Si hay alguna noticia cuyo `_id` no está marcado en este navegador, abre el modal. El HTML pinta las imágenes anteponiendo el origen del servidor a `/uploads/`.

«Listo» guarda en `localStorage` la clave `gambusinas_noticias_vistas`: usuario, fecha operativa e ids que estaban en pantalla. Al día siguiente, o con otro usuario, esa marca no cuenta. No hay «visto» en el servidor: otro navegador o borrar datos vuelve a mostrarlas.

Este modal no incluye el TOP.

## App de mozos

La app que consume la página es `Las-Gambusinas` (React Native). El socket que ya usa el mozo escucha `noticia-publicada` en el namespace `/mozos`.

Al abrir la app (`NoticiasIngreso` en el navbar):

1. Pide TOP y noticias de hoy.
2. Si hay platos en el TOP y este mozo no lo vio en esta fecha, muestra «TOP de la semana» (puesto, nombre, código y cantidad).
3. Al cerrarlo, si hay noticias no vistas, muestra «Noticias de hoy» en un WebView con el mismo HTML.
4. «Listo» marca esas noticias como vistas.

La marca queda en AsyncStorage, por usuario: `@gambusinas_top_visto:{id}` (la fecha) y `@gambusinas_noticias_vistas:{id}` (`{ ymd, ids }`). Si no hay red no se marca nada, para no dar por leído lo que no llegó.

Si la noticia entra por socket mientras el TOP está abierto, no se interrumpe. Al terminar el TOP se evalúan las noticias. Un aviso por socket no vuelve a imponer el TOP del día; solo reabre noticias si hay ids nuevos.

En Más hay un botón Noticias (`NoticiasManual`). Abre TOP y noticias de hoy sin marcarlos como vistos. Sirve para volver a leerlos.

En la carta (órdenes y detalle de comanda, chip del `MenuPlatosSheet`) existe la categoría `TOP` (`CAT_TOP = '__top__'`). No es una categoría de plato: cruza el ranking con el catálogo cargado, quita stock 0 y conserva el puesto. Si un plato del ranking no está en la carta de ese mozo, no aparece.

## Flujo

```
noticias.html  --POST/PUT/PATCH-->  API noticias
                                      | guarda + sanitiza
                                      | emite noticia-publicada
                         /cocina  <---+--->  /mozos
                            |                |
                     NoticiaDelDia     NoticiasIngreso
                     (solo el texto)   (TOP y luego texto)
                                       carta: filtro TOP
```

Publicar, editar o retirar despierta a los dos. Cada app vuelve a pedir `/hoy` y decide si abre según lo que ese usuario ya cerró en ese dispositivo.
