# Reporte Automático del Backend – Las Gambusinas (2026-03-14)

## 1. Resumen Ejecutivo

- Se detectó una brecha crítica de seguridad: la mayoría de endpoints operativos de `/api` no exige autenticación/autorización centralizada, y además existen flujos que confían en roles o IDs enviados por el cliente.
- Se confirmó riesgo alto de acceso no autorizado en tiempo real: los namespaces Socket.io (`/cocina`, `/mozos`, `/admin`) no aplican autenticación por socket ni autorización de rooms.
- Hay inconsistencias de lógica de negocio que impactan caja y operación diaria: estados de comanda contradictorios, endpoint que altera `IsActive` en lugar de `status`, y cierres/cobros sin transacciones.
- Existen cuellos de rendimiento relevantes: sincronización JSON bloqueante (`writeFileSync`), endpoints sin paginación, `/health` con consultas pesadas y falta de índices específicos en bouchers/reportería.
- La documentación técnica está desalineada con el código actual y faltan runbooks clave; además no existen en el repo los archivos `BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` ni `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES-2.md`.

---

## 2. Seguridad y Vulnerabilidades
### 2.1 Issues críticos / altos
#### 2.1.1 Endpoints sensibles sin auth global obligatoria
Severidad: crítica.  
Área afectada: API REST (mesas, comandas, bouchers, auditoría, reportes, configuración, etc.).  
Qué está mal: el backend monta routers en `/api` sin middleware global de autenticación; solo rutas puntuales (como gestión de roles) usan `adminAuth`.  
Riesgo: creación/edición/eliminación de recursos críticos por usuarios no autenticados o con permisos insuficientes.  
Recomendación: aplicar autenticación obligatoria por defecto en `/api` y autorización por rol/permiso por endpoint (modelo deny-by-default).

#### 2.1.2 Credenciales administrativas por defecto y reimposición en arranque
Severidad: crítica.  
Área afectada: bootstrap de usuarios y autenticación.  
Qué está mal: se crea/normaliza usuario `admin` con DNI `12345678` durante el arranque, y además existen credenciales equivalentes en `data/mozos.json`.  
Riesgo: toma de control administrativo predecible y persistente entre reinicios.  
Recomendación: eliminar credenciales estáticas del arranque; implementar onboarding seguro de primer admin, secreto fuerte rotado y política de cambio obligatorio.

#### 2.1.3 Autorización basada en datos manipulables del cliente
Severidad: crítica.  
Área afectada: descuentos, cambios de estado y configuración.  
Qué está mal: múltiples flujos confían en `usuarioRol`, `x-user-id`, `x-admin` o `usuarioAdmin` provenientes de body/query/headers para autorizar acciones.  
Riesgo: escalamiento de privilegios por falsificación de headers/body.  
Recomendación: derivar identidad y permisos únicamente desde JWT validado en servidor; bloquear rutas que dependan de campos de autorización enviados por cliente.

#### 2.1.4 WebSocket sin autenticación/autorización de conexión ni rooms
Severidad: crítica.  
Área afectada: namespaces `/cocina`, `/mozos`, `/admin`.  
Qué está mal: no hay middleware de auth en namespaces y los eventos `join-fecha` / `join-mesa` aceptan suscripción sin validar pertenencia ni rol.  
Riesgo: escucha no autorizada de datos operativos/financieros en tiempo real y suscripción a rooms ajenas.  
Recomendación: exigir JWT en handshake, validar claims por app/rol, autorizar join por mesa/área/fecha y aplicar límites por evento.

#### 2.1.5 Secretos y defaults inseguros en JWT/infra
Severidad: alta.  
Área afectada: middleware JWT y despliegue.  
Qué está mal: existe fallback hardcodeado para `JWT_SECRET` y valores por defecto débiles (`changeme`) en archivos de entorno/compose.  
Riesgo: emisión/forja de tokens si despliegue queda con configuración insegura.  
Recomendación: fail-fast si falta secreto, prohibir defaults inseguros en producción y formalizar rotación de secretos.

