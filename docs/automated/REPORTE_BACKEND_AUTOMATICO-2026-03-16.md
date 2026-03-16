# Reporte Automático del Backend – Las Gambusinas (2026-03-16)

## 1. Resumen Ejecutivo

- La superficie de ataque sigue siendo demasiado amplia: gran parte de `/api` permanece sin autenticación obligatoria, existen credenciales administrativas por defecto reimpuestas en el arranque y varias decisiones de autorización siguen confiando en `body`, `query` o headers del cliente.
- La capa en tiempo real continúa expuesta: `/cocina`, `/mozos` y `/admin` aceptan conexiones Socket.io sin autenticación de handshake ni autorización de rooms, por lo que un cliente no confiable puede escuchar eventos operativos.
- El mayor riesgo funcional está en cobro y caja: el cierre del restaurante puede incluir comandas no pagadas, el flujo de boucher/comandas/pedido/mesa no es atómico y los totales monetarios siguen pudiendo contar platos anulados o eliminados.
- En rendimiento y arquitectura ya hay avances, pero persisten cuellos serios: importación y sincronización JSON en runtime, consultas pesadas sin paginación consistente, `pre-save` con recálculos costosos y `/health` demasiado profundo para probes frecuentes.
- La documentación principal existe, pero todavía no refleja con precisión el comportamiento actual del código en puntos clave como `pedidoRoutes`, `GET /dashboard`, Redis adapter, polling, modo legacy JSON y runbooks operativos.

---

## 2. Seguridad y Vulnerabilidades
### 2.1 Issues críticos / altos

#### 2.1.1 API sensible sin autenticación y autorización obligatoria por defecto
Severidad: crítica.  
Área afectada: API REST (`mesas`, `mozos`, `comanda`, `boucher`, `clientes`, `configuración`, `auditoría`, `cierres`, `reportes`).  
Qué está mal: `index.js` monta todos los routers bajo `/api` sin un guard global de autenticación. En la práctica, solo un subconjunto pequeño de rutas usa `adminAuth`, mientras controladores sensibles como `boucherController`, `configuracionController`, `cierreCajaRestauranteController`, `auditoriaController`, `reportesController` y varias rutas de `mesas`, `mozos` y `clientes` siguen expuestos por defecto.  
Por qué es riesgoso o explotable: cualquier cliente con acceso de red puede crear, editar o borrar datos críticos sin presentar identidad válida. Esto amplía mucho la superficie de abuso y hace que errores de frontend, automatizaciones o actores internos no confiables puedan afectar caja, configuración y operación diaria.  
Recomendación de corrección: adoptar un modelo deny-by-default en `/api`, exigir identidad autenticada en el borde y aplicar autorización por rol o permiso en cada endpoint sensible.

#### 2.1.2 Credencial administrativa por defecto persistente y endpoint público de prueba
Severidad: crítica.  
Área afectada: bootstrap de usuarios, autenticación y acceso administrativo.  
Qué está mal: `inicializarUsuarioAdmin()` crea o normaliza siempre el usuario `admin` con DNI `12345678`, y vuelve a anunciar esas credenciales por consola en cada arranque. Además, `mozosController` expone `GET /api/mozos/test/admin`, que confirma externamente la existencia de ese usuario.  
Por qué es riesgoso o explotable: la cuenta administrativa es predecible y se vuelve a imponer en cada reinicio; eso convierte un entorno nuevo, reseeded o mal operado en una toma de control trivial. El endpoint de prueba reduce aún más la incertidumbre del atacante.  
Recomendación de corrección: eliminar credenciales estáticas del arranque, deshabilitar el endpoint de prueba y reemplazar el bootstrap por un flujo seguro de primer administrador con secreto fuerte, expiración y rotación obligatoria.

