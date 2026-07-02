# Plan: Rendimiento de cocineros en tiempo real (`cocineros.html`)

**Versión:** 1.0  
**Fecha:** Julio 2026  
**Proyecto:** Dashboard (`backend-gambusinas/public/cocineros.html`) + App Cocina (`appcocina`) + API  
**Estado:** Planificación — sin implementar  
**Relacionado con:** `PLAN_SELECTOR_COCINEROS_VER_COCINA_COMPLETO.md`, Ver Cocina Completo (`CocinaMonitorCompleto.jsx`)

---

## Resumen ejecutivo

Extender **`cocineros.html`** con una vista de **rendimiento en tiempo real** alineada con **Ver Cocina Completo**: mismos cocineros, mismos platos en curso y métricas históricas del turno basadas en datos reales del KDS (`procesandoPor`, `procesadoPor`, `tiempos`).

| Objetivo | Descripción |
|----------|-------------|
| **Vista en vivo** | Panel estilo dashboard (fondo oscuro, gold, cards) con platos activos por cocinero y temporizadores que avanzan cada segundo |
| **Tiempo de preparación** | Desde que el cocinero **toma** el plato hasta que queda en **`recoger`** (finalización en KDS / supervisor) |
| **Ranking y KPIs** | Corregir y enriquecer métricas por cocinero: platos del período, SLA, platos más cocinados |
| **Fuente de verdad** | Comandas + campos ya existentes; sin duplicar lógica de Ver Cocina Completo |

---

## 1. Contexto — qué existe hoy

### 1.1 `cocineros.html` (dashboard)

| Elemento | Estado actual |
|----------|---------------|
| Tabs | Cocineros · Zonas · Personalizar vista |
| KPIs header | Total cocineros, activos, conectados hoy, platos hoy, % SLA |
| Ranking | `GET /api/cocineros/metricas/todos` (permiso `ver-reportes`) |
| Detalle cocinero | `GET /api/cocineros/:id/metricas` + modal con platos top |
| Filtro período | Hoy · 7 días · 30 días · personalizado |
| Socket.io | Cargado (`socket.io.js`) pero **no usado** para métricas |
| Estilo | Tailwind + Alpine, cards `#1a1a28`, acentos gold |

### 1.2 Ver Cocina Completo (appcocina)

| Elemento | Estado actual |
|----------|---------------|
| Lista cocineros | `GET /api/cocina/cocineros` |
| Platos visibles | `estado ∈ ['pedido','en_espera']` + `procesandoPor.cocineroId` |
| Agrupación | Por cocinero → plato → mesas → timers individuales |
| Timer en UI | `now - procesandoPor.timestamp` (tick cada 1 s) |
| Permiso | `ver-cocina-completo` |

### 1.3 Eventos que ya registran datos

| Acción | Endpoint / flujo | Campos escritos |
|--------|------------------|-----------------|
| Cocinero toma plato | `PUT .../plato/:platoId/procesando` | `procesandoPor.{cocineroId,nombre,alias,timestamp}` |
| Cocinero libera plato | `DELETE .../procesando` | Limpia `procesandoPor` |
| Cocinero/supervisor finaliza | `PUT .../finalizar` o `PUT .../estado` → `recoger` | `tiempos.recoger`, `procesadoPor`, limpia `procesandoPor` |
| Plato sale de cocina | `PUT .../salir-cocina` | `tiempos.salio`, estado `salio` |
| Entrega mozo | estado `entregado` | `tiempos.entregado` |
| Contador acumulado | `incrementarPlatosPreparados` | `configCocinero.estadisticas.platosPreparados` (+1) |
| Socket | `emitPlatoProcesando`, `emitPlatoActualizado`, `emitPlatoLiberado` | Rooms cocina / zonas |

### 1.4 Modelo de plato relevante (`comanda.model.js`)

```javascript
procesandoPor: { cocineroId, nombre, alias, timestamp }  // en curso
procesadoPor:  { cocineroId, nombre, alias, timestamp }  // al finalizar → recoger
tiempos: { en_espera, recoger, salio, entregado, ... }
estado: 'pendiente' | 'pedido' | 'en_espera' | 'recoger' | 'salio' | 'entregado' | ...
```

---

## 2. Problemas detectados (deuda a resolver en este plan)

Estos gaps explican por qué las métricas actuales **no reflejan** el rendimiento real por cocinero ni lo que muestra Ver Cocina Completo.

