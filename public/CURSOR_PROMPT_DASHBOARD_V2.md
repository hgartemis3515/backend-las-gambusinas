# 🍽️ CURSOR PROMPT — Rediseño Total del Dashboard Administrativo
## Proyecto: Las Gambusinas — Panel Admin Premium v2.0
## Flujo: Figma MCP → Pencil (wireframes) → Cursor (código)

---

## 🎯 OBJETIVO GENERAL

Rehacer completamente el dashboard administrativo del restaurante **Las Gambusinas** ubicado en `public/dashboard/` con un diseño de **nivel world-class**. El flujo de trabajo es:

```
1. Pencil Project  →  Crear wireframes / mockups de cada pantalla
2. Figma MCP       →  Diseño visual final con Design System completo
3. Cursor          →  Generar código HTML/CSS/JS a partir del diseño
```

El código existente debe ser **reemplazado por completo** — no parches, reescritura total con arquitectura limpia.

---

## 📐 PASO 1 — WIREFRAMES CON PENCIL PROJECT

> Cursor tiene instalada la extensión **Pencil** para crear wireframes directamente.
> Antes de escribir UNA SOLA línea de código, usar Pencil para modelar cada pantalla.

### Archivo de trabajo Pencil
Abrir y editar el archivo existente:
```
E:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\public\pencil-new.pen
```

### Pantallas a wireframear en Pencil (una por Frame, 1440×900px cada una)

**Frame 1 — Dashboard Principal (index.html)**
Modelar los siguientes bloques en orden vertical:
```
┌─ TOPBAR (68px) ──────────────────────────────────────────────┐
│  [☰] Logo  |  🔍 Buscar...  |  🕐 Reloj  |  🔔  |  👤       │
└──────────────────────────────────────────────────────────────┘
┌─ SIDEBAR (270px) ─┐  ┌─ CONTENT AREA ───────────────────────┐
│  🍽️ Las Gambusinas │  │  Buenas tardes, Admin                │
│  ─────────────── │  │  Lunes 23 Feb 2026  ·  [↺] [📊]       │
│  📊 Dashboard ●  │  │                                        │
│  🪑 Mesas         │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │
│  🗺️ Áreas         │  │  │MESAS │ │VENTAS│ │PLATOS│ │MOZOS │ │ALERT │ │
│  👤 Mozos         │  │  │12/20 │ │S/.2k │ │Cevich│ │Juan  │ │  2   │ │
│  🍲 Platos        │  │  │ 60%  │ │47tkts│ │Paella│ │S/.980│ │pend. │ │
│  📋 Comandas      │  │  └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ │
│  🧾 Bouchers      │  │                                        │
│  👥 Clientes      │  │  ┌─── MAPA DE MESAS ──┐ ┌─ GRÁFICA ─┐│
│  🔍 Auditoría     │  │  │ M1 M2 M3 M4 M5    │ │ Ventas/hr │││
│  💰 Cierre Caja   │  │  │ M6 M7 M8 M9 M10   │ │  ▁▃▅▇▅▃  │││
│  ─────────────── │  │  │ M11 ...            │ │           │││
│  [Avatar] Admin  │  │  └────────────────────┘ └───────────┘│
│  Gerente  [→ ]   │  │                                        │
└───────────────────┘  │  ┌─── ACTIVIDAD RECIENTE ───────────┐ │
                        │  │  · Mesa 5 — Juan — Ceviche x2    │ │
                        │  │  · Mesa 2 — María — Paella x1    │ │
                        │  └──────────────────────────────────┘ │
                        └────────────────────────────────────────┘
```

**Frame 2 — Sidebar Colapsado (68px)**
```
┌────┐
│ 🍽️ │
│────│
│ 📊 │  ← tooltip "Dashboard" al hover
│ 🪑 │
│ 🗺️ │
│ 👤 │
│ 🍲 │
│ 📋 │
│ 🧾 │
│ 👥 │
│ 🔍 │
│ 💰 │
│────│
│ 👤 │
└────┘
```