#### 2.1.3 Autorización basada en datos manipulables del cliente
Severidad: crítica.  
Área afectada: descuentos, cambios de estado, anulaciones, configuración y cierre de caja.  
Qué está mal: varios flujos siguen confiando en `usuarioRol`, `usuarioId`, `x-user-id`, `x-admin`, `esAdmin`, `forzarAdmin` o `usuarioAdmin` enviados por el cliente. Ejemplos concretos son los descuentos de comandas y pedidos, la liberación de mesas reservadas, la eliminación de platos ya entregados y la generación del cierre de caja.  
Por qué es riesgoso o explotable: un cliente puede elevar privilegios falsificando el payload. Hoy basta con enviar `usuarioRol: "admin"` para pasar validaciones de descuento o `x-admin: true` para habilitar ramas administrativas en flujos de mesa.  
Recomendación de corrección: derivar identidad, rol y permisos únicamente desde JWT o sesión validada del lado servidor; usar los campos enviados por el cliente solo como metadata o trazabilidad, nunca como fuente de autorización.

#### 2.1.4 WebSockets sin autenticación de handshake ni control de acceso a rooms
Severidad: crítica.  
Área afectada: Socket.io en `/cocina`, `/mozos` y `/admin`.  
Qué está mal: `src/socket/events.js` registra conexiones y permite `join-fecha` o `join-mesa` sin `io.use()` ni `namespace.use()` para validar tokens o claims. Los sockets pueden unirse a rooms arbitrarias con solo conocer una fecha o un `mesaId`.  
Por qué es riesgoso o explotable: cualquier cliente capaz de alcanzar el servidor puede escuchar comandas, estados de platos, eventos de reportes y actividad administrativa en tiempo real. Esto expone datos operativos y facilita scraping interno o espionaje de operación.  
Recomendación de corrección: exigir JWT en el handshake, verificar `app`, `rol` y permisos antes de aceptar la conexión, autorizar joins por recurso y añadir rate limiting por socket y por evento.

#### 2.1.5 Modelo JWT débil por secreto por defecto y control incompleto del dashboard
Severidad: alta.  
Área afectada: autenticación JWT, dashboard web y despliegue.  
Qué está mal: `adminAuth` usa `process.env.JWT_SECRET || 'las-gambusinas-admin-secret-key-2024'`, mientras el despliegue mantiene defaults inseguros en archivos de ejemplo. Además, `GET /dashboard` valida firma del token con `adminAuth`, pero no encadena `requireDashboardAccess`, por lo que no exige de forma explícita un rol de dashboard al servir la vista HTML.  
Por qué es riesgoso o explotable: un entorno con secretos por defecto o mal configurados permite forjar JWT. Incluso con secreto correcto, el backend usa la misma clave para más de una app y deja una frontera de confianza demasiado débil entre dashboard, mozos y cocina.  
Recomendación de corrección: fallar al arrancar si falta `JWT_SECRET`, eliminar defaults inseguros y separar secretos o claims por aplicación, validando rol y contexto en toda ruta web protegida.

#### 2.1.6 Exposición pública de información sensible por salud, métricas y logging
Severidad: alta.  
Área afectada: observabilidad, debugging y superficie pública.  
Qué está mal: `/health` y `/metrics` exponen demasiados detalles operativos, y el código sigue mezclando logging estructurado con `console.log` que imprime datos de autenticación, DNIs, errores internos y credenciales bootstrap. El propio endpoint de salud también agrega chequeos profundos y metadatos de infraestructura que no deberían ser públicos en el mismo nivel de acceso que el resto del backend.  
Por qué es riesgoso o explotable: un actor externo obtiene reconocimiento detallado de infraestructura y comportamiento del sistema, mientras los logs operativos pueden terminar almacenando PII o credenciales débiles.  
Recomendación de corrección: restringir `health` y `metrics` a red interna o autenticación técnica, reducir el detalle de respuestas públicas y consolidar el logging sensible bajo el logger estructurado con masking efectivo.

### 2.2 Issues medios / bajos