| # | Problema | Impacto |
|---|----------|---------|
| 1 | `calcularMetricasRendimiento(usuarioId)` **no filtra por cocinero** | Todas las métricas por cocinero son iguales (global del local) |
| 2 | `obtenerPlatosTopPorCocinero(usuarioId)` **no filtra por cocinero** | Top platos es global, no por persona |
| 3 | Tiempo calculado: `en_espera → recoger` | Incluye cola **antes** de tomar el plato; no mide tiempo del cocinero |
| 4 | Ranking UI espera `item.tiempoPromedio` / `item.totalPlatos` planos; API devuelve `item.metricas.*` | Ranking puede mostrar 0 o datos incorrectos |
| 5 | KPI "Platos Hoy" usa `estadisticas.platosPreparados` (contador **acumulado**, sin reset diario) | Etiqueta "Hoy" engañosa |
| 6 | Supervisor finaliza plato ajeno: `procesadoPor` usa `cocineroId` del request (a veces el supervisor) | Atribución incorrecta en métricas |
| 7 | Sin endpoint de **snapshot en vivo** ni eventos socket para dashboard | Solo refresh manual |

---

## 3. Definición de métricas

### 3.1 Métricas principales (las que pide el negocio)

| Métrica | Fórmula | Uso |
|---------|---------|-----|
| **Tiempo de preparación (cocinero)** | `tiempos.recoger - procesandoPor.timestamp` | Ranking, SLA por cocinero, tiempo hasta que supervisor/cocinero marca listo |
| **Tiempo en cola (antes de tomar)** | `procesandoPor.timestamp - tiempos.en_espera` | Diagnóstico: demora antes de asignación |
| **Tiempo total cocina** | `tiempos.recoger - tiempos.en_espera` | SLA operativo global (métrica actual, renombrar en UI) |
| **Tiempo hasta salida pass** | `tiempos.salio - procesandoPor.timestamp` | Opcional fase 2 |
| **Platos finalizados (período)** | Count platos con `procesadoPor.cocineroId = X` y `tiempos.recoger` en rango | KPI y ranking |
| **Platos en curso (ahora)** | Count platos con `procesandoPor.cocineroId = X` y estado activo | Vista en vivo |
| **Platos más cocinados** | Group by `platoId` donde `procesadoPor.cocineroId = X` | Modal / panel detalle |

### 3.2 SLA configurable

- Default: **15 min** (ya usado en repository y `configCocinero.configTableroKDS.tiempoAmarillo`).
- `% Dentro SLA` = platos con `tiempoPreparacionCocinero ≤ SLA` / total platos del cocinero en el período.
- Mostrar SLA del cocinero si tiene config KDS personalizada; si no, SLA global (15 min).

### 3.3 Atribución cuando interviene el supervisor

Al finalizar un plato tomado por otro cocinero:

| Campo | Valor recomendado |
|-------|-------------------|
| `procesadoPor` | Cocinero que **tomó** el plato (`procesandoPor` antes de limpiar) |
| `finalizadoPor` (nuevo, opcional) | `{ usuarioId, nombre, rol: 'supervisor', timestamp }` si quien ejecuta ≠ cocinero original |
| `incrementarPlatosPreparados` | Cocinero **original**, no el supervisor |

Esto alinea métricas con Ver Cocina Completo (el plato aparecía bajo ese cocinero).

### 3.4 Platos sin `procesandoPor` (edge cases)

| Caso | Tratamiento |
|------|-------------|
| Plato pasa a `recoger` sin haber sido tomado | Excluir de métricas de cocinero o bucket "Sin asignar" |
| Reversión `recoger → en_espera` | Excluir de agregados o marcar `anuladoMetrica: true` en auditoría |
| Plato liberado y retomado por otro | Usar último `procesandoPor` antes de `recoger` (o guardar historial — fase 3) |

---

## 4. Registro de datos — qué capturar y dónde

**No se requiere nueva colección en fase 1** si se corrigen agregaciones sobre comandas. Opcional fase 3: `rendimientoCocineroEventos` para historial de liberaciones/reasignaciones.

### 4.1 Eventos que disparan actualización de métricas

| Evento socket existente | Acción en dashboard |
|-------------------------|---------------------|
| `plato-procesando` / `plato-actualizado` | Actualizar plato en curso + timer |
| `plato-liberado` | Quitar de en curso |
| Estado → `recoger` | Mover a "finalizados del turno", recalcular KPIs |
| `config-cocinero-actualizada` | Refrescar alias/foto/SLA |

### 4.2 Campos mínimos por plato en snapshot en vivo