**Frame 3 — Card de Mesa (panel deslizante al click)**
```
┌─ PANEL DETALLE MESA ────────────────────┐
│  Mesa 5  ·  Área: Terraza        [✕]    │
│  ─────────────────────────────────────  │
│  🟡 Estado: Ocupada    ⏱ 1h 23m         │
│  👤 Mozo: Juan Pérez                    │
│  👥 Comensales: 4                       │
│  ─────────────────────────────────────  │
│  PEDIDO ACTUAL                          │
│  · Ceviche clasico         x2   S/.36   │
│  · Paella marinera         x1   S/.45   │
│  · Limonada frozen         x4   S/.24   │
│  ─────────────────────────────────────  │
│  TOTAL                          S/.105  │
│  ─────────────────────────────────────  │
│  [Liberar Mesa]  [Ver Comanda]          │
└─────────────────────────────────────────┘
```

**Frame 4 — Estado de Mesas (colores)**
```
Leyenda visual de estados:
  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  LIBRE   │  │ OCUPADA  │  │ PAGANDO  │  │RESERVADA │
  │ borde    │  │ borde    │  │ borde    │  │ borde    │
  │ verde    │  │ ámbar    │  │ rojo     │  │ azul     │
  │          │  │ M5  1:23 │  │ PULSO ●  │  │  🔒      │
  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

**Frame 5 — Topbar Dropdown Usuario**
```
                                    ┌──────────────────┐
                                    │  [Avatar grande]  │
                                    │  Admin Las Gamb.  │
                                    │  admin@gambus.com │
                                    │  ─────────────── │
                                    │  👤 Mi perfil     │
                                    │  ⚙️  Configuración│
                                    │  🌙 Modo oscuro   │
                                    │  ─────────────── │
                                    │  🚪 Cerrar sesión │
                                    └──────────────────┘
```

**Frame 6 — Mobile (375px)**
```
┌─────────────────────┐
│ [☰] 🍽️ Las Gamb. 🔔 │  ← Topbar simplificada
├─────────────────────┤
│  Buenas tardes       │
│  Admin               │
│ ┌───────┐ ┌───────┐ │
│ │MESAS  │ │VENTAS │ │  ← 2 columnas en mobile
│ │ 12/20 │ │S/.2k  │ │
│ └───────┘ └───────┘ │
│ ┌───────┐ ┌───────┐ │
│ │PLATOS │ │MOZOS  │ │
│ └───────┘ └───────┘ │
│ ┌─────────────────┐ │
│ │    ALERTAS      │ │
│ └─────────────────┘ │
│ ← scroll ──────── → │
│ [MAPA DE MESAS]     │
│ [GRÁFICA]           │
│ [ACTIVIDAD]         │
└─────────────────────┘
│ Sidebar = drawer    │
│ que entra desde izq │
└─────────────────────┘
```

### Instrucciones para Pencil
1. Crear cada Frame con dimensiones exactas indicadas
2. Usar colores base del proyecto: fondo `#0a0a0f`, dorado `#d4af37`
3. Usar las shapes de rectángulo redondeado para cards (`border-radius: 12px`)
4. Anotar en cada elemento su clase CSS destino (ej: `.kpi-card`, `.mesa-tile`)
5. Guardar el archivo en `E:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\public\pencil-new.pen`
6. Exportar imágenes PNG de cada frame a `public/dashboard/assets/wireframes/`

---

## 🎨 PASO 2 — DISEÑO FINAL EN FIGMA (via MCP)

> Usar el MCP de Figma integrado en Cursor para crear el diseño visual completo.
> Los wireframes de Pencil son la base estructural; Figma añade el polish visual.

### Acciones Figma vía MCP