#### 2.2.1 Higiene de validación inconsistente en inputs y contratos
Severidad: media.  
Área afectada: múltiples controladores y endpoints mutantes.  
Qué está mal: la validación existe en algunos flujos, pero no es homogénea ni centralizada; abundan cuerpos libres que pasan casi directo a repositorios o modelos. También hay filtros flexibles como búsquedas por regex y updates amplios que aceptan estructuras más abiertas de lo necesario.  
Por qué es riesgoso o explotable: aumenta la probabilidad de estados inválidos, payloads mal formados, abuso de consultas costosas y bypasses lógicos cuando una ruta olvida validar formato, límites o coherencia entre campos.  
Recomendación de corrección: definir esquemas de validación por endpoint y aplicar una política común para `body`, `params`, `query` y headers admitidos.

#### 2.2.2 Rate limiting y frontera HTTPS parciales
Severidad: media.  
Área afectada: autenticación, WebSockets y acceso al backend detrás de proxy.  
Qué está mal: hay controles en el proxy, pero no existe una defensa equivalente dentro de la aplicación Node para login, mutaciones críticas ni eventos Socket.io. Además, la propia aplicación sigue aceptando requests sin `Origin` y el endurecimiento efectivo depende demasiado del borde.  
Por qué es riesgoso o explotable: si el tráfico evita el proxy o proviene de la red interna, el backend queda sin una protección equivalente contra fuerza bruta, scraping o abuso de endpoints críticos.  
Recomendación de corrección: añadir rate limit en Node para login y mutaciones sensibles, y límites específicos por socket/evento para que la protección no dependa solo de la topología de despliegue.

#### 2.2.3 Riesgo potencial de fuga de token por query string
Severidad: baja.  
Área afectada: acceso web a `GET /dashboard`.  
Qué está mal: `index.js` acepta token vía query string para `GET /dashboard`. No confirmé uso activo desde el frontend actual, por lo que esto se clasifica como hipótesis de riesgo, no como explotación confirmada.  
Por qué es riesgoso o explotable: si esa vía se utiliza, el JWT puede terminar en logs, historial o cabeceras `Referer`.  
Recomendación de corrección: retirar el soporte por query string y aceptar solo `Authorization` o cookie segura `HttpOnly`.

### 2.3 Checklist de higiene de seguridad
- [ ] Validación de entrada consistente
- [ ] Autorización en rutas sensibles
- [ ] Manejo seguro de errores
- [ ] CORS y HTTPS configurados correctamente
- [ ] WebSockets con control de acceso / rate limiting

---

## 3. Lógica, Consistencia e Integridad de Datos

### 3.1 Hallazgos de lógica de negocio

#### 3.1.1 Los totales de comanda y pedido siguen pudiendo contar platos anulados o eliminados
Flujo afectado: edición de comanda, anulación desde cocina, resumen por mesa, pedido y reportería.  
Impacto en la operación real: `precioTotal` de la comanda se recalcula sumando todos los platos, mientras los descuentos y algunos flujos posteriores sí trabajan solo con platos activos. Luego `Pedido.calcularTotales()` suma `comanda.precioTotal`, por lo que pedido, cierre y varios indicadores pueden quedar inflados aunque el boucher final filtre mejor los eliminados.  
Cambio lógico recomendado: definir una sola fuente de verdad monetaria para el total cobrable de platos activos y hacer que pedido, cierre y reportes consuman ese valor canónico.

#### 3.1.2 El cierre de caja del restaurante puede “consumir” comandas no pagadas
Flujo afectado: cierre de caja global del restaurante.  
Impacto en la operación real: `POST /api/cierre-caja` toma todas las comandas del período que no tengan `incluidoEnCierre`, sin exigir que estén pagadas, y luego las marca como incluidas. Si una comanda estaba aún en `en_espera`, `recoger` o `entregado`, puede quedar fuera de cierres futuros cuando finalmente se cobre.  
Cambio lógico recomendado: construir el cierre desde la fuente de verdad de cobro efectivo, usando solo comandas o bouchers ya conciliados y encapsulando la operación en una transacción.