Reutilizar la misma forma que Ver Cocina Completo:

```javascript
{
  comandaId, platoId, platoNombre, cantidad, mesas[],
  cocineroId, cocineroNombre, cocineroAlias, fotoUrl,
  procesandoDesde: ISO timestamp,
  segundosTranscurridos: number,  // calculado server-side o client-side
  nivelAlerta: 'ok' | 'amarillo' | 'rojo',  // según config KDS del cocinero
  complementos, observaciones
}
```

---

## 5. Backend — cambios propuestos

### 5.1 Corregir repository (`cocineros.repository.js`)

**`calcularMetricasRendimiento(usuarioId, desde, hasta)`**

```javascript
$match: {
  'platos.procesadoPor.cocineroId': ObjectId(usuarioId),
  'platos.tiempos.recoger': { $gte: desde, $lte: hasta },
  'platos.eliminado': { $ne: true },
  'platos.anulado': { $ne: true }
}
// tiempoPreparacion = recoger - procesadoPor.timestamp
//   (o recoger - procesandoPor preservado si se guarda atribución)
```

Devolver además:

- `tiempoPromedioCola` (opcional)
- `platosEnCurso` (count con `procesandoPor.cocineroId` y estado activo, sin filtro de fecha)
- `finalizadosPorSupervisor` (count si existe `finalizadoPor`)

**`obtenerPlatosTopPorCocinero`**

- Mismo filtro por `procesadoPor.cocineroId`.
- Ordenar por `cantidad` descendente.
- Incluir `tiempoPromedioPreparacion` por plato.

**`obtenerMetricasTodosCocineros`**

- Aplanar respuesta para UI **o** documentar contrato anidado; recomendado aplanar:

```javascript
{
  usuarioId, nombre, alias, fotoUrl,
  totalPlatos, tiempoPromedio, tiempoMin, tiempoMax,
  porcentajeDentroSLA, platosEnCurso
}
```

### 5.2 Nuevos endpoints

| Método | Ruta | Permiso | Descripción |
|--------|------|---------|-------------|
| `GET` | `/api/cocineros/rendimiento/en-vivo` | `ver-reportes` o `ver-cocina-completo` | Snapshot: cocineros + platos en curso + resumen del turno (hoy) |
| `GET` | `/api/cocineros/:id/rendimiento/en-vivo` | propio cocinero \| `ver-reportes` | Detalle un cocinero |
| `GET` | `/api/cocineros/rendimiento/resumen-turno` | `ver-reportes` | KPIs agregados solo del día (para header) |

Query opcional: `?zonaId=` para filtrar por zona.

Implementación de en-vivo: reutilizar pipeline de comandas del día con mismos criterios que `useCocinaMonitorFilter` (sin duplicar en frontend).

### 5.3 Fix en `procesamientoController` (finalizar plato)

Pseudológica:

```javascript
const cocineroAtribuido = plato.procesandoPor?.cocineroId || cocineroId;
const esSupervisorOverride = cocineroAtribuido.toString() !== cocineroId;
procesadoPor = await getCocineroInfo(cocineroAtribuido);
if (esSupervisorOverride) finalizadoPor = await getSupervisorInfo(cocineroId);
incrementarPlatosPreparados(cocineroAtribuido);
```

Aplicar la misma regla en `comandaController` al cambiar estado a `recoger`.

### 5.4 Socket — room dashboard

| Evento nuevo | Room | Payload |
|--------------|------|---------|
| `join-dashboard-cocineros` | `dashboard-cocineros` | — |
| `rendimiento-cocinero-actualizado` | `dashboard-cocineros` | `{ tipo: 'plato_tomado'|'plato_finalizado'|'plato_liberado', cocineroId, resumen? }` |

Emitir desde handlers existentes de plato (mínimo diff: wrapper después de `emitPlatoActualizado`).

### 5.5 Índices MongoDB (recomendado)

```javascript
// comandas
{ 'platos.procesadoPor.cocineroId': 1, 'platos.tiempos.recoger': -1 }
{ 'platos.procesandoPor.cocineroId': 1, 'platos.estado': 1 }
```

---

## 6. UI — `cocineros.html`

### 6.1 Nuevo tab: **Rendimiento en vivo**