```
1. Crear nuevo archivo Figma: "Las Gambusinas — Dashboard v2.0"
2. Configurar Design System con las variables de color (ver sección CSS abajo)
3. Crear Components:
   - KPI Card (con variantes: loading, data, error)
   - Mesa Tile (con variantes: libre, ocupada, pagando, reservada)
   - Sidebar Item (con variantes: default, active, collapsed)
   - Notification Badge
   - Status Pill
4. Diseñar cada Frame basado en los wireframes de Pencil
5. Exportar los assets (íconos SVG, fondos) a public/dashboard/assets/
6. Usar get_design_context para que Cursor lea el diseño y genere el código
```

### Variables de Color para Figma
```
Collection: "Las Gambusinas / Dark Theme"

Backgrounds:
  bg/primary     = #0a0a0f
  bg/secondary   = #12121a
  bg/card        = #1a1a28
  bg/glass       = rgba(255,255,255,0.03)

Brand:
  gold/primary   = #d4af37
  gold/light     = #f4d03f
  gold/dark      = #b8960c
  gold/glow      = rgba(212,175,55,0.15)

Accents:
  emerald        = #00d4aa   (mesas libres / éxito)
  rose           = #ff4757   (alertas / errores)
  amber          = #ffa502   (advertencias / pendientes)
  sapphire       = #5352ed   (info / estadísticas)
  violet         = #a29bfe   (mozos / personal)

Text:
  text/primary   = #ffffff
  text/secondary = rgba(255,255,255,0.65)
  text/muted     = rgba(255,255,255,0.35)

Borders:
  border/subtle  = rgba(255,255,255,0.06)
  border/gold    = rgba(212,175,55,0.25)
```

### Componentes a diseñar en Figma

**KPI Card — 3 variantes:**
```
Variante "data":
┌────────────────────────────────┐  border: 1px solid gold/25%
│  Ícono  │  MESAS OCUPADAS      │  background: bg/card
│  [🪑]   │  12 / 20             │  border-radius: 16px
│  gold   │  ████████░░  60%     │  shadow: 0 8px 32px #0006
│  bg     │  ↑ +3 vs ayer        │
└────────────────────────────────┘

Variante "loading" — skeleton shimmer
Variante "error"   — borde rojo + ícono de alerta
```

**Mesa Tile — 4 variantes de estado:**
```
64×64px redondeado, número centrado, badge de mozo abajo-derecha
libre:    border #00d4aa, fondo #00d4aa10
ocupada:  border #ffa502, fondo #ffa50210, badge tiempo
pagando:  border #ff4757, fondo #ff475710, animación pulso
reservada:border #5352ed, fondo #5352ed10, ícono 🔒
```

### Cómo usar el MCP de Figma en Cursor
```
// En Cursor, llamar al MCP así:
// 1. Crear archivo y frames
use_mcp_tool("figma", "create_file", { name: "Las Gambusinas Dashboard v2" })
use_mcp_tool("figma", "create_frame", { name: "Dashboard Principal", width: 1440, height: 900 })

// 2. Después de diseñar, leer el diseño para generar código
use_mcp_tool("figma", "get_design_context", { fileKey: "...", nodeId: "..." })

// 3. El código generado debe respetar EXACTAMENTE colores, spacing y tipografía del Figma
```

---

## 📁 PASO 3 — ARCHIVOS A REESCRIBIR

```
public/dashboard/
├── index.html                        ← REESCRIBIR basado en diseño Figma
├── assets/
│   ├── css/
│   │   ├── dashboard-premium.css     ← REESCRIBIR con Design System completo
│   │   └── header-premium.css        ← REESCRIBIR
│   ├── js/
│   │   ├── dashboard.js              ← REESCRIBIR
│   │   ├── sidebar.js                ← REESCRIBIR
│   │   ├── header.js                 ← REESCRIBIR
│   │   ├── animations.js             ← NUEVO
│   │   └── admin-functions.js        ← MANTENER lógica, limpiar código
│   └── wireframes/                   ← NUEVO (PNGs exportados de Pencil)
│       ├── frame-01-dashboard.png
│       ├── frame-02-sidebar-collapsed.png
│       ├── frame-03-mesa-detail.png
│       ├── frame-04-estados-mesas.png
│       ├── frame-05-dropdown-user.png
│       └── frame-06-mobile.png
└── pencil-new.pen                    ← ACTUALIZAR con wireframes completos
```

