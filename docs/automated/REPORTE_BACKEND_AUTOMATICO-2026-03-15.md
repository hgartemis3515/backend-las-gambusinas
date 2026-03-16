# Reporte Automático del Backend – Las Gambusinas (2026-03-15)

## 1. Resumen Ejecutivo

- La superficie de ataque sigue siendo demasiado amplia: gran parte de `/api` permanece sin autenticación obligatoria, existen credenciales administrativas por defecto reimpuestas en el arranque y varias decisiones de autorización confían en `body`, `query` o headers del cliente.
- La capa en tiempo real también está expuesta: `/cocina`, `/mozos` y `/admin` aceptan conexiones Socket.io sin autenticación de handshake ni autorización de rooms, por lo que un cliente no confiable puede escuchar eventos operativos.
- El mayor riesgo funcional está en caja y cobro: el cierre de restaurante puede incluir comandas no pagadas, el flujo de boucher/pedido/mesa no es atómico y hay estados que cambian en lecturas, no solo en comandos explícitos.
- En rendimiento y arquitectura ya hay mejoras reales, pero persisten cuellos importantes: sincronización JSON bloqueante, listados sin paginación efectiva, `/health` demasiado pesado para probes frecuentes y reportería de bouchers sin índices secundarios claros.
- La documentación principal existe pero no está completamente alineada con el código actual: `BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` y `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md` requieren ajustes puntuales, y el reporte automático anterior quedó desactualizado al afirmar que ciertos documentos no existían.

---

## 2. Seguridad y Vulnerabilidades
### 2.1 Issues críticos / altos

#### 2.1.1 API sensible sin autenticación y autorización obligatoria por defecto
Severidad: crítica.  
Área afectada: API REST (`mesas`, `mozos`, `comanda`, `boucher`, `clientes`, `configuración`, `auditoría`, `cierres`, `reportes`).  
Qué está mal: `index.js` monta todos los routers bajo `/api` sin middleware global de autenticación; en la práctica, solo rutas puntuales como `roles` usan `adminAuth`. Controladores como `mozosController`, `configuracionController`, `boucherController`, `cierreCajaRestauranteController`, `reportesController` y `auditoriaController` siguen expuestos sin una barrera común de acceso.  
Por qué es riesgoso o explotable: un atacante con acceso de red puede crear, editar o borrar datos críticos sin necesidad de token. El caso más peligroso es `POST /api/mozos`, porque el modelo acepta `rol`, `permisos` y `activo`, habilitando la creación de usuarios privilegiados desde una ruta pública.  
Recomendación de corrección: adoptar un modelo deny-by-default en `/api`, exigir identidad autenticada en el borde y aplicar autorización por rol o permiso en cada endpoint sensible.

#### 2.1.2 Credencial administrativa por defecto persistente y endpoint público de prueba
Severidad: crítica.  
Área afectada: bootstrap de usuarios, autenticación y acceso administrativo.  
Qué está mal: `inicializarUsuarioAdmin()` crea o normaliza siempre el usuario `admin` con DNI `12345678`, y `mozosController` expone además `GET /api/mozos/test/admin`, que verifica explícitamente esas credenciales.  
Por qué es riesgoso o explotable: la cuenta administrativa es predecible y se vuelve a imponer en cada arranque; eso convierte un error operacional o un entorno nuevo en una toma de control trivial. El endpoint de prueba, además, confirma externamente si la cuenta existe.  
Recomendación de corrección: eliminar credenciales estáticas del arranque, deshabilitar el endpoint de prueba y reemplazar el bootstrap por un flujo seguro de primer administrador con secreto fuerte y rotación obligatoria.