#### 3.1.3 El flujo de pago no garantiza sincronía entre boucher, comandas, pedido y mesa
Flujo afectado: pago, facturación y reimpresión del comprobante.  
Impacto en la operación real: el boucher se crea y luego, en pasos separados, se marcan comandas y pedido. El pedido se busca solo como `abierto`, aunque el mismo dominio ya contempla pedidos `cerrado` antes de pagar, y no observé una actualización igualmente sólida de la mesa al estado final esperado por todos los lectores.  
Cambio lógico recomendado: unificar el cobro como caso de uso transaccional e idempotente, con actualización atómica de boucher, comandas, pedido, mesa y eventos.

#### 3.1.4 Una lectura GET corrige estado persistido en caliente
Flujo afectado: consulta de comandas listas para pagar.  
Impacto en la operación real: `getComandasParaPagar()` actualiza la comanda si detecta que todos los platos ya están listos, aunque el endpoint sea de lectura. Eso distorsiona auditoría, favorece carreras entre pantallas y deja el dominio dependiente de quién consultó primero.  
Cambio lógico recomendado: mover la autocorrección a comandos explícitos o a un servicio de reconciliación controlado, nunca a rutas GET.

#### 3.1.5 La máquina de estados mezcla valores reales, legacy y combinaciones imposibles
Flujo afectado: cocina, mozos, cobro, reportería y reversión operativa.  
Impacto en la operación real: el modelo actual convive con estados legacy y con validaciones que no siempre usan el mismo vocabulario. En el código todavía aparecen referencias a `completado`, `completadas`, `cancelada` o `pagando`, mientras los enums vigentes usan `pagado`, `cancelado` y no incluyen todos esos valores.  
Cambio lógico recomendado: centralizar enums y transiciones en un único módulo, migrar valores legacy una sola vez y prohibir que cada ruta “interprete” el estado por su cuenta.

#### 3.1.6 La relación pedido-comanda puede quedar huérfana o duplicada bajo concurrencia
Flujo afectado: agrupación por visita, descuentos por pedido, cobro consolidado y dashboard.  
Impacto en la operación real: la comanda se crea primero y recién después se intenta asociar al pedido abierto; si ese paso falla, el código lo registra como no crítico. Además, `obtenerOcrearPedidoAbierto()` hace `findOne()` y luego `create()` sin una garantía fuerte de unicidad para pedido abierto por mesa.  
Cambio lógico recomendado: asegurar unicidad mediante índice parcial o restricción equivalente y crear/asociar pedido-comanda dentro de una sola transacción o un `upsert` atómico.

#### 3.1.7 Asociación cliente-comanda basada en total enviado por el cliente
Flujo afectado: CRM, consumo acumulado de clientes y analítica intermedia.  
Impacto en la operación real: `POST /api/comandas/:id/cliente` recibe `totalComanda` desde el request y lo suma directo a `cliente.totalConsumido`. Aunque evita duplicar la referencia de `comandaId`, el contador monetario y `visitas` pueden inflarse con reintentos o payloads incorrectos.  
Cambio lógico recomendado: calcular el total en servidor desde la comanda o, preferiblemente, desde el boucher/pago efectivo, y hacer la operación idempotente por identificador de negocio.

### 3.2 Invariantes que el sistema debería garantizar

