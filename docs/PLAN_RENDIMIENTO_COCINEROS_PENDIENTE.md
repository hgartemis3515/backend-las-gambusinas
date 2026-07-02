# Plan pendiente: Rendimiento de cocineros en `cocineros.html`

**Versión:** 1.1 (estado de implementación)  
**Fecha:** Julio 2026  
**Proyecto:** `backend-gambusinas/public/cocineros.html` + API + Socket  
**Estado:** Implementación **parcial** — backend ~70 %, frontend **0 %**  
**Plan original:** [`PLAN_RENDIMIENTO_COCINEROS_COCINEROS_HTML.md`](./PLAN_RENDIMIENTO_COCINEROS_COCINEROS_HTML.md)

---

## Resumen

La implementación se detuvo con el **backend casi listo** para métricas corregidas y endpoints de tiempo real, pero **sin cambios en `cocineros.html`** ni emisor socket completo. Este documento describe qué falta para cerrar el diseño y la funcionalidad prevista.

| Área | Avance | Bloqueante para UI |
|------|--------|-------------------|
| Métricas por cocinero (API) | ✅ Hecho | No |
| Atribución supervisor → cocinero | ✅ Hecho | No |
| Endpoints en-vivo / resumen-turno | ✅ Hecho | No |
| Socket emit rendimiento | ❌ Falta | Sí (auto-refresh) |
| Tab + vista en vivo en HTML | ❌ Falta | — |
| Fixes tab Cocineros existente | ❌ Falta | Parcial |

---

## 1. Lo que ya está implementado (backend)

### 1.1 `cocineros.repository.js`

| Función | Cambio |
|---------|--------|
| `calcularMetricasRendimiento` | Filtra por `procesadoPor.cocineroId`; tiempo = `recoger − procesadoPor.timestamp` |
| `obtenerPlatosTopPorCocinero` | Filtra por cocinero (antes era global) |
| `obtenerMetricasTodosCocineros` | Respuesta aplanada: `totalPlatos`, `tiempoPromedio`, `porcentajeDentroSLA`, `platosEnCurso`, etc. |
| `obtenerRendimientoEnVivo` | **Nuevo** — platos con `procesandoPor` + estado `pedido`/`en_espera` |
| `obtenerResumenTurno` | **Nuevo** — KPIs agregados del día |

### 1.2 `cocinerosController.js`

| Endpoint | Ruta |
|----------|------|
| En vivo | `GET /api/cocineros/rendimiento/en-vivo` |
| Resumen turno | `GET /api/cocineros/rendimiento/resumen-turno` |

Permisos: `ver-reportes`, `ver-cocina-completo` o rol admin/supervisor.

### 1.3 Atribución al cocinero que tomó el plato

- `procesamientoController.js` → `PUT .../finalizar`: `procesadoPor` = cocinero que tenía `procesandoPor`, no el supervisor.
- `comandaController.js` → `PUT .../estado` → `recoger`: misma lógica + `incrementarPlatosPreparados` al cocinero atribuido.
- Campo opcional `finalizadoPor` cuando interviene supervisor (sin schema formal en `comanda.model.js`).

### 1.4 Socket (parcial)

En `socket/events.js` solo se añadió:

- `join-dashboard-cocineros` / `leave-dashboard-cocineros` en namespace `/admin`.

**No existe** `global.emitRendimientoCocineroActualizado` (los controllers ya lo invocan, pero no hace nada).

---

## 2. Lo que falta en backend (antes o junto con la UI)

### 2.1 Completar socket — prioridad alta

```javascript
// socket/events.js — agregar
global.emitRendimientoCocineroActualizado = (payload) => {
  if (!adminNamespace?.sockets) return;
  adminNamespace.to('dashboard-cocineros').emit('rendimiento-cocinero-actualizado', {
    ...payload,
    timestamp: new Date().toISOString()
  });
};
```

Los emisores ya están cableados en:

- `procesamientoController.js` — tomar, liberar, finalizar plato
- `comandaController.js` — cambio de estado de plato

### 2.2 Enriquecer respuesta `obtenerRendimientoEnVivo` — prioridad media

La respuesta actual devuelve `bloques[]` planos (un registro por plato tomado). Para la UI tipo Ver Cocina Completo falta:

| Mejora | Descripción |
|--------|-------------|
| Agrupar por plato | Misma clave: `platoId + complementos + observaciones` |
| `timers[]` numerados | Un timer por instancia tomada (`procesandoDesde`), orden antiguo → nuevo |
| `mesas[]` consolidadas | Chips de mesa con repeticiones |
| Cocineros sin platos | Incluir cocineros activos con `bloques: []` (como selector Ver Cocina) |
| `nombre` del plato | Populate / lookup si `platos.nombre` viene vacío |
| Métricas del turno por cocinero | `finalizadosHoy`, `tiempoPromedioHoy` (reutilizar `calcularMetricasRendimiento` del día) |

Estructura objetivo para el frontend:

```json
{
  "cocineroId": "...",
  "alias": "Juan",
  "fotoUrl": "/uploads/...",
  "slaMinutos": 15,
  "platosEnCurso": 3,
  "finalizadosHoy": 24,
  "tiempoPromedioHoy": 11.2,
  "grupos": [
    {
      "plato": "LOMO SALTADO",
      "platoId": 42,
      "cantidad": 2,
      "mesas": [{ "nummesa": 12 }, { "nummesa": 14 }],
      "timers": [
        { "indice": 1, "desde": "2026-07-01T18:36:15.000Z", "segundos": 525, "alerta": "rojo" },
        { "indice": 2, "desde": "2026-07-01T18:40:48.000Z", "segundos": 252, "alerta": "amarillo" }
      ]
    }
  ]
}
```

Los `segundos` y `alerta` pueden calcularse en backend al responder, o en frontend con `tick` local (recomendado: frontend con `tick` cada 1 s, backend solo envía `desde`).

### 2.3 Schema `finalizadoPor` — prioridad baja (fase 3)

Añadir en `comanda.model.js` dentro del subdocumento `platos`:

```javascript
finalizadoPor: {
  usuarioId: ObjectId,
  nombre: String,
  rol: String,
  timestamp: Date
}
```

Permite métrica “intervenciones del supervisor” sin depender de campos no tipados.

### 2.4 Índices MongoDB — prioridad baja

```javascript
{ 'platos.procesadoPor.cocineroId': 1, 'platos.tiempos.recoger': -1 }
{ 'platos.procesandoPor.cocineroId': 1, 'platos.estado': 1 }
```

---

## 3. Diseño UI pendiente — `cocineros.html`

### 3.1 Nuevo tab: **Rendimiento en vivo**

**Ubicación:** cuarto tab en la barra existente (líneas ~80–96).

```
[ 👨‍🍳 Cocineros ] [ 📍 Zonas ] [ 📺 Personalizar vista ] [ 📊 Rendimiento en vivo ]
```

**Comportamiento `cambiarTab('rendimiento')`:**

1. Cargar `GET /api/cocineros/rendimiento/en-vivo` + `GET /api/cocineros/rendimiento/resumen-turno`
2. Conectar socket `/admin` → `emit('join-dashboard-cocineros')`
3. Escuchar `rendimiento-cocinero-actualizado` → recargar snapshot (debounce 500 ms)
4. Iniciar `setInterval` 1 s para `rendimientoTick` (timers en pantalla)
5. Al salir del tab: `leave-dashboard-cocineros`, clear interval (opcional mantener socket)

### 3.2 Wireframe del tab

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  KPIs turno                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │ En curso │ │ Finaliz. │ │ SLA eq.  │ │ Cocineros│                       │
│  │    12    │ │    87    │ │   82%    │ │    4     │                       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  Filtro: [ Todos los cocineros ▼ ]     Auto-actualizar ● ON    🔄 Actualizar│
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─ Juan Pérez ──────────────── foto ── 3 en curso · 24 hoy · 11.2 min ───┐ │
│  │  LOMO SALTADO ×2          M12, M14              1- 08:45  2- 04:12     │ │
│  │  AJÍ DE GALLINA           M7                    1- 02:03               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│  ┌─ María López ─────────────────── 1 en curso · 18 hoy · 14.1 min ──────┐ │
│  │  ...                                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  Ranking del turno (mini, top 5) — reutiliza rankingMetricas con filtro hoy│
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Estilo visual (coherente con dashboard actual)