#### 2.1.3 Autorización basada en datos manipulables del cliente
Severidad: crítica.  
Área afectada: descuentos, cambios de estado, anulaciones y cierres.  
Qué está mal: varios flujos siguen confiando en `usuarioRol`, `usuarioId`, `x-user-id`, `x-admin`, `esAdmin`, `sourceApp` o `usuarioAdmin` enviados por el cliente. Ejemplos claros: descuentos de comandas y pedidos, liberación de mesas reservadas, anulación de platos entregados y generación de cierre de caja.  
Por qué es riesgoso o explotable: un cliente puede elevar privilegios falsificando el payload. Hoy basta con enviar `usuarioRol: "admin"` para pasar validaciones de descuento, `x-admin: true` para liberar ciertas mesas o `sourceApp: "admin"` para saltar restricciones de anulación.  
Recomendación de corrección: derivar identidad, rol y permisos únicamente desde JWT o sesión validada del lado servidor; usar los campos enviados por cliente solo como trazabilidad, nunca como fuente de autorización.

#### 2.1.4 WebSockets sin autenticación de handshake ni control de acceso a rooms
Severidad: crítica.  
Área afectada: Socket.io en `/cocina`, `/mozos` y `/admin`.  
Qué está mal: `src/socket/events.js` registra conexiones y `join-fecha` o `join-mesa` sin `io.use()` ni `namespace.use()` para validar tokens. Los sockets pueden unirse a rooms arbitrarias con solo conocer la fecha o el ID de mesa.  
Por qué es riesgoso o explotable: cualquier cliente capaz de alcanzar el servidor puede escuchar comandas, estados de platos, eventos de reportes y actividad del dashboard en tiempo real. Esto expone datos operativos y facilita scraping o espionaje interno.  
Recomendación de corrección: exigir JWT en el handshake, verificar `app`, `rol` y permisos antes de aceptar conexión, autorizar joins por recurso y añadir rate limiting por evento.

#### 2.1.5 Modelo JWT débil por secreto por defecto y control incompleto del dashboard
Severidad: alta.  
Área afectada: autenticación JWT, dashboard web y despliegue.  
Qué está mal: `adminAuth` usa `process.env.JWT_SECRET || 'las-gambusinas-admin-secret-key-2024'`, mientras `docker-compose.yml` y `.env.production.example` mantienen defaults tipo `changeme`. Además, `GET /dashboard` valida firma del token con `adminAuth`, pero no encadena `requireDashboardAccess`; por tanto, cualquier token firmado con el mismo secreto puede cruzar esa barrera aunque no sea de dashboard.  
Por qué es riesgoso o explotable: un entorno con secretos por defecto o mal configurados permite forjar JWT. Incluso con secreto correcto, el backend emite tokens para `App Mozos` y `App Cocina` con la misma clave, y la ruta HTML protegida no exige explícitamente rol `admin` o `supervisor`.  
Recomendación de corrección: fallar al arrancar si falta `JWT_SECRET`, eliminar defaults inseguros y separar claramente secretos o claims por aplicación, validando rol y `app` en toda ruta web protegida.

#### 2.1.6 Exposición pública de información sensible por salud, métricas y logging
Severidad: alta.  
Área afectada: observabilidad, debugging y superficie pública.  
Qué está mal: `/health` y `/metrics` están publicados en `nginx.conf` sin rate limit y revelan IP, estado de Mongo, Redis, websockets y recursos del sistema. En paralelo, hay `console.log` con cuerpos de autenticación, nombres, DNIs y errores internos en controladores y repositorios.  
Por qué es riesgoso o explotable: un actor externo obtiene reconocimiento detallado de infraestructura y comportamiento del sistema, mientras logs operativos pueden terminar almacenando PII o credenciales débiles.  
Recomendación de corrección: restringir `health` y `metrics` a red interna o autenticación técnica, reducir el detalle de las respuestas públicas y consolidar el logging sensible bajo el logger estructurado con masking real.

### 2.2 Issues medios / bajos

#### 2.2.1 Higiene de validación inconsistente en inputs y contratos
Severidad: media.  
Área afectada: múltiples controladores y endpoints mutantes.  
Qué está mal: la validación existe en algunos flujos, pero no es homogénea ni centralizada; abundan cuerpos libres que pasan casi directo a repositorios o modelos, especialmente en `mozos`, `clientes`, `configuración` y varias operaciones de `comanda`.  
Por qué es riesgoso o explotable: aumenta la probabilidad de estados inválidos, payloads mal formados y bypasses lógicos cuando una ruta olvida validar formato, límites o coherencia entre campos.  
Recomendación de corrección: definir esquemas de validación por endpoint y aplicar una política común para `body`, `params`, `query` y headers admitidos.