- `platos.length` y `cantidades.length` siempre coinciden en cualquier escritura efectiva de comanda. Estado actual: se cumple parcialmente.
- El total cobrable de una comanda refleja solo platos activos, descuentos vigentes e impuestos actuales. Estado actual: no se garantiza.
- Solo existe un `Pedido` abierto por mesa y toda comanda nueva de esa visita queda asociada a él. Estado actual: no se garantiza.
- Un `GET` nunca modifica estado persistido de dominio. Estado actual: no se garantiza.
- Si todos los platos activos están entregados, la comanda converge siempre al mismo estado final definido por negocio. Estado actual: no se garantiza.
- El cobro actualiza de forma atómica boucher, comandas, pedido, mesa y emisión de eventos. Estado actual: no se garantiza.
- Un cierre de caja solo incluye ventas efectivamente cobradas y nunca “pierde” pendientes futuras. Estado actual: no se garantiza.
- Una mesa `libre` no mantiene comandas activas asociadas. Estado actual: se cumple parcialmente.
- `cliente.totalConsumido` y `visitas` derivan de eventos de pago idempotentes, no de valores enviados por el cliente. Estado actual: no se garantiza.

### 3.3 Cobertura de pruebas frente a estos riesgos

- Las pruebas actuales cubren parte del dominio de estados de platos y la estructura básica de eventos Socket.io, lo cual ayuda a detectar regresiones de transición simple.
- No encontré cobertura específica para pago con boucher, cierre de caja restaurante, reconciliación pedido-mesa, efectos colaterales de GET con side effects ni asociación cliente-comanda.
- Tampoco hay pruebas de concurrencia o invariantes transaccionales alrededor de pedido abierto único por mesa, doble cobro o cierres repetidos.

---

## 4. Rendimiento y Arquitectura

### 4.1 Rutas críticas más sensibles hoy

- `GET /api/comanda`, `GET /api/comanda/fecha/:fecha` y variantes: alto volumen operativo y payloads amplios.
- `GET /api/boucher`, `GET /api/boucher/fecha/:fecha` y `GET /api/reportes/ventas`: base de reportería financiera y dashboard.
- `POST /api/cierre-caja` y flujos de boucher/pago: alto costo lógico y riesgo de consistencia.
- `POST /api/admin/auth` y autenticaciones equivalentes por app: rutas sensibles con logs verbosos.
- `/health` y `/metrics`: hoy sirven observabilidad, pero también actúan como punto de carga y reconocimiento.

### 4.2 Cuellos de botella detectados

#### 4.2.1 Importación y sincronización JSON legacy en runtime
`database.js` sigue importando `data/*.json` al abrir conexión, y varios repositorios siguen llamando a `syncJsonFile()` tras mutaciones de `comandas`, `mozos`, `mesas`, `platos`, `clientes` y `bouchers`.  
Impacto: I/O síncrono en hot path, arranque más lento, riesgo de duplicar responsabilidades de persistencia y mayor fragilidad si se usan varios procesos.  
Mejora recomendada: sacar el modo JSON del flujo normal de producción y dejarlo como bootstrap o migración explícita.

#### 4.2.2 Recalculo costoso en `pre-save` de comanda
El `pre-save` de `Comanda` vuelve a buscar platos en Mongo para recalcular importes, incluso cuando parte de la validación ya fue resuelta antes.  
Impacto: la optimización batch de creación de comandas pierde parte del beneficio y reaparece un patrón cercano a N+1 en escrituras frecuentes.  
Mejora recomendada: recalcular importes con datos ya resueltos por lote o desnormalizados en la misma operación, evitando consultas repetidas por plato.

#### 4.2.3 Listados sin paginación consistente en dominios pesados
`comanda`, `boucher`, `clientes`, `pedidos` y varios endpoints de reportería o auditoría siguen devolviendo datasets completos o casi completos.  
Impacto: crecimiento lineal del tiempo de respuesta y del consumo de memoria conforme aumenta el histórico.  
Mejora recomendada: contrato uniforme de paginación (`page`, `limit`, `total`, `hasMore`) y endpoints de resumen para dashboard.

#### 4.2.4 Reportería financiera apoyada en bouchers sin índices secundarios claros
La reportería y varios filtros por fecha dependen de `boucher`, pero el modelo no muestra índices secundarios explícitos alineados con `fechaPago`, `mozo`, `mesa` o `isActive`.  
Impacto: scans cada vez más caros al crecer el volumen de tickets, especialmente en reportería diaria y rankings.  
Mejora recomendada: añadir índices concretos en `boucher` para `isActive + fechaPago`, `mozo + fechaPago` y `mesa + fechaPago`.