| Elemento | Clases / tokens |
|----------|-----------------|
| Fondo página | `bg-bg-primary` (#0a0a0f) |
| Card cocinero | `bg-bg-card border border-[rgba(212,175,55,0.25)] rounded-xl p-5` |
| Avatar | `w-10 h-10 rounded-full` + `<img :src="fotoUrl">` o iniciales |
| Nombre cocinero | `text-gold font-semibold` |
| Plato | `text-white font-bold text-lg` |
| Mesas | chips `bg-st-libre/20 text-st-libre text-xs px-2 py-0.5 rounded` |
| Timers | columna derecha, numerados `1- MM:SS` |
| Timer verde | `≤ slaAmarillo` min → `text-st-preparado` |
| Timer amarillo | entre amarillo y rojo → `text-st-esperando` |
| Timer rojo | `> slaRojo` → `text-st-pagado` + opcional `animate-pulse` |
| Badge URGENTE | `bg-st-pagado text-white text-[10px] px-2` si `prioritario` |
| Empty state | “Sin platos en curso” por cocinero o global |

**Opcional fase 2:** toggle “Vista KDS” con fondo `#1a0f1f` y borde neón (como `CocineroPlatoCard` en appcocina).

### 3.4 Estado Alpine nuevo (`cocinerosApp`)

```javascript
// Agregar a x-data / return de cocinerosApp()
rendimientoCocineros: [],      // respuesta en-vivo
resumenTurno: {},              // KPIs header del tab
rendimientoTick: 0,            // fuerza re-render timers
rendimientoLoading: false,
filtroCocineroRendimiento: '', // '' = todos
autoRefreshRendimiento: true,
socketRendimiento: null,
rendimientoTimerInterval: null,
```

### 3.5 Métodos Alpine nuevos

| Método | Responsabilidad |
|--------|-----------------|
| `cargarRendimientoEnVivo()` | Fetch en-vivo + resumen-turno |
| `initSocketRendimiento()` | `io('/admin', { auth: { token } })`, join room |
| `onRendimientoActualizado()` | Debounce → `cargarRendimientoEnVivo()` |
| `startRendimientoTick()` | `setInterval(() => this.rendimientoTick++, 1000)` |
| `stopRendimientoTick()` | `clearInterval` |
| `formatTimer(segundos)` | `MM:SS` con pad |
| `getAlertaTimer(desde, slaMinutos)` | `'ok' \| 'amarillo' \| 'rojo'` |
| `getCocinerosRendimientoFiltrados()` | Filtro por `filtroCocineroRendimiento` |
| `getSegundosTranscurridos(desde)` | `(Date.now() - new Date(desde)) / 1000` |

**Patrón socket:** reutilizar el de `notificaciones-dashboard.js` (`io('/admin', { auth: { token } })`). Evitar segundo socket si se puede compartir instancia global; si no, socket dedicado solo en tab rendimiento.

### 3.6 HTML del tab (nuevo bloque)

Insertar después del tab `vistas` (~línea 96), antes del error state:

```html
<!-- ==================== TAB: RENDIMIENTO EN VIVO ==================== -->
<div x-show="activeTab === 'rendimiento'" x-cloak>
  <!-- KPIs resumenTurno -->
  <!-- Filtros + toggle auto-refresh -->
  <!-- Loop cocineros → grupos → timers -->
  <!-- Empty state global -->
  <!-- Mini ranking turno (opcional) -->
</div>
```

---

## 4. Fixes pendientes en tab **Cocineros** existente

Estos cambios son independientes del tab nuevo pero necesarios para que las métricas ya corregidas en API se vean bien.

### 4.1 KPI “Platos Hoy” — bug actual

```javascript
// ACTUAL (incorrecto): contador acumulado histórico
get totalPlatosHoy() {
  return this.cocineros.reduce((sum, c) =>
    sum + (c.configKDS?.estadisticas?.platosPreparados || 0), 0);
}
```

**Fix:** usar `resumenTurno.finalizadosHoy` o suma de `rankingMetricas[].totalPlatos` cuando `filtroFecha === 'hoy'`.

### 4.2 Normalización del ranking

El backend ya devuelve campos planos (`tiempoPromedio`, `totalPlatos`). En `cargarMetricas()` añadir fallback por compatibilidad:

```javascript
ranking = ranking.map(item => ({
  ...item,
  tiempoPromedio: item.tiempoPromedio ?? item.metricas?.tiempoPromedioPreparacion ?? 0,
  totalPlatos: item.totalPlatos ?? item.metricas?.totalPlatos ?? 0,
  porcentajeDentroSLA: item.porcentajeDentroSLA ?? item.metricas?.porcentajeDentroSLA ?? 0,
  nombre: item.nombre || item.alias || 'Cocinero'
}));
```

### 4.3 Panel lateral cocinero seleccionado

Mostrar métricas nuevas si existen:

- `platosEnCurso` — platos activos ahora
- `tiempoPromedioCola` — minutos en cola antes de tomar
- Tooltip en tiempo promedio: “Desde que toma el plato hasta marcar listo”

### 4.4 Modal métricas (`openMetricasModal`)

Ya consume `platosTop` del endpoint individual. Verificar que con el filtro por cocinero corregido muestre datos reales. Opcional: añadir columna “veces cocinado” más visible.

### 4.5 Tooltips KPI header

Actualizar texto de “Platos Hoy” y “% Dentro SLA” para reflejar métrica cocinero (`procesadoPor` → `recoger`), no tiempo total de cocina.

---

## 5. Orden de implementación recomendado

### Fase A — Desbloquear UI (1–2 h)

1. `global.emitRendimientoCocineroActualizado` en `socket/events.js`
2. Fixes tab Cocineros: `totalPlatosHoy`, normalización ranking
3. Probar endpoints con token admin: en-vivo y resumen-turno

### Fase B — Tab Rendimiento en vivo (4–6 h)

1. Botón tab + `cambiarTab('rendimiento')`
2. KPIs + filtros + lista de cocineros
3. Timers con `rendimientoTick`
4. Socket join + listener
5. Empty states

### Fase C — Pulido backend + UX (2–3 h)

1. Agrupación `grupos[]` + `timers[]` en `obtenerRendimientoEnVivo`
2. Incluir cocineros activos sin platos
3. Mini ranking en tab rendimiento
4. Panel lateral y tooltips actualizados

### Fase D — Opcional (fase 3 del plan original)

1. Schema `finalizadoPor`
2. Métrica intervenciones supervisor
3. Índices MongoDB
4. Vista KDS neón toggle
5. Export CSV del turno

---

## 6. Criterios de aceptación (checklist)

| # | Criterio | Estado |
|---|----------|--------|
| 1 | Ranking muestra métricas distintas por cocinero | ✅ API / ❌ UI sin verificar |
| 2 | Tiempo = tomar → recoger (`procesadoPor.timestamp`) | ✅ API |
| 3 | Tab en vivo muestra mismos platos que Ver Cocina Completo | ❌ |
| 4 | Dashboard actualiza en < 3 s sin refrescar manual | ❌ (falta emit socket) |
| 5 | Platos top por cocinero, no global | ✅ API |
| 6 | Supervisor finaliza → métrica al cocinero original | ✅ |
| 7 | Estilo dark + gold de `cocineros.html` | ❌ tab no existe |
| 8 | KPI “Platos Hoy” refleja el día, no acumulado | ❌ |

---

## 7. Archivos a modificar (referencia rápida)

| Archivo | Tarea pendiente |
|---------|-----------------|
| `public/cocineros.html` | Tab rendimiento, fixes KPI/ranking, Alpine + HTML |
| `src/socket/events.js` | `emitRendimientoCocineroActualizado` |
| `src/repository/cocineros.repository.js` | Agrupación grupos/timers, cocineros vacíos |
| `src/database/models/comanda.model.js` | `finalizadoPor` (opcional) |

**Ya modificados (no tocar salvo mejoras):**

- `src/repository/cocineros.repository.js` — métricas + en-vivo base
- `src/controllers/cocinerosController.js` — endpoints nuevos
- `src/controllers/procesamientoController.js` — atribución + emit
- `src/controllers/comandaController.js` — atribución + emit
- `src/socket/events.js` — join room dashboard

---

## 8. Riesgos al retomar

| Riesgo | Mitigación |
|--------|------------|
| Platos antiguos sin `procesadoPor` | Métricas solo cuentan platos post v7.2; documentar en UI |
| Dos sockets `/admin` (notificaciones + rendimiento) | Compartir instancia o usar mismo socket con múltiples listeners |
| `obtenerRendimientoEnVivo` lento con muchas comandas | Índices + caché 30 s invalidada por socket |
| `platos.nombre` vacío en aggregate | Lookup a colección `platos` o populate en post-proceso |

---

## 9. Cómo retomar (para el siguiente agente)

1. Leer este documento + [`PLAN_RENDIMIENTO_COCINEROS_COCINEROS_HTML.md`](./PLAN_RENDIMIENTO_COCINEROS_COCINEROS_HTML.md)
2. Completar **Fase A** (socket emit + fixes ranking)
3. Implementar **Fase B** en `cocineros.html` siguiendo wireframe §3.2
4. Probar flujo: cocinero toma plato en KDS → aparece en tab en vivo → finaliza → desaparece y sube contador
5. Opcional **Fase C** para paridad visual con Ver Cocina Completo

---

*Fin del plan pendiente v1.1*