#### 2.1.6 Exposición de PII y datos operativos por rutas abiertas
Severidad: alta.  
Área afectada: mozos, auditoría, reportes y datasets versionados.  
Qué está mal: rutas con datos sensibles están accesibles sin control robusto y hay datasets con información personal en `data/*.json`.  
Riesgo: exfiltración de datos personales y operativos (cumplimiento y reputación).  
Recomendación: endurecer controles de acceso por rol, reducir campos de respuesta y remover/anonimizar datos sensibles del repositorio.

#### 2.1.7 Falta de rate limiting real en autenticación y endpoints críticos
Severidad: alta.  
Área afectada: autenticación y APIs mutantes.  
Qué está mal: `express-rate-limit` existe en dependencias, pero no se aplica en el arranque de Express.  
Riesgo: fuerza bruta, abuso de API, degradación por tráfico automatizado.  
Recomendación: aplicar rate limit por endpoint/IP/credencial, lockout progresivo y alertas de intentos repetidos.

### 2.2 Issues medios / bajos
#### 2.2.1 Fuga de detalles internos en errores y logs
Severidad: media.  
Área afectada: manejo de errores y observabilidad.  
Qué está mal: hay respuestas que devuelven `error.message` en 5xx y logs que imprimen cuerpos de autenticación o datos sensibles para debugging.  
Riesgo: facilita reconocimiento técnico y exposición involuntaria de credenciales/PII en logs.  
Recomendación: estandarizar errores públicos genéricos, enmascarar datos sensibles y restringir logs detallados a entornos controlados.

#### 2.2.2 Consultas regex no escapadas en entradas de usuario
Severidad: media.  
Área afectada: repositorios de áreas/clientes.  
Qué está mal: se construyen regex directamente desde input sin escaping/limitación de patrón.  
Riesgo: consultas costosas o comportamiento inesperado ante patrones maliciosos.  
Recomendación: escapar entradas para regex, limitar longitud/complejidad y preferir búsquedas normalizadas indexadas.

#### 2.2.3 Endpoints de salud y métricas demasiado verbosos para exposición pública
Severidad: media.  
Área afectada: `/health` y `/metrics`.  
Qué está mal: exponen información operativa detallada y, en `/health`, ejecutan verificaciones profundas de alto costo.  
Riesgo: reconocimiento de infraestructura y superficie de ataque ampliada.  
Recomendación: separar liveness/readiness livianos de deep-health, y restringir acceso por red interna o autenticación técnica.

### 2.3 Checklist de higiene de seguridad
- [ ] Validación de entrada consistente
- [ ] Autorización en rutas sensibles
- [ ] Manejo seguro de errores
- [ ] CORS y HTTPS configurados correctamente
- [ ] WebSockets con control de acceso / rate limiting

---

## 3. Lógica, Consistencia e Integridad de Datos
### 3.1 Hallazgos de lógica de negocio
#### 3.1.1 Endpoint de estado de comanda modifica `IsActive` en lugar de `status`
Flujo afectado: actualización de estado general de comanda.  
Impacto operativo: una operación de “estado” puede desactivar lógicamente comandas y romper listados/seguimiento.  
Cambio lógico recomendado: deprecar/corregir el endpoint para usar únicamente transiciones válidas sobre `status`.

#### 3.1.2 Reglas contradictorias para “todos los platos entregados”
Flujo afectado: transición automática de comanda durante preparación/entrega/pago.  
Impacto operativo: una función fuerza `recoger` y otra `entregado`; esto genera estados no determinísticos entre cocina, mozos y cobro.  
Cambio lógico recomendado: consolidar una sola regla de verdad y reutilizarla en todos los puntos de actualización.

#### 3.1.3 Lecturas con efectos colaterales en base de datos
Flujo afectado: consulta de comandas para pagar por mesa.  
Impacto operativo: un `GET` que muta estado dificulta auditoría, reproducibilidad e incrementa riesgo de condiciones de carrera.  
Cambio lógico recomendado: mover autocorrecciones a comandos explícitos (no en endpoints de lectura).