#### 4.2.5 Concurrencia no protegida en pedido abierto por mesa
`Pedido.obtenerOcrearPedidoAbierto()` usa `findOne()` y luego `create()` sin unicidad fuerte en base de datos.  
Impacto: bajo concurrencia real pueden coexistir más de un pedido abierto por mesa, lo que afecta agrupación, cobro consolidado y consistencia de dashboard.  
Mejora recomendada: índice parcial único o `upsert` transaccional para “un pedido abierto por mesa”.

#### 4.2.6 `/health` es demasiado profundo para liveness/readiness frecuente
El endpoint consulta Mongo, Redis, métricas de sistema, estado de websockets, agregaciones de platos, `distinct()` y `countDocuments()` en una sola llamada.  
Impacto: el sistema se autogenera carga de observabilidad justo en momentos de supervisión, despliegue o degradación.  
Mejora recomendada: separar `livez`, `readyz` y `health/deep`, reservando la versión profunda para diagnóstico o monitoreo controlado.

#### 4.2.7 Escalado horizontal incompleto para Socket.io
El repositorio declara `@socket.io/redis-adapter` y contempla PM2, pero el runtime auditado no configura el adapter.  
Impacto: en multiinstancia no hay garantía de difusión consistente entre workers o nodos, y la topología real queda más cerca de single-instance.  
Mejora recomendada: o bien formalizar y documentar que la topología soportada hoy es single-instance, o bien completar la integración del adapter y validarla con pruebas.

### 4.3 Uso actual de Redis y caché

- Aprovechamiento actual:
  - Caché de menú por tipo en `plato.repository`.
  - Caché de varios reportes en `reportesController`.
  - Caché de configuración y fallback a memoria en `redisCache`.
- Riesgos de inconsistencia:
  - La invalidación del menú sigue siendo frágil frente a claves paginadas.
  - Algunos reportes críticos siguen recalculándose sin una estrategia homogénea de invalidación.
  - `calculosPrecios` mantiene caché local por proceso, pero la actualización de configuración no invalida esa caché con la misma claridad que Redis.
  - Si Redis no está disponible, el sistema cae a memoria y eso necesita mejor visibilidad operativa para no asumir capacidades que ya no existen.
- Mejoras realistas:
  - Versionar namespaces de caché o invalidar por patrón controlado.
  - Documentar TTL, triggers de invalidación y tolerancia a stale por dominio.
  - Exponer métricas de hit/miss por endpoint o por familia de claves, no solo estadísticas globales.

### 4.4 Propuestas realistas de arquitectura

- Controllers más delgados y casos de uso explícitos para cobro, cierre y reconciliación de estados.
- Transacciones Mongo para `Comanda <-> Pedido <-> Mesa <-> Boucher <-> Cierre`.
- Endpoints de resumen para dashboard en lugar de cargar entidades completas cuando solo se necesitan KPIs.
- Política clara de operación legacy: Mongo como fuente de verdad, JSON solo para migración o export controlada.
- Trazabilidad por request basada en `AsyncLocalStorage` en lugar de globals.

---

## 5. Documentación y Runbooks

### 5.1 Estado de la documentación frente al código actual

- `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` está cerca del código, pero mantiene desalineaciones relevantes:
  - aún afirma en una sección que `GET /dashboard` sirve `index.html`, cuando el código sirve `public/dashboard/lasgambusinas-dashboard.html`;
  - sigue indicando que `pedidoRoutes` no está montado, aunque `index.js` sí incluye `pedidoRoutes` en el array `routes`;
  - describe `adminAuth` como flujo con redirección en fallo, pero el middleware real devuelve 401 JSON cuando el token falta o es inválido.