#### 2.2.2 Rate limiting parcial y fuera de la aplicación Node
Severidad: media.  
Área afectada: autenticación, WebSockets y acceso directo al backend.  
Qué está mal: hay rate limiting en Nginx para `/api`, pero no se usa `express-rate-limit` en Express y no existe una defensa equivalente para eventos Socket.io.  
Por qué es riesgoso o explotable: si el tráfico evita el proxy o proviene de la red interna, el backend queda sin una protección equivalente contra fuerza bruta o abuso de endpoints críticos como autenticación.  
Recomendación de corrección: añadir rate limit en Node para login y mutaciones críticas, y límites específicos por socket/evento.

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

#### 3.1.1 El cierre de caja del restaurante puede “consumir” comandas no pagadas
Flujo afectado: cierre de caja global del restaurante.  
Impacto en la operación real: `POST /api/cierre-caja` toma todas las comandas del período que no tengan `incluidoEnCierre`, sin exigir que estén pagadas o cerradas, y luego las marca como incluidas. Si una comanda estaba aún en `en_espera`, `recoger` o `entregado`, puede quedar fuera de cierres futuros cuando finalmente se cobre.  
Cambio lógico recomendado: construir el cierre desde la fuente de verdad de cobro efectivo, usando solo comandas o bouchers ya conciliados y encapsulando la operación en una transacción.

#### 3.1.2 El flujo de pago no garantiza sincronía entre boucher, comandas, pedido y mesa
Flujo afectado: pago, facturación y reimpresión del comprobante.  
Impacto en la operación real: el boucher se crea y luego, en pasos separados, se marcan comandas y pedido. `pedido.repository` busca el pedido abierto para marcarlo pagado, pero el mismo dominio ya lo había movido antes a `cerrado`; eso deja pedidos atascados y hace posible que exista boucher sin estado final consistente en mesa y pedido. También `obtenerBoucherPorMesa()` exige mesa en `pagado`, condición que el flujo no siempre asegura.  
Cambio lógico recomendado: unificar el cobro como caso de uso transaccional e idempotente, con actualización atómica de boucher, comandas, pedido, mesa y eventos.

#### 3.1.3 Anular o eliminar platos no recalcula de forma confiable los importes agregados
Flujo afectado: edición de comanda, anulación desde cocina, resumen por mesa, pedido y reportes.  
Impacto en la operación real: `anularPlato()` y `PUT /comanda/:id/eliminar-platos` marcan ítems como eliminados o anulados, pero el recalculo monetario queda incompleto. El pedido sigue sumando `precioTotal` de comandas, y el `pre-save` de `Pedido` no distingue entre precio histórico y total activo, por lo que la mesa o el pedido pueden seguir mostrando montos inflados.  
Cambio lógico recomendado: recalcular importes derivados cada vez que cambie el set de platos activos y hacer que `Pedido` derive total desde platos vigentes, no desde un valor potencialmente desactualizado.

#### 3.1.4 Una lectura GET corrige estado persistido en caliente
Flujo afectado: consulta de comandas listas para pagar.  
Impacto en la operación real: `getComandasParaPagar()` actualiza la comanda a `entregado` si detecta que todos los platos lo están, aunque el endpoint sea de lectura. Eso distorsiona auditoría, favorece carreras entre pantallas y deja el dominio dependiente de quién miró primero.  
Cambio lógico recomendado: mover la autocorrección a comandos explícitos o a un servicio de reconciliación controlado, nunca a rutas GET.

#### 3.1.5 El estado global de comanda no converge de forma única
Flujo afectado: cocina, mozos, cobro y reportería de comandas.  
Impacto en la operación real: `recalcularEstadoComandaPorPlatos()` lleva la comanda a `entregado` cuando todos los platos activos están entregados, pero otros caminos de negocio y comentarios del código siguen tratando ese punto como `recoger` o lo “corrigen” después. Esto hace que el estado visible dependa del flujo y no de una regla única.  
Cambio lógico recomendado: definir una máquina de estados única para plato, comanda y mesa, y reutilizar la misma función de transición en todos los controladores y repositorios.