#### 3.1.4 Creación de comanda sin transacción entre comanda, pedido y estado de mesa
Flujo afectado: alta de comanda.  
Impacto operativo: pueden quedar comandas huérfanas de pedido o mesa desincronizada cuando falla un paso intermedio.  
Cambio lógico recomendado: usar transacción MongoDB (session) o compensaciones robustas con reintentos/idempotencia.

#### 3.1.5 Cobro (boucher + comandas + pedido) sin atomicidad
Flujo afectado: pago y facturación.  
Impacto operativo: estados parciales (boucher creado pero comandas/pedido no cerrados), riesgo de doble cobro en concurrencia.  
Cambio lógico recomendado: transacción única para cobro, guardas atómicas de “no pagado” e idempotency key por operación.

#### 3.1.6 Riesgo de múltiples pedidos abiertos por la misma mesa
Flujo afectado: agrupación de comandas por visita.  
Impacto operativo: pedidos fragmentados, descuentos/totales incorrectos y complejidad de cierre.  
Cambio lógico recomendado: índice único parcial para “pedido abierto por mesa” + upsert atómico.

#### 3.1.7 Posible desincronización `platos[]` y `cantidades[]` en updates parciales
Flujo afectado: edición de comanda.  
Impacto operativo: cantidades corridas, cálculo de totales incorrecto y auditoría inconsistente.  
Cambio lógico recomendado: bloquear updates parciales de arreglos relacionados y usar validación de esquema en escritura efectiva.

#### 3.1.8 Doble emisión Socket y room basada en fecha actual (no fecha de comanda)
Flujo afectado: actualización en vivo de comandas/platos.  
Impacto operativo: eventos duplicados o enviados a rooms incorrectas, con UI desincronizada.  
Cambio lógico recomendado: una sola capa emisora y cálculo de room siempre desde `createdAt` de la comanda.

#### 3.1.9 Cierre de caja restaurante incluye comandas no cobradas y las marca como cerradas
Flujo afectado: cierre financiero diario.  
Impacto operativo: distorsión contable y riesgo de excluir ventas pendientes de cierres posteriores.  
Cambio lógico recomendado: cerrar desde fuente de verdad de cobro (boucher/comanda pagada) y aplicar control transaccional.

### 3.2 Invariantes que el sistema debería garantizar
- `platos.length === cantidades.length` en toda escritura de comanda. Estado actual: se cumple parcialmente.
- Solo puede existir un `Pedido` abierto por mesa. Estado actual: no se garantiza.
- Si todos los platos activos están entregados, la comanda debe converger a un único estado final definido por negocio. Estado actual: no se garantiza.
- Un `GET` no debe mutar estado de dominio. Estado actual: no se garantiza.
- El cobro debe ser atómico entre boucher, comandas y pedido. Estado actual: no se garantiza.
- Una mesa `libre` no debe tener comandas activas. Estado actual: se cumple parcialmente.
- Una comanda cancelada no debe aparecer en tableros operativos. Estado actual: se cumple parcialmente.
- Los eventos Socket de un cambio deben emitirse una sola vez y al room correcto. Estado actual: se cumple parcialmente.
- El cierre de caja debe incluir solo operaciones efectivamente cobradas. Estado actual: no se garantiza.
- La autorización de acciones críticas debe provenir de identidad validada en servidor, nunca del body/header del cliente. Estado actual: no se garantiza.

---

## 4. Rendimiento y Arquitectura
### 4.1 Rutas críticas y observaciones
- Comandas (`/api/comanda*`): alta frecuencia y alto impacto operativo; existen mejoras de índices/lean, pero persisten rutas con respuestas amplias y lógica mezclada.
- Mesas (`/api/mesas*`): endpoints optimizados conviven con operaciones sin protección y flujos de estado dispersos.
- Bouchers y reportes (`/api/boucher*`, `/api/reportes/*`): agregaciones frecuentes sobre periodos con riesgo de scans al crecer volumen.
- Cierre de caja (`/api/cierreCaja*`, `/api/cierre-caja*`): lógica financiera extensa en controllers, con baja encapsulación transaccional.