---

## 🎨 DESIGN SYSTEM CSS

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a28;
  --bg-card-hover: #1f1f30;
  --bg-glass: rgba(255, 255, 255, 0.03);

  /* Brand Gold */
  --gold-primary: #d4af37;
  --gold-light: #f4d03f;
  --gold-dark: #b8960c;
  --gold-glow: rgba(212, 175, 55, 0.15);
  --gold-glow-strong: rgba(212, 175, 55, 0.35);

  /* Accents */
  --accent-emerald: #00d4aa;
  --accent-rose: #ff4757;
  --accent-amber: #ffa502;
  --accent-sapphire: #5352ed;
  --accent-violet: #a29bfe;

  /* Text */
  --text-primary: #ffffff;
  --text-secondary: rgba(255,255,255,0.65);
  --text-muted: rgba(255,255,255,0.35);

  /* Borders */
  --border-subtle: rgba(255,255,255,0.06);
  --border-gold: rgba(212,175,55,0.25);
  --border-gold-strong: rgba(212,175,55,0.5);

  /* Shadows */
  --shadow-card: 0 8px 32px rgba(0,0,0,0.4);
  --shadow-gold: 0 0 30px rgba(212,175,55,0.12);
  --shadow-hover: 0 20px 60px rgba(0,0,0,0.5);

  /* Layout */
  --sidebar-width: 270px;
  --sidebar-collapsed: 68px;
  --navbar-height: 68px;

  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

---

## ✨ ANIMACIONES REQUERIDAS

```css
/* Entrada de cards con delay escalonado */
@keyframes slideUpFade {
  from { opacity: 0; transform: translateY(30px); }
  to   { opacity: 1; transform: translateY(0); }
}
.kpi-card:nth-child(1) { animation: slideUpFade 0.4s ease 0ms both; }
.kpi-card:nth-child(2) { animation: slideUpFade 0.4s ease 100ms both; }
.kpi-card:nth-child(3) { animation: slideUpFade 0.4s ease 200ms both; }
.kpi-card:nth-child(4) { animation: slideUpFade 0.4s ease 300ms both; }
.kpi-card:nth-child(5) { animation: slideUpFade 0.4s ease 400ms both; }

/* Mesas en estado "pagando" — pulso urgente */
@keyframes urgentPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 71, 87, 0.7); }
  50%       { box-shadow: 0 0 0 12px rgba(255, 71, 87, 0); }
}

/* Skeleton shimmer para loading */
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Sidebar toggle */
.iq-sidebar { transition: width var(--transition-smooth); }

/* Hover en cards */
.kpi-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-hover), var(--shadow-gold);
  border-color: var(--border-gold-strong);
  transition: var(--transition-smooth);
}

/* Count-up en números */
/* Usar IntersectionObserver + requestAnimationFrame */

/* Ripple en botones */
.btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%);
  transform: scale(0);
  transition: transform 0.4s ease;
}
.btn:active::after { transform: scale(2); }
```

---

## 🧠 ARQUITECTURA JAVASCRIPT

```javascript
// Estado centralizado
const AppState = {
  user: null,
  theme: 'dark',
  sidebarCollapsed: false,
  mesas: [],
  ventas: { hoy: 0, tickets: 0, porHora: [] },
  platos: [],
  mozos: [],
  alertas: [],
  ultimaActualizacion: null
};

// DataManager con cache + retry + timeout
const DataManager = {
  cache: new Map(),
  fetch: async (endpoint, ttl = 30000) => { ... },
  refresh: async () => { ... }
};

// Auto-refresh adaptativo
const RefreshStrategy = {
  fast: 15000,    // tab activo
  slow: 300000,   // tab oculto
  init() {
    document.addEventListener('visibilitychange', () => {
      clearInterval(this._timer);
      const delay = document.hidden ? this.slow : this.fast;
      this._timer = setInterval(() => DataManager.refresh(), delay);
    });
  }
};
```