#### 3.1.6 Revertir una comanda a `recoger` deja platos en `en_espera`
Flujo afectado: reversión operativa desde cocina o administración.  
Impacto en la operación real: `revertirStatusComanda()` permite `entregado -> recoger`, pero luego fuerza los platos `recoger` o `entregado` a `en_espera`. El resultado puede ser una comanda global en `recoger` con ítems individuales en `en_espera`, inconsistente para cocina y mozos.  
Cambio lógico recomendado: hacer que la reversión conserve alineación entre estado global y estados de ítems, o prohibir combinaciones que no puedan representarse de forma coherente.

#### 3.1.7 La relación pedido-comanda puede quedar huérfana o duplicada
Flujo afectado: agrupación por visita, descuentos por pedido, cobro consolidado y dashboard.  
Impacto en la operación real: la comanda se crea primero y recién después se intenta asociar al pedido abierto; si ese paso falla, el código lo registra como “no crítico”. Además, `obtenerOcrearPedidoAbierto()` hace `findOne()` y luego `create()` sin garantía fuerte de unicidad de pedido abierto por mesa.  
Cambio lógico recomendado: asegurar unicidad mediante índice parcial o restricción equivalente y crear/asociar pedido-comanda dentro de una sola transacción o un `upsert` atómico.

#### 3.1.8 Asociación cliente-comanda basada en total enviado por el cliente
Flujo afectado: CRM, consumo acumulado de clientes y reportes intermedios.  
Impacto en la operación real: `POST /api/comandas/:id/cliente` recibe `totalComanda` desde el request y lo suma directo a `cliente.totalConsumido`, sin recalcular desde la comanda ni actualizar en ese momento la relación en la propia comanda o en el pedido. Eso permite inflar métricas y dejar relaciones incompletas.  
Cambio lógico recomendado: calcular el total en servidor desde la comanda activa y persistir de forma consistente la relación en ambos lados del dominio.

### 3.2 Invariantes que el sistema debería garantizar

- `platos.length` y `cantidades.length` siempre coinciden en cualquier escritura efectiva de comanda. Estado actual: se cumple parcialmente.
- Solo existe un `Pedido` abierto por mesa y toda comanda nueva de esa visita queda asociada a él. Estado actual: no se garantiza.
- Un `GET` nunca modifica estado persistido de dominio. Estado actual: no se garantiza.
- Si todos los platos activos están entregados, la comanda converge siempre al mismo estado final definido por negocio. Estado actual: no se garantiza.
- El cobro actualiza de forma atómica boucher, comandas, pedido, mesa y emisión de eventos. Estado actual: no se garantiza.
- Un cierre de caja solo incluye ventas efectivamente cobradas y nunca “pierde” pendientes futuras. Estado actual: no se garantiza.
- Una mesa `libre` no mantiene comandas activas asociadas. Estado actual: se cumple parcialmente.
- Los importes de pedido y comanda reflejan solo platos activos y descuentos vigentes. Estado actual: se cumple parcialmente.
- La auditoría captura cambios financieros relevantes con tipos válidos y persistencia real. Estado actual: se cumple parcialmente.

### 3.3 Cobertura de pruebas frente a estos riesgos

- Las pruebas actuales cubren parte del dominio de estados de platos y la estructura básica de eventos Socket.io, lo cual ayuda a detectar regresiones de transición simple.
- No encontré cobertura específica para pago con boucher, cierre de caja restaurante, reconciliación pedido-mesa, efectos colaterales en `GET /comanda/comandas-para-pagar/:mesaId` ni asociación cliente-comanda.
- Tampoco hay pruebas de concurrencia o invariantes transaccionales alrededor de pedido abierto único por mesa, doble cobro o cierres repetidos.

---

## 4. Rendimiento y Arquitectura

### 4.1 Rutas críticas más sensibles hoy