### 4.2 Cuellos de botella detectados
- Sincronización JSON bloqueante: múltiples repos ejecutan `syncJsonFile` con `fs.writeFileSync` y lectura total de colección tras mutaciones.
- `/health` realiza checks profundos (agregaciones y métricas de platos) que son costosos para probes frecuentes.
- Endpoints sin paginación/límite real en listados grandes (`comandas`, `bouchers`, auditoría/reporte completo, pedidos con filtro en memoria).
- Boucher/reportería sin índices explícitos para combinaciones frecuentes como `isActive + fechaPago` y mesa+fecha.
- Controllers con lógica de negocio pesada y acoplamiento a `global.emit...`, lo que dificulta escalar y testear.

### 4.3 Uso de Redis y caché
- Uso actual: caché de comandas activas y reportes con fallback a memoria.
- Aprovechamiento positivo: se intenta reducir latencia en lecturas repetidas y hay invalidación en cambios críticos de comanda.
- Riesgos: invalidación incompleta en algunos reportes, dependencia de TTL para consistencia y fallback en memoria sin límites de capacidad explícitos.
- Mejora sugerida: política de caché por dominio (clave, TTL, evento de invalidación, owner) y métricas de hit/miss por endpoint.

### 4.4 Mejoras realistas recomendadas (stack actual)
- Añadir índices concretos:
- `boucher`: `isActive + fechaPago`, `mesa + isActive + fechaPago`, `cliente + fechaPago` para analítica.
- `auditoria`: `timestamp + entidadTipo + accion` para reportes operativos.
- Separar responsabilidades:
- Controllers delgados; mover reglas de negocio y transacciones a capa de servicio.
- Socket emitters desacoplados del flujo HTTP por eventos de dominio.
- Establecer límites de respuesta:
- Paginación obligatoria con `limit` máximo en listados y reportes.
- Respuestas resumidas por defecto y detalle bajo demanda.
- Optimizar salud/observabilidad:
- `liveness` y `readiness` livianos; `deep-health` bajo endpoint protegido.

---

## 5. Documentación y Runbooks
### 5.1 Estado de documentación vs código
- No existen en el repositorio los documentos `BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md` ni `DIAGRAMA_FLUJO_DATOS_Y_FUNCIONES-2.md`.
- `docs/OPTIMIZACION_MONGODB_FASE_A1.md` está parcialmente desactualizado: incluye secciones históricas y supuestos de conexión/configuración no reflejados en el `database.js` vigente.
- `FASE6_DASHBOARD_PLAN.md` afirma ausencias de páginas/funcionalidades que hoy sí existen en `public/`.
- `public/PENCIL_NEW_DESIGN_CONTEXT.md` lista endpoints de reportes no alineados con los endpoints backend reales actuales.
- `docs/SISTEMA-NOTIFICACIONES.md` describe la capa UX pero no deja explícito que backend de mensajes/notificaciones está en memoria simulada.

### 5.2 Carencias operativas detectadas
- Falta una guía de setup local unificada para backend (variables de entorno mínimas, dependencias, orden de arranque).
- Faltan runbooks consolidados para despliegue, rollback, backup/restore y manejo de incidentes (Mongo/Redis/Socket.io caído).
- No hay documento único de contrato de eventos Socket.io (namespaces, rooms, payloads, compatibilidad y deprecaciones).

### 5.3 Propuestas de mejora documental
Documento objetivo: `docs/OPTIMIZACION_MONGODB_FASE_A1.md`.  
Sección a actualizar/crear: “Estado validado en código (actual)”.  
Qué falta o está mal: mezcla estado implementado con propuestas históricas.  
Contenido propuesto: separar explícitamente “implementado” vs “pendiente”, referenciar rutas reales de consulta y agregar una tabla de métricas de aceptación por endpoint (`p95`, `docsExamined`, tamaño de payload).

Documento objetivo: `FASE6_DASHBOARD_PLAN.md`.  
Sección a actualizar/crear: “Matriz de endpoints backend vigentes”.  
Qué falta o está mal: hay rutas y supuestos que no coinciden con el backend actual.  
Contenido propuesto: mantener una tabla source-of-truth con endpoint, método, auth requerida y consumidor principal; incluir fecha de validación y dueño técnico.