Ubicación: cuarto tab junto a Cocineros · Zonas · Personalizar vista.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Gestión de Cocina                                                          │
│  [ Cocineros ] [ Zonas ] [ Personalizar ] [ 📊 Rendimiento en vivo ]       │
├─────────────────────────────────────────────────────────────────────────────┤
│  KPIs turno:  En curso: 12  │  Finalizados hoy: 87  │  SLA equipo: 82%    │
│  Filtro: [ Todos ▼ ] [ Hoy ▼ ]                    🔄 Auto-actualizar ● ON  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─ Juan P. ──────────────────────── 3 platos ── ⏱ prom 11.2 min ─────┐ │
│  │  [LOMO SALTADO ×2]  M12,M14     1- 08:45  2- 04:12                    │ │
│  │  [AJÍ DE GALLINA]   M7          1- 02:03                              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│  ┌─ María L. ─────────────────────── 1 plato ─── ⏱ prom 14.1 min ───────┐ │
│  │  ...                                                                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  Ranking turno (misma data que tab Cocineros, métrica corregida)           │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Estilo visual (coherente con dashboard existente)

| Elemento | Especificación |
|----------|----------------|
| Fondo página | `bg-bg-primary` (#0a0a0f) — ya existente |
| Cards cocinero | `bg-bg-card`, borde `gold/25`, hover `gold/40` |
| Nombre cocinero | Texto gold o `text-st-pedido`, avatar `fotoUrl` circular |
| Plato en curso | Nombre grande, mesas en chips (`st-libre` / `st-esperando`) |
| Timers | Columna derecha numerada `1- MM:SS`, colores según alerta KDS |
| Badge URGENTE | Si comanda/plato prioritario (misma regla que monitor) |
| Animación | `animate-pulse` solo en timer rojo (como `kdspulse` en appcocina) |

**Opcional fase 2:** modo compacto inspirado en `CocineroPlatoCard` (#1a0f1f + borde neón) como toggle "Vista KDS".

### 6.3 Comportamiento Alpine (`cocinerosApp`)

Nuevas propiedades:

```javascript
activeTab: '...' | 'rendimiento',
rendimientoEnVivo: { cocineros: [], resumen: {} },
rendimientoTick: 0,           // setInterval 1s para timers
socketRendimiento: null,
autoRefreshRendimiento: true,
filtroCocineroRendimiento: '', // '' = todos
```

Métodos:

- `cargarRendimientoEnVivo()` → `GET /api/cocineros/rendimiento/en-vivo`
- `initSocketRendimiento()` → join room + listeners
- `actualizarTimerLocal()` → incrementar segundos sin re-fetch cada segundo
- Al cambiar tab a `rendimiento`: cargar + conectar socket; al salir: opcional leave room

### 6.4 Mejoras al tab **Cocineros** existente (misma entrega)

| Cambio | Detalle |
|--------|---------|
| Normalizar ranking | Mapear `item.metricas` → campos planos en `cargarMetricas()` |
| KPI Platos Hoy | Usar suma de `totalPlatos` del ranking (hoy) o endpoint resumen-turno |
| Panel detalle | Mostrar `platosTop` al seleccionar cocinero (ya existe modal; cablear si falta) |
| Tooltips | Distinguir "Tiempo cocinero" vs "Tiempo total cocina" |

---

## 7. Integración con Ver Cocina Completo

| Aspecto | Estrategia |
|---------|------------|
| Misma lista de cocineros | `GET /api/cocina/cocineros` en app; `GET /api/cocineros` en dashboard — unificar campos (`fotoUrl`, `alias`) |
| Mismo criterio plato en curso | Extraer función compartida en backend: `esPlatoEnCursoCocinero(plato)` |
| Timers | Misma fórmula: `Date.now() - procesandoPor.timestamp` |
| Agrupación | Backend devuelve pre-agrupado por cocinero → plato → instancias timer |
| Permisos | Encargado usa dashboard (`ver-reportes`); monitor cocina puede seguir en app |

No duplicar lógica de agrupación en Alpine: el endpoint en-vivo devuelve estructura lista para pintar.

---

## 8. Permisos y seguridad

| Rol / permiso | Tab Cocineros config | Métricas históricas | Rendimiento en vivo |
|---------------|----------------------|---------------------|---------------------|
| Admin | ✓ | ✓ | ✓ |
| `ver-reportes` | ✓ | ✓ | ✓ |
| `ver-cocina-completo` | — | — | ✓ (solo lectura en vivo) |
| Cocinero (propio) | — | ✓ solo su ID | ✓ solo su bloque |

---

## 9. Fases de implementación

### Fase 1 — Datos correctos (crítico, ~2–3 días)

1. Corregir `calcularMetricasRendimiento` y `obtenerPlatosTopPorCocinero` (filtro por cocinero + métrica cocinero).
2. Fix atribución supervisor en `finalizar` / `estado → recoger`.
3. Aplanar respuesta de `metricas/todos` y fix normalización en `cocineros.html`.
4. Corregir KPI "Platos Hoy".
5. Tests de agregación con fixtures (2 cocineros, platos cruzados).

### Fase 2 — Vista en vivo (~3–4 días)

1. Endpoint `GET /api/cocineros/rendimiento/en-vivo`.
2. Tab "Rendimiento en vivo" en `cocineros.html`.
3. Socket room `dashboard-cocineros` + eventos incrementales.
4. Tick local 1 s para timers.
5. Selector filtro por cocinero (pills como Ver Cocina Completo).

### Fase 3 — Profundidad (~2 días, opcional)

1. Campo `finalizadoPor` + métrica "intervenciones supervisor".
2. Tiempo hasta `salio` / `entregado`.
3. Gráfico barras platos top (Chart.js o CSS puro).
4. Export CSV del turno.
5. Historial de reasignaciones (`rendimientoCocineroEventos`).

---

## 10. Criterios de aceptación

| # | Criterio |
|---|----------|
| 1 | Con 2 cocineros activos, el ranking muestra **distintos** `totalPlatos` y tiempos según quién finalizó cada plato |
| 2 | Tiempo de preparación = desde **tomar** hasta **recoger**, no desde `en_espera` |
| 3 | Tab Rendimiento en vivo lista platos en curso **igual** que Ver Cocina Completo (mismos IDs, mismos timers ±1 s) |
| 4 | Al finalizar un plato en KDS, el dashboard actualiza en **< 3 s** sin botón refrescar (socket) |
| 5 | Platos top del cocinero A no incluyen platos solo cocinados por B |
| 6 | Supervisor que finaliza por otro cocinero: métrica cuenta para el cocinero que tenía el plato |
| 7 | UI mantiene estilo `cocineros.html` (dark + gold + cards Inter) |
| 8 | Sin permiso `ver-reportes`, tab en vivo no expone datos de otros cocineros |

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Comandas antiguas sin `procesadoPor` | Fallback: excluir o usar solo platos post-deploy v7.2 |
| Carga agregaciones pesadas | Índices + caché 30 s en endpoint en-vivo + invalidación por socket |
| `platosPreparados` acumulado | Deprecar para KPI diario; usar agregación por fecha |
| Divergencia app vs dashboard | Función compartida `buildSnapshotCocinero` en backend |

---

## 12. Archivos a tocar (referencia)

| Archivo | Cambio |
|---------|--------|
| `src/repository/cocineros.repository.js` | Métricas corregidas + en-vivo |
| `src/controllers/cocinerosController.js` | Nuevos endpoints rendimiento |
| `src/controllers/procesamientoController.js` | Atribución supervisor |
| `src/controllers/comandaController.js` | Misma atribución en cambio estado |
| `src/socket/events.js` | Room dashboard + emit rendimiento |
| `public/cocineros.html` | Tab en vivo + fixes ranking/KPIs |
| `appcocina/src/hooks/useCocinaMonitorFilter.js` | (Opcional) extraer criterios documentados |
| `docs/` | Este plan |

---

## 13. Ejemplo de respuesta API en-vivo

```json
{
  "success": true,
  "data": {
    "actualizadoEn": "2026-07-01T18:45:00.000Z",
    "resumen": {
      "platosEnCurso": 12,
      "finalizadosHoy": 87,
      "porcentajeDentroSLA": 82,
      "cocinerosActivos": 4
    },
    "cocineros": [
      {
        "cocineroId": "...",
        "nombre": "Juan Pérez",
        "alias": "Juan",
        "fotoUrl": "/uploads/...",
        "platosEnCurso": 3,
        "finalizadosHoy": 24,
        "tiempoPromedioHoy": 11.2,
        "bloques": [
          {
            "plato": "LOMO SALTADO",
            "platoId": 42,
            "cantidad": 2,
            "mesas": [{ "nummesa": 12, "repeticiones": 1 }, { "nummesa": 14, "repeticiones": 1 }],
            "timers": [
              { "indice": 1, "desde": "2026-07-01T18:36:15.000Z", "segundos": 525, "alerta": "rojo" },
              { "indice": 2, "desde": "2026-07-01T18:40:48.000Z", "segundos": 252, "alerta": "amarillo" }
            ]
          }
        ]
      }
    ]
  }
}
```

---

*Fin del plan v1.0*