- `GET /api/comanda`, `GET /api/comanda/fecha/:fecha` y variantes: alto volumen operativo y payloads amplios.
- `GET /api/boucher`, `GET /api/boucher/fecha/:fecha` y `GET /api/reportes/ventas`: base de reportería financiera y dashboard.
- `POST /api/cierre-caja` y flujos de boucher/pago: alto costo lógico y riesgo de consistencia.
- `POST /api/admin/auth`, `POST /api/admin/mozos/auth` y `POST /api/admin/cocina/auth`: autenticación sensible con logs verbosos.
- `/health` y `/metrics`: actualmente sirven observabilidad, pero también actúan como punto de carga y reconocimiento.

### 4.2 Cuellos de botella detectados

#### 4.2.1 Sincronización JSON legacy bloqueante
`syncJsonFile()` usa `fs.writeFileSync()` y se invoca desde múltiples repositorios tras mutaciones de `comandas`, `mozos`, `mesas`, `platos`, `clientes` y `bouchers`. Además, `database.js` vuelve a importar `data/*.json` al abrir conexión.  
Impacto: I/O síncrono en hot path, duplicación de fuentes de verdad y arranque más costoso de lo necesario.  
Mejora recomendada: sacar el modo JSON del flujo normal de producción o convertirlo en un proceso asíncrono y explícitamente legacy.

#### 4.2.2 Listados sin paginación efectiva en dominios pesados
`comanda`, `boucher`, `clientes`, `pedidos` y varios endpoints de auditoría siguen devolviendo datasets completos o casi completos. Incluso el frontend ya envía `limit` en algunos casos, pero el backend no siempre lo usa.  
Impacto: crecimiento lineal del tiempo de respuesta y del consumo de memoria conforme aumenta el histórico.  
Mejora recomendada: contrato uniforme de paginación (`page`, `limit`, `total`, `hasMore`) y endpoints de resumen para dashboard.

#### 4.2.3 Reportería financiera apoyada en bouchers sin índices secundarios suficientes
`boucher.model.js` no define índices secundarios sobre `fechaPago`, `numMesa` o `cliente`, mientras `reportesController` usa agregaciones y conteos repetidos sobre `isActive + fechaPago`.  
Impacto: scans cada vez más caros al crecer el volumen de tickets, especialmente en `GET /api/reportes/ventas`.  
Mejora recomendada: añadir índices concretos en `boucher` para `isActive + fechaPago`, `numMesa + fechaPago` y, si el producto lo requiere, `cliente + fechaPago`.

#### 4.2.4 `/health` es demasiado profundo para liveness/readiness frecuente
El endpoint consulta Mongo, Redis, métricas de sistema, estado de websockets, agregaciones de platos, `distinct()` y `countDocuments()` en una sola llamada, y además se usa desde `docker-compose`, PM2 y scripts de despliegue.  
Impacto: el sistema se autogenera carga de observabilidad, con mayor costo justo en momentos de supervisión o despliegue.  
Mejora recomendada: separar `livez`, `readyz` y `health/deep`, reservando la versión profunda para diagnóstico o monitoreo controlado.

#### 4.2.5 Escalado horizontal incompleto para Socket.io
La app declara cluster con PM2, pero el runtime no configura `@socket.io/redis-adapter`.  
Impacto: en multiinstancia no hay garantía de difusión consistente entre workers o nodos, y el estado real del producto queda más cerca de single-instance que de escalado horizontal listo.  
Mejora recomendada: o bien formalizar y documentar que la topología soportada hoy es single-instance, o bien completar la integración del adapter y validarla con pruebas.

### 4.3 Uso actual de Redis y caché

- Aprovechamiento actual:
  - Caché de menú por tipo en `plato.repository`.
  - Caché de varios reportes en `reportesController`.
  - Caché de configuración y fallback a memoria en `redisCache`.