Documento objetivo: `public/PENCIL_NEW_DESIGN_CONTEXT.md`.  
Sección a actualizar/crear: “Contrato API real para Reportes”.  
Qué falta o está mal: endpoints de reportes de diseño no reflejan el código actual.  
Contenido propuesto: mapear cada visual del dashboard a endpoints reales existentes, con intención de uso y un ejemplo breve de entrada/salida esperada.

Documento objetivo: `docs/SISTEMA-NOTIFICACIONES.md`.  
Sección a actualizar/crear: “Limitaciones backend actuales”.  
Qué falta o está mal: no explicita persistencia simulada en memoria para mensajes/notificaciones.  
Contenido propuesto: aclarar que los datos no sobreviven reinicios ni escalan multi-instancia, e incluir plan incremental para persistencia en Mongo/Redis.

Documento objetivo: documento existente más cercano recomendado `docs/OPTIMIZACION_MONGODB_FASE_A1.md` (sin duplicar en exceso).  
Sección a actualizar/crear: “Runbook Operativo Backend”.  
Qué falta o está mal: no hay guía operativa centralizada para incidentes y recuperación.  
Contenido propuesto: incluir pasos concretos para deploy/rollback, verificación post-deploy, fallo de Mongo, fallo de Redis y degradación de Socket.io, con criterios de éxito y rollback.

---

## 6. Oportunidades de Alto Impacto (“producto 10 000 USD”)
### 6.1 Data API de analítica avanzada por operación
Idea: endpoints de analítica por franja horaria, mozo, plato, área y rotación de mesa con filtros y comparativas día/semana/mes.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.2 Motor de KPIs en tiempo real con snapshots consistentes
Idea: consolidar eventos de comandas/bouchers en un servicio de métricas y publicar KPIs por WebSocket con contratos versionados.  
Impacto estimado: alto.  
Esfuerzo estimado: medio-alto.

### 6.3 Seguridad por capas (REST + Socket)
Idea: auth obligatoria en `/api`, RBAC estricto por permiso, handshake JWT para sockets, autorización de rooms y rate limiting por evento.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.4 Cobro y cierre con garantías transaccionales e idempotencia
Idea: encapsular cobro/cierre en casos de uso transaccionales con idempotency key y reconciliación automática.  
Impacto estimado: alto.  
Esfuerzo estimado: alto.

### 6.5 Observabilidad productiva
Idea: logs estructurados obligatorios con correlation ID end-to-end, métricas Prometheus por endpoint/evento y alertas por SLO.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

### 6.6 Gobernanza de caché por dominio
Idea: catálogo de claves, TTL e invalidaciones por evento de negocio (no solo expiración temporal).  
Impacto estimado: medio-alto.  
Esfuerzo estimado: medio.

### 6.7 Catálogo de invariantes y pruebas de regresión
Idea: suite de tests de invariantes críticos (estado mesa/comanda, atomicidad de cobro, cierres) ejecutada en CI diaria.  
Impacto estimado: alto.  
Esfuerzo estimado: medio.

---

## 7. PRs sugeridos a partir de este reporte
- PR 1: “security: auth y autorización obligatoria en rutas REST críticas”. Alcance: middleware global, hardening de permisos por endpoint, retiro de `x-admin`/`usuarioRol` del flujo de autorización.
- PR 2: “security: hardening de Socket.io”. Alcance: JWT en handshake, autorización de `join-mesa`/`join-fecha`, rate limit por evento y auditoría de conexiones.
- PR 3: “core: transacciones de cobro/cierre + idempotencia”. Alcance: sesión Mongo para boucher/comandas/pedido/cierre, control de concurrencia y rollback seguro.
- PR 4: “performance: paginación e índices de reportería financiera”. Alcance: límites obligatorios, índices en `boucher` y `auditoria`, optimización de `/health`.
- PR 5: “docs: actualización de documentación técnica y runbooks”. Alcance: alinear docs existentes con código vigente, agregar guía operativa de incidentes y setup/env de backend.