- Ese mismo documento presenta el patrón controller-repository como si los controllers no tocaran modelos directamente, pero `cierreCajaRestauranteController` y otras piezas ya contienen lógica y acceso a modelos dentro del controller.
- `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md` sigue sobrevendiendo la topología: menciona Redis adapter como parte de la arquitectura efectiva y afirma que el polling fue eliminado, aunque el runtime actual sigue permitiendo `polling` como transporte y no configura el adapter.
- El archivo solicitado en el prompt como `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES-2.md` no existe en el repositorio auditado. El documento vigente revisado fue `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.
- No existe un `README*` en la raíz del repo; hoy el conocimiento operativo queda repartido entre documentación técnica extensa, scripts y configuración, pero sin una entrada corta de operación diaria.

### 5.2 Flujos importantes insuficientemente documentados

- El comportamiento real de seguridad de `/api` y la ausencia de protección homogénea por router.
- La diferencia entre tokens de dashboard, `App Mozos` y `App Cocina`, y el hecho de que hoy comparten el mismo secreto JWT.
- El riesgo operacional del modo JSON legacy, cuándo se ejecuta y por qué conviene desactivarlo en producción.
- Las limitaciones reales de Socket.io en despliegue multiinstancia sin Redis adapter activo.
- Los criterios de inclusión de comandas en cierre de caja restaurante y su impacto sobre ventas pendientes.
- La estrategia real de caché e invalidación para reportería, configuración monetaria y menú.

### 5.3 Propuestas concretas de mejora documental

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Punto de Entrada (index.js)` y `Dashboard Administrativo`.  
Qué falta o está mal: la ruta `GET /dashboard`, el montaje de `pedidoRoutes` y el comportamiento real de `adminAuth` ya no coinciden con lo descrito.  
Contenido propuesto: explicar que `GET /dashboard` sirve `public/dashboard/lasgambusinas-dashboard.html`, que `GET /` sigue siendo el dashboard multi-página, que `pedidoRoutes` sí está montado bajo `/api` y que el middleware actual responde 401 JSON ante token inválido. Añadir una nota breve sobre qué interfaz web consume datos reales hoy y cuál es el nivel de protección efectivo de cada una.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Variables de Entorno y Despliegue`.  
Qué falta o está mal: faltan variables y supuestos operativos clave para Redis, observabilidad, backups, topología soportada y modo legacy.  
Contenido propuesto: ampliar la matriz con `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_PREFIX`, `APP_VERSION`, `IP`, `SENTRY_DSN` y el alcance real de `SKIP_JSON_IMPORT`. Incluir dos ejemplos mínimos: uno local para desarrollo y otro productivo con Mongo, Redis y secretos obligatorios.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Redis Cache`, `Health Check y Métricas` y `Runbook Operativo Backend`.  
Qué falta o está mal: no se documenta suficientemente la invalidación de caché, la caché local de cálculos monetarios ni que `/health` hoy es demasiado profundo para ser probe liviano. Tampoco existe un runbook breve y accionable para caída de Mongo, Redis o degradación de Socket.io.  
Contenido propuesto: describir qué claves existen, cómo se invalidan, qué ventanas de stale se aceptan y por qué conviene separar `livez`, `readyz` y `deep-health`. Dentro del mismo documento, agregar un runbook compacto con verificación post-deploy, criterio de rollback y acciones inmediatas cuando Redis cae y el sistema pasa a fallback en memoria.

Documento objetivo: `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.  
Sección a actualizar o crear: `Arquitectura Socket.io` y `Escalabilidad`.  
Qué falta o está mal: el diagrama menciona o sugiere capacidad multiinstancia efectiva, pero el runtime auditado no configura el Redis adapter y sigue aceptando `polling` como transporte.  
Contenido propuesto: declarar el estado real como “dependencia disponible, no activa según el código auditado”, explicar la consecuencia sobre cluster/replicas y mostrar el flujo actual de broadcast por namespaces con esa limitación. Añadir una nota breve aclarando que `polling` sigue habilitado como transporte de Socket.io, aunque ya no exista una estrategia funcional aparte.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Flujo de caja, bouchers y cierres`.  
Qué falta o está mal: el documento no deja suficientemente claro que el cierre de restaurante toma comandas no incluidas en cierres previos, no necesariamente solo pagadas, y que el pago no es una operación atómica entre todos los agregados.  
Contenido propuesto: describir el flujo actual tal como está, marcarlo como limitación conocida y añadir la intención futura de cerrar desde operaciones efectivamente cobradas. Un ejemplo breve ayudaría a mostrar por qué una comanda entregada pero no pagada puede quedar absorbida por un cierre.