- Riesgos de inconsistencia:
  - La invalidación del menú usa prefijo por tipo, pero la clave real incluye `tipo:page:limit`, por lo que páginas cacheadas pueden quedar obsoletas hasta expirar.
  - `GET /api/reportes/ventas` no cachea, aunque otros reportes sí; esto concentra carga en el peor punto de reportería.
  - La configuración monetaria invalida Redis, pero `calculosPrecios` mantiene una caché local por proceso que no se invalida desde `configuracion.repository`.
  - Si Redis falla al arranque, el proceso cae a memoria y no vi un mecanismo claro de reconexión robusta para volver a Redis automáticamente.
- Mejoras realistas:
  - Versionar namespaces de caché o invalidar por patrón.
  - Documentar TTL, trigger de invalidación y tolerancia a stale por dominio.
  - Exponer métricas de hit/miss por endpoint y no solo estadísticas globales.

### 4.4 Propuestas realistas de arquitectura

- Controllers más delgados y casos de uso explícitos para cobro, cierre y reconciliación de estados.
- Eventos de dominio desacoplados de `global.*` para mejorar testabilidad, trazabilidad y escalado.
- Endpoints de resumen para dashboard en lugar de cargar entidades completas cuando solo se necesitan KPIs.
- Índice de autenticación práctica en `mozos` para lookup por `DNI` y nombre normalizado.
- Política clara de operación legacy: Mongo como fuente de verdad, JSON solo para migración o export controlada.

---

## 5. Documentación y Runbooks

### 5.1 Estado de la documentación frente al código actual

- `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` está cerca del código, pero contiene al menos dos desalineaciones importantes:
  - afirma que `GET /dashboard` sirve `index.html`, cuando `index.js` sirve `public/dashboard/lasgambusinas-dashboard.html`;
  - afirma que `pedidoRoutes` no está montado, aunque `index.js` sí incluye `pedidoRoutes` en el array `routes`.
- Ese mismo documento describe la sincronización JSON legacy como “opcional”, pero el arranque actual en `database.js` sigue importando `data/*.json` y varios repositorios siguen escribiendo JSON en cada mutación.
- `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md` está bastante alineado en rutas del dashboard, pero necesita aclarar mejor el estado real del escalado Socket.io: la dependencia del Redis adapter existe, pero no está activa en el runtime.
- El archivo solicitado en el prompt como `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES-2.md` no existe en el repositorio auditado. El documento vigente revisado fue `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.
- `docs/automated/REPORTE_BACKEND_AUTOMATICO.md` previo quedó stale: afirmaba que no existían documentos que sí están presentes hoy.

### 5.2 Flujos importantes insuficientemente documentados

- El comportamiento real de seguridad de `/api` y la ausencia de protección homogénea por router.
- La diferencia entre tokens de dashboard, `App Mozos` y `App Cocina`, y el hecho de que hoy comparten el mismo secreto JWT.
- El riesgo operacional del modo JSON legacy y cuándo se debe considerar apagado o soportado.
- Las limitaciones reales de Socket.io en despliegue multiinstancia sin Redis adapter.
- Los criterios de inclusión de comandas en cierre de caja restaurante y su impacto sobre ventas pendientes.

### 5.3 Propuestas concretas de mejora documental

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Punto de Entrada (index.js)` y `Dashboard Administrativo`.  
Qué falta o está mal: la ruta `GET /dashboard` y el montaje de `pedidoRoutes` ya no coinciden con lo descrito.  
Contenido propuesto: explicar que `GET /dashboard` sirve `public/dashboard/lasgambusinas-dashboard.html`, que `GET /` sigue siendo el dashboard multi-página, y que `pedidoRoutes` sí está montado bajo `/api`. Añadir una nota breve sobre qué consumidores usan cada interfaz web y cuál es el nivel real de protección actual.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Variables de Entorno y Despliegue`.  
Qué falta o está mal: faltan variables y supuestos operativos clave para Redis, observabilidad, backups, probes y modo legacy.  
Contenido propuesto: ampliar la matriz con `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_PREFIX`, `APP_VERSION`, `IP`, `SENTRY_DSN`, variables de backup y el alcance real de `SKIP_JSON_IMPORT`. Incluir 1 o 2 ejemplos de entornos mínimos, uno local y otro productivo.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Redis Cache`, `Health Check y Métricas` y `Problemas Resueltos y Pendientes`.  
Qué falta o está mal: no se documenta suficientemente el bug de invalidación del menú, la caché local de cálculos monetarios ni que `/health` hoy es demasiado profundo para ser probe liviano.  
Contenido propuesto: describir qué claves existen, cómo se invalidan, qué ventanas de stale se aceptan y por qué conviene separar `livez`, `readyz` y `deep-health`. Agregar una nota explícita sobre fallback a memoria cuando Redis no está disponible.