### Rutas de API — NO MODIFICAR
```
GET /api/mesas
GET /api/mozos
GET /api/comanda
GET /api/boucher/fecha/:fecha
GET /api/admin/verify
```

---

## 📱 RESPONSIVE

| Breakpoint | Sidebar | Cards Grid | Notas |
|-----------|---------|------------|-------|
| < 480px   | Drawer (oculto) | 1 col | Topbar mínima |
| < 768px   | Drawer (oculto) | 2 col | Swipe para abrir |
| < 1024px  | Colapsado (68px) | 2-3 col | — |
| ≥ 1280px  | Expandido (270px) | 5 col | Layout completo |

---

## 🔧 DEPENDENCIAS (CDN)

```html
<!-- Inter + JetBrains Mono -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">

<!-- Lucide Icons (reemplaza Font Awesome, Line Awesome, Remix) -->
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>

<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

<!-- Bootstrap 5 (solo CSS, para grid base) -->
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
```

**NO usar:** jQuery, Font Awesome, Line Awesome, Remix Icons, Bootstrap 4, CounterUp2, Waypoints.

---

## ✅ CHECKLIST FINAL

### Pencil (antes de codear)
- [ ] Frame 1: Dashboard Principal completo en `pencil-new.pen`
- [ ] Frame 2: Sidebar colapsado
- [ ] Frame 3: Panel detalle mesa
- [ ] Frame 4: Estados de mesas (leyenda visual)
- [ ] Frame 5: Dropdown usuario
- [ ] Frame 6: Vista mobile 375px
- [ ] PNGs exportados a `public/dashboard/assets/wireframes/`

### Figma (antes de codear)
- [ ] Design System creado con todas las variables de color
- [ ] Componentes KPI Card (3 variantes), Mesa Tile (4 variantes), Sidebar Item (3 variantes)
- [ ] Todos los frames diseñados a alta fidelidad
- [ ] `get_design_context` ejecutado para leer el diseño en Cursor

### Código
- [ ] Carga inicial < 2s (sin API)
- [ ] Loader oculto antes de 3s (fallbacks múltiples)
- [ ] Sidebar toggle con animación suave
- [ ] Lucide icons renderizando correctamente
- [ ] Skeleton loaders visibles durante fetch
- [ ] Count-up al entrar cards en viewport
- [ ] Mapa de mesas con 4 estados visuales
- [ ] Gráfica de ventas con Chart.js
- [ ] Modo claro/oscuro + persistencia localStorage
- [ ] Responsive en 375px, 768px, 1024px, 1440px
- [ ] Cero errores en consola
- [ ] JWT manejado en headers (Bearer)
- [ ] Logout → `/dashboard/login.html`
- [ ] Auto-refresh adaptativo activo

---

## ⚡ ORDEN DE EJECUCIÓN EN CURSOR

```
1. Abrir pencil-new.pen → crear los 6 frames de wireframes → exportar PNGs
2. Usar Figma MCP → crear Design System → diseñar componentes → exportar assets
3. Leer diseño Figma con get_design_context
4. Escribir dashboard-premium.css (variables + reset + layout base)
5. Escribir header-premium.css (topbar + dropdowns)
6. Escribir index.html (estructura semántica completa)
7. Escribir sidebar.js
8. Escribir header.js
9. Escribir animations.js (IntersectionObserver + CountUp + Ripple)
10. Escribir dashboard.js (AppState + DataManager + RefreshStrategy)
11. Verificar visual en navegador antes de continuar
12. Ajustes responsive mobile
```

> **REGLA DE ORO:** El Figma manda. Si el código no coincide visualmente con el diseño Figma, corregir el código — nunca al revés.

---

*Prompt v2.0 — Flujo Pencil + Figma MCP + Cursor*
*Proyecto: `E:\PROYECTOGAMBUSINAS\Backend-LasGambusinas\public\dashboard\`*
*Backend Node.js/Express: NO TOCAR*