---

## 6. Oportunidades de Alto Impacto (“producto 10 000 USD”)

### 6.1 Seguridad por capas en REST y Socket
Idea: autenticación obligatoria en `/api`, RBAC real por permiso, JWT diferenciados por aplicación y handshake autenticado para Socket.io con autorización de rooms.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.2 Cobro y cierre transaccional con idempotencia
Idea: encapsular boucher, comandas, pedido, mesa y cierre en casos de uso con transacción Mongo, guardas de concurrencia e idempotency keys.  
Impacto estimado: alto.  
Esfuerzo estimado: alto.

### 6.3 API de analítica operativa para dashboard premium
Idea: nuevos endpoints de tiempos de preparación, desempeño por mozo, platos por franja horaria, rotación de mesas, abandono de comandas y eficiencia de cocina.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.4 Observabilidad madura con trazabilidad de punta a punta
Idea: logs estructurados consistentes, `correlationId` sin globals, métricas Prometheus por endpoint y evento, y health checks separados por nivel.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.5 Backlog de invariantes con pruebas de regresión diaria
Idea: convertir invariantes de negocio en tests automatizados para pagos, cierres, pedido abierto único por mesa, sincronía de estados y consistencia de totales.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.6 Modelo de caché gobernado por dominio
Idea: catálogo de claves, TTL, invalidaciones y responsabilidad por módulo para evitar stale silencioso en menú, reportería y configuración.  
Impacto estimado: medio-alto.  
Esfuerzo estimado: medio.

### 6.7 Topología de despliegue realmente soportada
Idea: completar Redis adapter para Socket.io, eliminar dependencias de `global.*`, formalizar single-instance o multi-instance como opción soportada y acompañarlo con smoke tests de despliegue.  
Impacto estimado: medio-alto.  
Esfuerzo estimado: medio.

---

## 7. PRs sugeridos a partir de este reporte

- PR 1: `security: proteger /api con autenticación obligatoria y RBAC real`. Alcance: middleware global, permisos por endpoint y retiro de `usuarioRol`, `x-admin` y `x-user-id` como fuente de autorización.
- PR 2: `security: endurecer autenticación y sesiones administrativas`. Alcance: eliminación de credenciales por defecto, secrets fail-fast, separación de tokens por aplicación y cierre del endpoint `GET /api/mozos/test/admin`.
- PR 3: `security: handshake JWT y autorización de rooms en Socket.io`. Alcance: auth por namespace, validación de claims, rate limiting por evento y contrato explícito de conexión.
- PR 4: `core: transacciones de pago y cierre de caja`. Alcance: atomicidad entre boucher, comandas, pedido, mesa y cierre restaurante, más idempotencia y reconciliación segura.
- PR 5: `core: invariantes de estados y recálculo monetario`. Alcance: convergencia única de estados, prohibición de GET con side effects, total canónico por platos activos y unicidad de pedido abierto por mesa.
- PR 6: `performance: paginación, índices y caché`. Alcance: paginación real en listados pesados, índices en `boucher`, revisión del `pre-save` de comanda, corrección de invalidación de caché y división de `health` en niveles.
- PR 7: `docs: alinear documentación técnica y runbooks`. Alcance: actualizar `BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` y `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md` con rutas reales, topología soportada, variables de entorno, runbook operativo y limitaciones conocidas.