Documento objetivo: `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.  
Sección a actualizar o crear: `Arquitectura Socket.io` y `Escalabilidad`.  
Qué falta o está mal: el diagrama menciona o sugiere capacidad multiinstancia, pero el runtime actual no configura el Redis adapter.  
Contenido propuesto: declarar el estado real como “dependencia disponible, no activa en producción según el código auditado”, explicar la consecuencia sobre cluster/replicas y mostrar el flujo actual de broadcast por namespaces con esa limitación.

Documento objetivo: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`.  
Sección a actualizar o crear: `Runbook Operativo Backend`.  
Qué falta o está mal: hoy no existe un bloque único para deploy, rollback, falla de Mongo, falla de Redis, degradación de Socket.io y verificación post-deploy.  
Contenido propuesto: añadir un runbook compacto dentro del documento existente, con pasos de verificación, síntomas esperados, criterio de rollback y acciones inmediatas por incidente. Incluir ejemplos concretos de qué revisar si Redis cae y la aplicación quedó en fallback a memoria.

Documento objetivo: `docs/automated/DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md`.  
Sección a actualizar o crear: `Flujo de caja, bouchers y cierres`.  
Qué falta o está mal: el documento necesita reflejar que el cierre de restaurante hoy toma comandas no incluidas en cierres previos, no necesariamente solo pagadas.  
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
Idea: nuevos endpoints de tiempos de preparación, rendimiento por mozo, platos por franja horaria, rotación de mesas, abandono de comandas y eficiencia de cocina.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.4 Observabilidad madura con trazabilidad de punta a punta
Idea: logs estructurados consistentes, `correlationId` sin globals, métricas Prometheus por endpoint/evento y alertas sobre SLO de caja, comanda y websocket.  
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

### 6.7 Escalado web y tiempo real listo para múltiples instancias
Idea: completar Redis adapter para Socket.io, eliminar dependencia de `global.*`, y documentar topología soportada con smoke tests de despliegue.  
Impacto estimado: medio-alto.  
Esfuerzo estimado: medio.

---

## 7. PRs sugeridos a partir de este reporte

- PR 1: `security: proteger /api con autenticación obligatoria y RBAC real`. Alcance: middleware global, permisos por endpoint y retiro de `usuarioRol`, `x-admin` y `x-user-id` como fuente de autorización.
- PR 2: `security: endurecer autenticación y sesiones administrativas`. Alcance: eliminación de credenciales por defecto, secrets fail-fast, separación de tokens por aplicación y cierre del endpoint `GET /api/mozos/test/admin`.
- PR 3: `security: handshake JWT y autorización de rooms en Socket.io`. Alcance: auth por namespace, validación de claims, rate limiting por evento y contrato explícito de conexión.
- PR 4: `core: transacciones de pago y cierre de caja`. Alcance: atomicidad entre boucher, comandas, pedido, mesa y cierre restaurante, más reconciliación segura.
- PR 5: `core: invariantes de estados y recálculo monetario`. Alcance: convergencia única de estados, prohibición de GET con side effects, recálculo consistente tras anulación/eliminación y unicidad de pedido abierto por mesa.
- PR 6: `performance: paginación, índices y caché`. Alcance: paginación real en listados pesados, índices en `boucher` y auth de `mozos`, corrección de invalidación de caché y división de `health` en niveles.
- PR 7: `docs: alinear documentación técnica y runbooks`. Alcance: actualizar `BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` y `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES.md` con rutas reales, variables de entorno, límites de escalado y runbook operativo.
