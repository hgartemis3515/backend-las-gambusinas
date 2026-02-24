# pencil-new.pen — Contexto de Diseño del Dashboard Las Gambusinas

## Archivo
- **Ruta:** `Backend-LasGambusinas/public/pencil-new.pen`
- **Herramienta:** Pencil Design Tool (MCP)
- **Total de frames:** 37
- **Resolución desktop:** 1440×900px por frame
- **Tema:** Dark mode con dorado como color de marca

---

## Paleta de Colores

| Uso | Color | Hex |
|-----|-------|-----|
| Fondo general | Negro profundo | `#0a0a0f` |
| Sidebar / Topbar | Gris oscuro | `#12121a` |
| Cards / Paneles | Gris medio | `#1a1a28` |
| Marca / Dorado activo | Dorado | `#d4af37` |
| Borde dorado sutil | Dorado 25% | `#d4af3740` |
| Hover dorado | Dorado 12% | `#d4af3720` |
| Estado: Libre | Verde esmeralda | `#00d4aa` |
| Estado: Esperando | Ámbar | `#ffa502` |
| Estado: Pedido | Azul | `#3498db` |
| Estado: Preparado | Verde brillante | `#2ecc71` |
| Estado: Pagado | Rojo | `#ff4757` |
| Estado: Reservado | Morado | `#5352ed` |
| Texto principal | Blanco | `#ffffff` |
| Texto secundario | Gris claro | `#a0a0b8` |
| Texto muted | Gris oscuro | `#5a5a7a` |

**Tipografía:** Inter (todas las variantes de peso)

---

## Layout General del Canvas

Los frames están organizados en una cuadrícula en el canvas del Pencil:

```
Fila 1 (y: 0):      Dashboard Principal | Sidebar Colapsado | Panel Detalle Mesa
Fila 2 (y: 1000):   Estados de Mesas    | Dropdown Usuario   | Vista Mobile 375px
Fila 3 (y: 2100):   Login               | Gestión de Mesas   | Áreas del Restaurante
Fila 4 (y: 3100):   Gestión de Mozos    | Carta / Platos     | Comandas
Fila 5 (y: 4100):   Bouchers            | Clientes            | Auditoría
Fila 6 (y: 5100):   Cierre de Caja      | Reportes (General)   | Reportes — Platos
Fila 7 (y: 6100):   Configuración       |                      |
Fila 8 (y: 7100):   Reportes — Mozos    | Reportes — Mesas     | Reportes — Clientes
Fila 9 (y: 8100):   Mesas — Vista Tabla | Dashboard Modal Personalizar | DD Notificaciones | DD Perfil | DD Atajos | DD Búsqueda | DD Estado Sistema
Fila 10 (y: 9100):  Modal Crear Plato   | Modal Ver Comanda            | Modal Ver Boucher
Fila 11 (y: 10100): Modal Crear Mesa    | Modal Crear Mozo             | Modal Editar Cliente | Modal Ver Auditoría
```

---

## Descripción de los 37 Frames

### 1. Dashboard Principal (`92u69`) — 1440×900
Vista principal del dashboard con toda la información resumida.
- **Sidebar** (270px): Logo "Las Gambusinas" dorado, avatar, 10 ítems de menú (Dashboard activo con indicador dorado)
- **Topbar** (72px, fondo `#12121a`, border-bottom `#d4af3740`):
  - **Zona Izquierda:** Hamburguesa (☰ dorado, 44×44) + Breadcrumb "🏠 > Dashboard" (gris `#a0a0b8`, 13px)
  - **Zona Central:** Buscador global pill (420×44px, cornerRadius 22, placeholder "Buscar mesas, comandas, platos, clientes... (Ctrl+K)")
  - **Zona Derecha:** Reloj (14:32:18 blanco 16px bold + "Mar 24 Feb 2026" gris 11px) | separador | Status (🟢 Online verde + "8 mozos | 2 cocinas") | separador | ⚡ Atajos (44×44) | 🔔 Notificaciones (44×44 + badge rojo "5") | Avatar perfil (36×36 con borde dorado + dot verde de status)
- **Contenido:**
  - Saludo "Buenas tardes, Admin" + fecha + botones Actualizar/Exportar/Personalizar Dashboard
  - 5 KPI cards (210×130px): Mesas Ocupadas, Ventas Hoy, Top Platos, Top Mozos, Alertas
  - Botón "⚙️ Personalizar Dashboard" para abrir modal de widgets configurables
  - Mapa de Mesas: grid 20 mesas (4×5) de 52×52px coloreadas por estado
  - Gráfica de Ventas del Día con línea dorada
  - Panel Actividad Reciente con 5 ítems

### 2. Sidebar Colapsado (`XXHvS`) — 68×900
Versión estrecha del sidebar para modo compacto.
- Solo emojis centrados verticalmente
- Tooltip flotante "Dashboard" en el ítem activo
- Avatar circular dorado abajo

### 3. Panel Detalle Mesa (`ApOLy`) — 420×560
Panel modal/lateral que muestra el detalle de una mesa seleccionada.
- Header con "Mesa 5", Área, botón cerrar
- Badge "Ocupada" + tiempo transcurrido
- Info mozo y comensales
- Sección PEDIDO ACTUAL con 3 ítems y precios en dorado
- TOTAL en dorado grande
- Botones: "Liberar Mesa" (rojo) y "Ver Comanda" (dorado)

### 4. Estados de Mesas (`3dsew`) — 1060×320
Referencia visual de los **6 estados** del sistema (basados en `admin.html`):

| Estado | Color | Descripción |
|--------|-------|-------------|
| LIBRE | `#00d4aa` | Disponible para asignar |
| ESPERANDO | `#ffa502` | Esperando que el mozo atienda |
| PEDIDO | `#3498db` | Pedido enviado a cocina |
| PREPARADO | `#2ecc71` | Listo para servir al cliente |
| PAGADO | `#ff4757` | Cuenta pagada, pendiente liberar |
| RESERVADO | `#5352ed` | Bloqueada para reserva |

### 5. Dropdown Usuario (`lCjyB`) — 280×340
Panel desplegable del perfil de usuario.
- Avatar circular dorado + nombre + email
- Ítems: Mi perfil, Configuración, Modo oscuro (con toggle), Cerrar sesión (rojo)

### 6. Vista Mobile 375px (`GkM0k`) — 375×812
Adaptación responsive del dashboard para móvil.
- Topbar compacta, grid 2×2 de KPI mini-cards
- Card de alertas, mini mapa de mesas, actividad compacta
- Drawer overlay del sidebar

### 7. Login (`M2uAS`) — 1440×900
Pantalla de inicio de sesión.
- Fondo gradient radial
- Card centrada (500×620px) con cornerRadius 20, borde dorado sutil
- Logo "Las Gambusinas" + subtítulo
- Formulario: email + contraseña (con eye icon)
- Link "¿Olvidaste tu contraseña?"
- Botón "Iniciar Sesión" dorado
- Versión "v2.0.0 — Las Gambusinas © 2026"

### 8. Gestión de Mesas (`YGw8u`) — 1440×900
Vista completa de administración de mesas — vista tarjetas (corresponde a tab "Mesas" del `admin.html`).
- **Sidebar:** Mesas activo (indicador dorado)
- **Topbar:** Título + botón rojo "LIBRE TOTAL" + **toggle vista (🃏 Tarjetas / 📋 Tabla)** + botón dorado "+ Nueva Mesa"
- **Filtros:** Búsqueda + 7 botones de filtro (Todas, Libre, Esperando, Pedido, Preparado, Pagado, Reservado)
- **Cards de mesas** organizadas por áreas:
  - Salón Principal (12 mesas): cards 190×160px con borde del color del estado, nombre, estado, detalle (mozo, personas, tiempo, monto)
  - Terraza (8 mesas): misma estructura
- **Panel Resumen** lateral (260×360px): estadísticas totales
- **Toggle de vista**: Tarjetas activo (dorado), Tabla inactivo (outline)

### 9. Áreas del Restaurante (`nFdcp`) — 1440×900
Administración de áreas (corresponde a tab "Áreas" del `admin.html`).
- **Sidebar:** Áreas activo
- **Topbar:** Título + botón "+ Nueva Área"
- **Tabla** con columnas: ID, Nombre, Descripción, Estado, Acciones (editar/eliminar)
- 3 filas de datos: Salón Principal, Terraza, VIP/Privado

### 10. Gestión de Mozos (`7xR5V`) — 1440×900
Administración de mozos (corresponde a tab "Mozos" del `admin.html`).
- **Sidebar:** Mozos activo
- **KPIs:** Activos hoy (8), Total registrados (12), Mejor mozo (Juan Pérez)
- **Tabla** con columnas: ID, Nombre, DNI, Teléfono, Acciones
- 3 filas de datos de mozos

### 11. Carta / Platos (`VU44j`) — 1440×900
Gestión de menú con soporte completo de complementos (corresponde a tab "Platos" del `admin.html`).
- **Sidebar:** Platos activo (12 ítems de menú completos)
- **Topbar:** Título "Carta / Platos" + botones "Actualizar" (outline gris), "Importar JSON" (outline dorado), "+ Nuevo Plato" (dorado sólido)
- **Sub-tabs** (pills): Todos (53) activo | Desayuno (15) | Carta (38) | Inactivos (3)
- **Barra de filtros** (44px): Búsqueda, dropdown Categoría, dropdown Stock, checkbox "Solo con complementos"
- **Tabla** con columnas: #, NOMBRE (nombre + subcategoría muted), PRECIO (dorado), STOCK (pill verde/ámbar/rojo), CATEGORÍA (badge color), TIPO (badge azul/ámbar), **COMPLEMENTOS** (badge "● X grupos" dorado + nombres de grupos, o "Sin complementos"), ACC. (👁 ✏️ 📋 🗑)
- 6 filas de datos: Ceviche Clásico (2 grupos), Paella Marinera (1 grupo), Desayuno Andino (3 grupos), Lomo Saltado (sin complementos), Ají de Gallina (2 grupos), Jugo Natural (1 grupo)
- Paginación: "Mostrando 6 de 53 platos" + ◀ 1 2 3 ▶
- **Panel lateral** (234px):
  - **Categorías:** Lista con conteos (Ceviches 24, Arroces 18, Carnes 12, Bebidas 35, Desayunos 15, Postres 9) + botón "+ Nueva categoría"
  - **Tipo de Menú:** Pills "Carta (38)" activo, "Desayuno (15)"
  - **Complementos (NUEVA SECCIÓN):** KPIs "Platos con complementos: 18 de 32", "Grupos definidos: 42", "Opciones totales: 136" + lista de grupos más usados (Proteína 18 platos, Guarnición 15, Bebida incluida 9, Salsa 7, Tamaño 5)

### 12. Comandas (`r9Gae`) — 1440×900
Vista de órdenes activas (corresponde a tab "Comandas" del `admin.html`).
- **Sidebar:** Comandas activo
- **Barra de filtros:** ID Comanda, Mesa, Estado (dropdown), Mozo + botón Actualizar
- **Tabla** con columnas: #, Mesa, Mozo, Items, Total, Estado, Hora, Acciones (Ver/Editar/Eliminar)
- Estados con colores: En proceso (ámbar), Entregado (verde), Preparando (ámbar)
- 3 filas de datos

### 13. Bouchers (`XKB4Z`) — 1440×900
Comprobantes de pago (corresponde a tab "Bouchers" del `admin.html`).
- **Sidebar:** Bouchers activo
- **Filtros:** Fecha (datepicker) + botón Filtrar + botón Actualizar
- **Tabla** con columnas: Código, N° Boucher, Fecha Uso, Total, Acciones (Ver + PDF)
- 2 filas de datos con acciones PDF

### 14. Clientes (`mWZxV`) — 1440×900
Gestión de clientes (corresponde a tab "Clientes" del `admin.html`).
- **Sidebar:** Clientes activo
- **Topbar:** Botones "Exportar CSV" (dorado) y "Actualizar"
- **Barra de filtros:** Tipo (Todos), Nombre, DNI, Fecha Desde, Fecha Hasta
- **KPIs:** Total clientes (347), Nuevos este mes (23, verde), Frecuentes (85, dorado)
- **Tabla** con columnas: Nombre, DNI/RUC, Teléfono, Visitas, Gasto Total, Email, Tipo
- Tipos coloreados: Registrado (verde), Frecuente (dorado)

### 15. Auditoría (`fflgQ`) — 1440×900
Log de auditoría del sistema (corresponde a tab "Auditoría" del `admin.html`).
- **Sidebar:** Auditoría activo
- **Filtros:** Fecha, Acción (dropdown con tipos), botón Reporte Completo
- **Tabla** con columnas: Hora, Usuario, Acción, Módulo, IP, Comanda #, Detalles
- Acciones coloreadas por tipo: Comanda Eliminada (rojo), Comanda Editada (ámbar), Plato Modificado (azul)
- Módulos con colores diferenciados

### 16. Cierre de Caja (`evx3r`) — 1440×900
Cierre diario de caja con desglose de complementos (corresponde a tab "Cierre de Caja" del `admin.html`).
- **Sidebar:** Cierre Caja activo
- **Topbar:** Botón rojo "Cerrar Caja"
- **5 KPIs:** Ventas del día (S/. 2,450 dorado), Tickets (47), Efectivo (S/. 1,580 verde), Tarjeta/Digital (S/. 870 morado), **Complementos (S/. 1,290 morado `#5352ed`)**
- **Tabs secundarios:** [ Platos ] [ Complementos (activo) ] [ Categorías ] — estilo pills
- **Mini-cards tipo:** 🥤 Bebidas S/.450 (35%), ➕ Extras S/.320 (25%), 📏 Tamaños S/.180 (14%), 🌟 Adicionales S/.340 (26%)
- **Tabla de Complementos:** #, Complemento, Tipo (badge), Cantidad, P. Unit., Subtotal, % — 5 filas con total footer
- **Botones de exportación:** "📄 Cierre Completo (PDF)" dorado + "📊 Complementos (Excel)" verde
- **Panel Análisis de Complementos** (derecha): Ratio complementos/plato (1.8), Más popular (Inca Kola 500ml), Ticket CON (S/. 68.50) vs SIN (S/. 42.30), Incremento +62%
- **Panel Historial de Cierres** (derecha inferior): Tabla con Fecha, Total, Tickets, Cerrado por

### 17. Reportes — General (`lUCQ5`) — 1440×900
Dashboard analítico avanzado con múltiples gráficos estadísticos (rediseño completo). Vista General con section tabs.
- **Sidebar** (270px): Reportes activo (indicador dorado), 12 ítems de menú incluyendo Configuración
- **Topbar** (68px): Título "Reportes y Analítica" + badge "LIVE" rojo + botones PDF/Excel + botón "⚙️ Configurar Vista" (dorado outline)
- **Section Tabs** (debajo del título en topbar): General (activo, gold underline) | Platos | Mozos | Mesas | Clientes
- **Barra de Filtros Globales** (44px): Date pickers (inicio/fin), dropdown Agrupar (Día), dropdown Comparar (Sin comparar), botones rápidos (Hoy activo, Ayer, 7 días, 30 días, Este mes), botón refresh
- **4 KPI Cards** (199×100px cada una):
  - Ventas Totales: S/. 12,450 (dorado, borde dorado, sparkline de barras ascendentes) + badge +18% verde
  - Ticket Promedio: S/. 52.13 (blanco) + badge +5% verde
  - Margen Bruto: 68.5% (verde) + badge -2.1% ámbar (alerta)
  - Ocupación Prom.: 74% (azul) + badge +8% azul
- **Gráfico de Línea/Área** (409×280px, "Ventas por Período"):
  - SVG Path con área gradient dorado→transparente
  - Línea dorada con 5 data points (ellipses)
  - Y-axis: 0-15K, X-axis: 08h-16h
  - Grid lines sutiles, toggle controls (Tendencia, Comparar, Acumulado)
- **Gráfico Donut** (409×280px, "Distribución de Ventas"):
  - 5 segmentos con innerRadius 0.6: Ceviches 30% (#d4af37), Arroces 22% (#3498db), Carnes 18% (#2ecc71), Bebidas 15% (#ffa502), Otros 15% (#5352ed)
  - Centro: "S/. 12,450 Total"
  - Leyenda lateral con color dots, % y montos
- **Top Platos Vendidos** (409×280px, barras horizontales):
  - 8 platos con gradient bars decrecientes, colores únicos por plato
  - Ceviche (12), Paella (9), Lomo (8), Arroz (7), Tiradito (6), Ají de Gallina (5), Anticuchos (4), Chicharrón (3)
- **Performance de Mozos** (409×280px, barras verticales agrupadas):
  - 3 mozos × 3 barras cada uno (Ventas dorado, Tickets azul, Propinas verde)
  - Juan P. S/.980, María G. S/.720, Pedro R. S/.540
  - Grid lines horizontales de referencia
- **Panel Lateral Derecho** (280×756px, card `#1a1a28`):
  - **Resumen Ejecutivo:** Total S/. 12,450, Tickets 239, Promedio S/. 52.13, Top plato (Ceviche), Mozo destacado (Juan Pérez), Hora pico (12:00-14:00)
  - **Métricas Operativas:** Espera 8min (verde), Preparación 12min (ámbar), Satisfacción 94% (verde), Cancelaciones 3 (rojo)
  - **Exportación Rápida:** 4 botones (Gráficos PNG, Informe PDF dorado, Excel/CSV verde, Programar)
  - **Comparativas:** 3 mini cards — vs. Ayer +12% (verde), vs. Sem. -5% (rojo), vs. Mes +18% (verde)

### 18. Reportes — Platos (`Kxmcq`) — 1440×900
Vista de sección Platos del módulo Reportes. Tab "Platos" activo con underline dorado.
- **Topbar + Section Tabs**: Misma estructura, tab "🍽️ Platos" activo
- **Filtros Específicos**: Date pickers + Categoría (Todas categ.) + Tipo (Todos) + Checkbox "Incluir complementos" + botón Hoy
- **4 KPI Cards**: Platos Vendidos (847, +7%), Categoría Top (Ceviches 32%), Ticket c/ Plato (S/. 58.20), Cancelados (8, 0.9% verde)
- **Top Platos Vendidos** (834×280px, barras horizontales):
  - 8 platos con gradient bars individuales (colores: dorado, azul, verde, ámbar, morado, rojo, cyan, amarillo)
  - Ceviche Clásico (12, S/.540) → Chicharrón Pescado (3, S/.90)
  - Valores y montos alineados a la derecha
- **Tabla: Desglose Detallado** (834×356px):
  - Columnas: #, Plato, Categoría, Cantidad, P. Unit., Subtotal, % Total, Complementos
  - 6 filas de datos + fila TOTAL (847 platos, S/.12,450)
  - Footer: "Mostrando 6 de 847 platos • Ordenado por cantidad desc."

### 19. Reportes — Mozos (`qK9Wo`) — 1440×900
Vista de sección Mozos del módulo Reportes. Tab "Mozos" activo.
- **Filtros Específicos**: Date pickers + Mozo (Todos) + Turno (Todos) + botón Hoy
- **4 KPI Cards**: Mozos Activos (8 de 12, dorado), Top Mozo (Juan P., S/.980, 19 tickets), Propinas Totales (S/. 245, verde), Tiempo Prom. (4.2 min, verde)
- **Ventas por Mozo** (834×260px, barras verticales agrupadas):
  - 4 mozos × 3 barras: Ventas (dorado), Tickets (azul), Propinas (verde)
  - Juan P. S/.980, María G. S/.720, Pedro R. S/.540, Ana L. S/.410
  - Y-axis: 0-1K, grid lines y leyenda de colores
- **Tabla: Ranking de Mozos** (1114×376px, ancho completo):
  - Columnas: Pos., Mozo, DNI, Ventas, Tickets, Ticket P., Propinas, Tiempo, Satisfacción
  - 5 filas: 🥇 Juan Pérez (96%), 🥈 María González (94%), 🥉 Pedro Ruiz (89%), Ana López (91%), Carlos Mendoza (85%)
  - Fila TOTAL: S/. 12,450, 239 tickets, S/. 245 propinas, 93% satisfacción
  - Colores por rendimiento: verde (bueno), ámbar (medio), rojo (bajo)

### 20. Reportes — Mesas (`HVYt4`) — 1440×900
Vista de sección Mesas del módulo Reportes. Tab "Mesas" activo.
- **Filtros Específicos**: Date pickers + Área (Todas) + N° Mesa (input) + Estado (Todos) + botón Hoy
- **4 KPI Cards**: Ocupación Actual (74%, 14 de 19 mesas), Mesa Más Rentable (Mesa 5, S/. 680 hoy), Rotación Prom. (3.2 comandas/mesa), Tiempo Ocupación (48 min)
- **Heatmap de Ocupación** (834×260px):
  - Matriz 7 días × 8 horas (8h-22h) con celdas coloreadas
  - Escala: 🟢 80-100% (#00d4aa), 🟢 60-80% (#2ecc71), 🟡 40-60% (#ffa50280), 🟠 20-40% (#ffa50240), ⬛ 0-20% (#5a5a7a30)
  - Viernes y sábado muestran mayor ocupación (más celdas verde oscuro)
  - Leyenda superior con significado de colores
- **Tabla: Ranking de Mesas** (1114×376px, ancho completo):
  - Columnas: Pos., Mesa, Área, Comandas, Personas, Ventas, Ticket P., Tiempo, Estado
  - 4 filas con badges de estado coloreados: 🟡 Ocupada, 🟢 Libre, 🔴 Pagado, 🔒 Reservada (morado)
  - Mesa 8 marcada como VIP (texto morado)

### 21. Reportes — Clientes (`94t0x`) — 1440×900
Vista de sección Clientes del módulo Reportes. Tab "Clientes" activo.
- **Filtros Específicos**: Date pickers + Tipo (Todos) + Buscar nombre/DNI (input con 🔍) + botón Hoy
- **4 KPI Cards**: Clientes Únicos (187, 134 inv. + 53 registrados), Cliente Top (María S., S/.340, 3 visitas), Nuevos Registros (12, +30%), Fidelización (28% frecuentes)
- **Distribución de Clientes** (409×260px, donut chart):
  - 3 segmentos: Invitados 72% (#5a5a7a), Registrados 18% (#3498db), Frecuentes 10% (#d4af37)
  - Centro: "187 clientes", leyenda lateral con color dots, % y conteo
- **Gasto Promedio por Tipo** (409×260px, barras verticales):
  - 3 barras: Invitado S/.38 (gris), Registrado S/.65 (azul), Frecuente S/.113 (dorado)
  - Muestra progresión de gasto según fidelización
- **Tabla: Top 20 Clientes** (1114×376px, ancho completo):
  - Columnas: Pos., Cliente, Tipo, DNI, Visitas, Gasto Total, Ticket P., Última Visita, Plato Fav.
  - 4 filas con badges de tipo: 🏆 Frecuente (dorado), Registrado (azul), Invitado (gris)
  - Fila TOTAL: 487 visitas, S/. 24,380

### 22. Configuración (`yg9wT`) — 1440×900
Panel centralizado de configuración del sistema (nuevo, sin correspondencia directa en `admin.html`).
- **Sidebar** (270px): Configuración activo (indicador dorado), 12 ítems de menú
- **Topbar** (68px): Título "Configuración del Sistema" + botón dorado "Guardar Cambios"
- **Tabs Verticales** (200px, fondo `#111119`): Navegación secundaria con 10 categorías
  - General (activo, dorado), Moneda y Precios, Mesas y Áreas, Cocina, Pagos y Facturación, Notificaciones, Cierre de Caja, Seguridad, Integraciones, Avanzado
  - Tab activo: fondo `#d4af3720` + borde izquierdo 3px dorado
- **Panel de Contenido** (card `#1a1a28`, 946×808px, cornerRadius 12):
  - **Sección 1 — Información del Restaurante:**
    - Nombre del restaurante (input full-width): "Las Gambusinas"
    - Dirección + Teléfono (2 columnas)
    - Email + RUC/Razón Social (2 columnas)
  - **Sección 2 — Horarios de Operación:**
    - Hora de apertura (08:00) + Hora de cierre (23:00) con iconos de reloj
  - **Sección 3 — Preferencias del Sistema:**
    - Zona horaria (dropdown: "America/Lima") + Idioma (dropdown: "Español")
  - **Sección 4 — Logo del Restaurante:**
    - Área de upload (dashed border, 220×140px) con icono y texto helper
    - Vista previa del logo actual (100×100px)
  - Nota footer: texto muted sobre aplicación de cambios
- **Inputs:** Fondo `#12121a`, borde `#d4af3740`, texto blanco, 40px alto, cornerRadius 8
- **Iconos:** Lucide (chevron-down para dropdowns), Material Symbols Rounded (timer para horarios)
- **10 tabs disponibles** cubren: General, Moneda/Precios, Mesas/Áreas, Cocina, Pagos/Facturación, Notificaciones, Cierre de Caja, Seguridad, Integraciones, Avanzado

### 23. Gestión de Mesas — Vista Tabla (`VcRJC`) — 1440×900
Vista alternativa de mesas en formato tabla (toggle desde frame 8).
- **Sidebar** (270px): Mesas activo
- **Topbar:** Título + toggle vista (Tarjetas inactivo / **Tabla activo dorado**) + botón "+ Nueva Mesa"
- **Filtros avanzados** (barra 44px): 🔍 Buscar N° mesa, Mozo (dropdown), Área (dropdown), Estado (dropdown) + botón Exportar (verde)
- **Acciones masivas:** Checkbox "Seleccionar todas" + botones "Liberar seleccionadas" (rojo outline) y "Cambiar área" (dorado outline)
- **Tabla completa** (1114×700px, card `#1a1a28`, cornerRadius 10):
  - Header: #↑, ÁREA, ESTADO, MOZO, PERS., COMANDAS, MONTO, ÚLTIMA ACT., ACCIONES
  - 10 filas con datos variados mostrando todos los estados:
    - Badges de área: Salón (azul), Terraza (ámbar), VIP (morado)
    - Badges de estado: 🟢 Libre, 🟡 Ocupada (+ tiempo), 🔵 Pedido (+ tiempo), 🟢 Preparado, 🔴 Pagando, 🔵 Reservada
    - Montos en dorado para valores > S/. 0
    - Tiempo de última actividad coloreado (verde = reciente, ámbar = moderado, rojo = largo)
    - Acciones: 👁 ✏️ 🔓 por fila
  - Checkbox de selección por fila (una marcada dorada como ejemplo)
  - Footer: resumen por estados (🟢 Libre: 3, 🟡 Ocupada: 4, 🔵 Pedido: 1, 🔴 Pagando: 1, 🔵 Reservada: 1, 🟢 Preparado: 1) + paginación "Pág. 1 de 1"

### 24. Dashboard — Modal Personalizar (`Oc3ma`) — 1440×900
Modal de personalización del dashboard con catálogo de widgets.
- **Fondo:** Overlay oscuro (85% opacidad) con dashboard ghost visible debajo
- **Dashboard ghost (izquierda):** Sidebar transparente, widgets placeholder con labels (Mesas Ocupadas, Ventas del Día, Ventas por Hora, Mapa de Mesas), grid lines punteadas doradas
- **Widget seleccionado:** Borde dorado sólido 2px con handles de resize (dots dorados 8px en esquinas)
- **Panel lateral derecho** (500px, fondo `#1a1a28`):
  - **Header:** "Personalizar Dashboard" + botón ✕
  - **3 tabs:** Agregar Widgets (activo) | Widgets Activos | Layouts Guardados
  - **Buscador:** Input "🔍 Buscar widget..."
  - **Categoría Métricas (8 widgets):** 4 cards (2×2) con thumbnails:
    - Mesas Ocupadas (🪑 12/20), Ventas del Día (💰 S/.2,450), Top Plato (🍽️ Ceviche), Tiempo Prom. Cocina (⏰ 4.2 min)
    - Cada card: thumbnail 120×54px, nombre, tamaño "3 cols · Métrica", botón "+ Añadir"
    - Widgets ya activos: badge verde "Activo" + borde verde
  - **Categoría Gráficos (8 widgets):** 2 cards con previews:
    - Ventas por Hora (línea dorada ascendente), Distribución Categoría (donut dorado/azul)
  - **Categorías colapsadas:** ▶ Operaciones (6 widgets), ▶ Análisis (4 widgets)
  - **Footer:** "Restaurar predeterminados" (gris) | "Cerrar" (outline dorado) | "Guardar" (dorado sólido)

### 25. Dropdown — Notificaciones (`O5MN3`) — 340×420
Dropdown del icono de campana en la topbar.
- **Header:** "Notificaciones" + link "Marcar todas como leídas" dorado
- **Tabs:** [ Todas (5) activo ] [ No leídas (3) ]
- **5 notificaciones:**
  - 🔴 "Mesa 8 sin liberar" (urgente, no leída — fondo destacado + dot dorado)
  - 🟡 "Stock bajo: Inca Kola" (advertencia, no leída — fondo destacado + dot dorado)
  - 🔵 "Nueva comanda #312" (info, no leída — dot dorado)
  - 🟢 "Pago procesado S/.185" (éxito, leída — texto gris)
  - 🟢 "Comanda #308 lista" (éxito, leída — texto gris)
- **Footer:** "Ver todas las notificaciones" (link dorado centrado)

### 26. Dropdown — Perfil Usuario (`mDzXb`) — 280×420
Dropdown del avatar de perfil en la topbar.
- **Header (130px):** Avatar 64px centrado, "Admin Principal" (bold), email (muted), badge "Administrador" (pill dorado)
- **Sección Perfil:** 👤 Mi perfil, ⚙️ Configuración
- **Sección Sistema:** 🎨 Modo oscuro (toggle ON dorado), 🔔 Notificaciones (toggle ON), 🌐 Idioma: Español (dropdown)
- **Sección Sesión:** 🔐 Cambiar contraseña, 📊 Mi actividad, 🚪 Cerrar sesión (rojo)

### 27. Dropdown — Atajos Rápidos (`5O2oo`) — 260×280
Dropdown del botón ⚡ en la topbar.
- **Header:** "⚡ Atajos Rápidos" (dorado)
- **6 acciones con shortcuts:** 🆕 Nueva comanda (Ctrl+N), 💰 Procesar pago (Ctrl+P), 🪑 Ver mapa de mesas (Ctrl+M), 📊 Abrir reportes (Ctrl+R), ⚙️ Configuración (Ctrl+,), 🔍 Buscar (Ctrl+K)
- **Footer:** "Esc para cerrar" (muted)

### 28. Dropdown — Búsqueda Global (`Djscq`) — 420×360
Autocompletado del buscador central de la topbar.
- **Header:** Input con texto "cevi" + cursor dorado + "Esc cerrar"
- **Resultados agrupados por tipo:**
  - PLATOS: Ceviche Clásico (hover activo, S/.45, 12 vendidos), Ceviche Mixto (S/.55, 6 vendidos)
  - MESAS: Mesa 5 con Ceviche Clásico x2 (Ocupada, Juan Pérez)
  - COMANDAS: Comanda #305 con Ceviche Clásico x2 (En preparación)
- **Footer:** "↑↓ navegar · Enter seleccionar · Esc cerrar"

### 29. Dropdown — Estado del Sistema (`Jlw97`) — 300×340
Dropdown del indicador de status en la topbar.
- **Header:** "Estado del Sistema" + badge "🟢 OK" verde
- **Conexiones:** Cocina (2 clientes), Mozos (8 clientes), Admin (1 cliente) — todos Socket.io
- **Servicios:** MongoDB (OK), Redis Cache (OK), API Server (OK) — badges verdes
- **Métricas:** Latencia promedio 12ms, Uptime 48h 23m

### 30. Modal — Crear Plato (`E9zvL`) — 720×700
Modal completo para crear un plato nuevo con editor visual de complementos.
- **Header:** "Crear Nuevo Plato" con subtítulo y botón X
- **Datos Básicos:** Nombre (full-width), Precio (S/.), Stock inicial, Categoría (dropdown), Tipo (dropdown), Toggle "Disponible para venta"
- **Detalles:** Descripción (textarea), Tiempo preparación (min), Alérgenos (input libre)
- **Complementos del Plato:** Editor de grupos con botón "+ Agregar grupo"
  - Cada grupo: nombre, checkboxes Obligatorio/Selección múltiple, opciones como chips removibles con "+ Agregar"
  - 2 grupos de ejemplo: Proteína (Pollo/Carne/Mixto, obligatorio) y Guarnición (Arroz/Ensalada/Papas, sel. múltiple)
  - Contador: "Este plato tiene 2 grupos y 6 opciones en total"
- **Footer:** Cancelar + "Crear Plato" (dorado) + hint "POST /api/platos"

### 31. Modal — Ver Comanda (`wmbyw`) — 840×680
Modal de detalle completo de una comanda con complementos seleccionados.
- **Header:** "Comanda #42" + badge "Preparado" (verde) + "Mesa 5 — Juan Pérez · 2 comensales"
- **Info General:** Creada 14:15, Enviada cocina 14:20, Preparada 14:35, Tiempo total 20 min, Mozo Juan Pérez, Cliente Invitado #45
- **Tabla de Platos:** PLATO | CANT. | P. UNIT. | SUBTOTAL | **COMPLEMENTOS SELECCIONADOS**
  - Ceviche Clásico x2 S/.90 — Proteína: Pollo, Guarnición: Arroz
  - Lomo Saltado x1 S/.35 — Bebida: Inca Kola 500ml
  - Paella Marinera x1 S/.68 — Sin complementos
  - **TOTAL: 4 platos, S/. 193.00**
- **Historial de Estados:** Timeline visual con dots de color (azul=creada, ámbar=cocina, verde=preparada)
- **Footer:** Cerrar | 🖨 PDF | 🍳 Cocina

### 32. Modal — Ver Boucher (`Z1h1R`) — 720×560
Modal de detalle del comprobante de pago con complementos.
- **Header:** "Boucher #100" + "Mesa 5 · Mar 24 Feb 2026 · 14:42"
- **Totales:** Subtotal S/.163.56, IGV (18%) S/.29.44 (ámbar), **TOTAL S/.193.00** (dorado grande 22px), Propina S/.10 (verde), Descuento S/.0
- **Tabla Ítems:** PLATO | CANT. | PRECIO | COMPLEMENTOS | SUBTOTAL
  - Mismos ítems que la comanda con complementos inline
- **Info de Pago:** Método 💵 Efectivo (verde), Cliente Invitado #45, Hora 14:42, Comprobante Boleta, Serie BCH-001-00100, Cajero Admin Principal
- **Footer:** "Anular" (rojo outline) | Cerrar | "🖨 Reimprimir" (dorado)

### 33. Modal — Crear/Editar Mesa (`6mFV8`) — 520×480
Modal para crear o editar una mesa del restaurante.
- **Campos:** Número de mesa, Área (dropdown), Capacidad (personas), Estado inicial (dropdown, Libre en verde), Notas (textarea), Toggle "Mesa activa"
- **Vista previa:** Mini tile del estado con color, indicando cómo se verá en el mapa
- **Footer:** Cancelar + "Crear Mesa" (dorado)

### 34. Modal — Crear/Editar Mozo (`O9Cqx`) — 520×500
Modal para registrar o editar personal de atención.
- **Campos:** Nombre completo, DNI, Teléfono, Rol (dropdown: Mozo/Supervisor/Admin), Pin de acceso (masked), Toggle "Activo"
- **Turnos:** Pills seleccionables Mañana/Tarde/Noche (activos: dorado, inactivos: gris outline)
- **Footer:** Cancelar + "Crear Mozo" (dorado)

### 35. Modal — Editar Cliente (`mjCf5`) — 520×480
Modal para editar datos de un cliente registrado.
- **Header:** "Editar Cliente" con ID y fecha de registro
- **Campos:** Nombre completo (prellenado), DNI, Teléfono, Email, Tipo de cliente (dropdown: Frecuente dorado)
- **Estadísticas read-only:** Visitas: 15, Consumo: S/.2,340, Última visita: Hoy 14:32
- **Footer:** "Eliminar" (rojo outline) | Cancelar | "Guardar" (dorado)

### 36. Modal — Ver Auditoría (`8ORKa`) — 720×480
Modal de detalle de un registro de auditoría con cambios realizados.
- **Header:** "Detalle de Auditoría" + Registro #AUD-0142 · fecha/hora
- **Info:** Usuario: Admin Principal, Acción: Editar plato (ámbar), IP: 192.168.1.45, Entidad: Plato — Ceviche Clásico
- **Tabla Cambios:** CAMPO | VALOR ANTERIOR (rojo) | VALOR NUEVO (verde)
  - precio: S/.45 → S/.48, stock: 50 → 32, complementos: [1 grupo] → [2 grupos], categoria: sin cambio
- **Payload Completo:** JSON formateado del cambio (fondo `#12121a`, texto dorado)
- **Footer:** Cerrar

### 37. (Reservado para futuras ampliaciones: Modal Ver Cierre de Caja, Modal Crear/Editar Área)

---

## Correspondencia con admin.html

El diseño fue modelado analizando completamente el archivo `admin.html` (7217 líneas) que contiene el panel administrativo actual. Cada frame corresponde a un tab del admin:

| Tab admin.html | Frame en .pen | ID |
|---------------|---------------|-----|
| Mesas | Gestión de Mesas | `YGw8u` |
| Áreas | Áreas del Restaurante | `nFdcp` |
| Mozos | Gestión de Mozos | `7xR5V` |
| Platos | Carta / Platos | `VU44j` |
| Comandas | Comandas | `r9Gae` |
| Bouchers | Bouchers | `XKB4Z` |
| Clientes | Clientes | `mWZxV` |
| Reportes | Reportes — General | `lUCQ5` |
| Reportes (Platos) | Reportes — Platos | `Kxmcq` |
| Reportes (Mozos) | Reportes — Mozos | `qK9Wo` |
| Reportes (Mesas) | Reportes — Mesas | `HVYt4` |
| Reportes (Clientes) | Reportes — Clientes | `94t0x` |
| Auditoría | Auditoría | `fflgQ` |
| Cierre de Caja | Cierre de Caja | `evx3r` |
| *(nuevo)* | Login | `M2uAS` |
| *(nuevo)* | Dashboard Principal | `92u69` |
| *(nuevo)* | Configuración | `yg9wT` |
| Mesas (vista tabla) | Mesas — Vista Tabla | `VcRJC` |
| *(nuevo)* | Dashboard Modal Personalizar | `Oc3ma` |
| Platos (modal crear) | Modal Crear Plato | `E9zvL` |
| Comandas (modal ver) | Modal Ver Comanda | `wmbyw` |
| Bouchers (modal ver) | Modal Ver Boucher | `Z1h1R` |
| Mesas (modal crear) | Modal Crear/Editar Mesa | `6mFV8` |
| Mozos (modal crear) | Modal Crear/Editar Mozo | `O9Cqx` |
| Clientes (modal editar) | Modal Editar Cliente | `mjCf5` |
| Auditoría (modal ver) | Modal Ver Auditoría | `8ORKa` |

---

## API Endpoints (del admin.html)

| Entidad | Create | Read | Update | Delete |
|---------|--------|------|--------|--------|
| Mesas | `POST /api/mesas` | `GET /api/mesas` | `PUT /api/mesas/:id` | `DELETE /api/mesas/:id` |
| Áreas | `POST /api/areas` | `GET /api/areas` | `PUT /api/areas/:id` | `DELETE /api/areas/:id` |
| Mozos | `POST /api/mozos` | `GET /api/mozos` | `PUT /api/mozos/:id` | `DELETE /api/mozos/:id` |
| Platos | `POST /api/platos` | `GET /api/platos` | `PUT /api/platos/:id` | `DELETE /api/platos/:id` |
| Comandas | — | `GET /api/comanda` | `PUT /api/comanda/:id` | `DELETE /api/comanda/:id` |
| Bouchers | — | `GET /api/bouchers` | — | — |
| Clientes | — | `GET /api/clientes` | `PUT /api/clientes/:id` | — |
| Auditoría | — | `GET /api/auditoria/comandas` | — | — |
| Platos Cat. | — | `GET /api/platos/categorias` | — | — |

### Endpoints de Reportes por Sección
| Sección | Endpoint | Filtros |
|---------|----------|---------|
| General | `GET /api/reportes/general` | `fecha_inicio`, `fecha_fin`, `agrupar` |
| Platos | `GET /api/reportes/platos` | `categoria`, `tipo`, `incluir_complementos` |
| Mozos | `GET /api/reportes/mozos` | `mozo_id`, `turno` |
| Mesas | `GET /api/reportes/mesas` | `area`, `mesa`, `estado` |
| Clientes | `GET /api/reportes/clientes` | `tipo`, `buscar` |

### Endpoints de Dashboard Configurable
| Acción | Endpoint | Método |
|--------|----------|--------|
| Obtener layout | `GET /api/dashboard/layout` | GET |
| Guardar layout | `POST /api/dashboard/layout` | POST |
| Layouts predefinidos | `GET /api/dashboard/layouts/presets` | GET |

### Endpoints de Cierre de Caja con Complementos
| Acción | Endpoint | Método |
|--------|----------|--------|
| Desglose complementos | `GET /api/cierre/complementos` | GET |
| Exportar cierre (PDF) | `GET /api/cierre/exportar/pdf` | GET |
| Exportar complementos (Excel) | `GET /api/cierre/complementos/excel` | GET |

---

## Funcionalidades Clave Identificadas

1. **6 estados de mesa:** libre, esperando, pedido, preparado, pagado, reservado
2. **MODO LIBRE TOTAL:** liberar todas las mesas de golpe
3. **Complementos de platos:** editor dinámico de grupos/opciones
4. **Sub-tabs en Platos:** Todos, Desayuno, Carta
5. **Exportación:** PDF (jsPDF), Excel (XLSX), CSV (clientes)
6. **Tiempo real:** Socket.io para comandas, platos, bouchers
7. **Auditoría completa:** tracking de eliminaciones, ediciones, IP
8. **Cierre de caja:** con reporte detallado y sub-tabs (Resumen, Productos, Mozos, Mesas, Clientes, Auditoría)
9. **Reportes LIVE:** con Chart.js, agrupación por Día/Hora/Mesa
10. **Configuración centralizada:** 10 categorías de ajustes (General, Moneda, Mesas, Cocina, Pagos, Notificaciones, Cierre, Seguridad, Integraciones, Avanzado)
11. **Reportes con secciones:** 5 vistas (General, Platos, Mozos, Mesas, Clientes) con filtros específicos, gráficos y tablas por sección. Section tabs en topbar con underline dorado activo. Cada sección tiene filtros contextuales (ej: Platos → Categoría/Tipo/Complementos, Mozos → Mozo/Turno, Mesas → Área/N°Mesa/Estado, Clientes → Tipo/Buscar)
12. **Tablas de datos detalladas:** Cada sección de reportes incluye tablas con datos exportables, sorteo por columna, badges de estado coloreados y filas totalizadas
13. **Heatmap de ocupación:** Matriz día×hora con celdas coloreadas según % ocupación para análisis visual de patrones
14. **Cierre de Caja con complementos:** Desglose detallado de complementos vendidos con tabs (Platos/Complementos/Categorías), mini-cards por tipo, tabla con badges, y panel de análisis comparativo (ticket CON vs SIN complementos, +62% incremento)
15. **Vista dual de Mesas:** Toggle tarjetas/tabla con filtros avanzados (mozo, área, estado), acciones masivas (liberar, cambiar área), badges de estado y área, paginación y exportación Excel
16. **Dashboard configurable con widgets:** Sistema de widgets drag & drop con catálogo (26 widgets en 4 categorías: Métricas, Gráficos, Operaciones, Análisis), panel lateral de personalización, layouts guardados (Ejecutivo, Operativo, Analítico, Minimalista), persistencia en MongoDB
17. **Topbar rediseñada (72px):** Breadcrumb navegable, buscador global con autocompletado (agrupado por Platos/Mesas/Comandas), reloj en tiempo real con fecha, indicador de estado del sistema (conexiones Socket.io + servicios), atajos rápidos con shortcuts de teclado (Ctrl+K/N/P/M/R), notificaciones con 4 tipos (urgente/advertencia/info/éxito) y estados leído/no leído, perfil con toggles y badge de rol
18. **Platos con complementos mejorados:** Tabla Pro con columna Complementos (badges "● X grupos" + nombres), barra de filtros (búsqueda, categoría, stock, checkbox "solo con complementos"), panel lateral con sección de resumen de complementos (KPIs + grupos más usados), 4 sub-tabs con conteos, paginación
19. **Familia de modals CRUD:** Patrón base reutilizable (header con título/subtítulo/X, body scrollable, footer con botones), implementado para: Crear Plato (con editor visual de complementos), Ver Comanda (tabla con complementos seleccionados + timeline de estados), Ver Boucher (totales IGV + tabla + info de pago), Crear Mesa, Crear Mozo, Editar Cliente, Ver Auditoría (diff de cambios antes/después + payload JSON)

---

## Estructura del Sidebar (Menú de navegación)

Orden de los ítems del sidebar en todos los frames:

1. `📊 Dashboard` (y: 172)
2. `🪑 Mesas` (y: 216)
3. `🗺️ Áreas` (y: 260)
4. `👤 Mozos` (y: 304)
5. `🍲 Platos` (y: 348)
6. `📋 Comandas` (y: 392)
7. `🧂 Bouchers` (y: 436)
8. `👥 Clientes` (y: 480)
9. `🔍 Auditoría` (y: 524)
10. `💰 Cierre Caja` (y: 568)
11. `📊 Reportes` (y: 612)
12. `⚙️ Configuración` (y: 656)

El ítem activo tiene:
- Fondo: `#d4af3720` (dorado 12%)
- Indicador izquierdo: rectángulo 4px × 44px en `#d4af37`
- Texto: `#d4af37` con fontWeight `500`

---

## Estructura de Configuración — Tabs y Campos

El frame Configuración (`yg9wT`) contiene 10 tabs, cada uno con campos específicos para el backend (colección `configuracion` en MongoDB):

| # | Tab | Campos clave |
|---|-----|-------------|
| 1 | General | nombre, logo, dirección, teléfono, email, RUC, horario_apertura, horario_cierre, zona_horaria, idioma |
| 2 | Moneda y Precios | moneda, simbolo_moneda, decimales, redondeo_auto, igv_porcentaje, igv_incluido |
| 3 | Mesas y Áreas | alerta_espera_min, auto_liberacion, permitir_reservas, duracion_max_reserva, estados_habilitados, colores_estado |
| 4 | Cocina | alerta_amarillo_min, alerta_rojo_min, sonido_notif, volumen, auto_impresion, impresora_default, mostrar_complementos |
| 5 | Pagos y Facturación | metodos_pago[], propinas_habilitadas, propina_sugerida_pct, descuentos_habilitados, descuento_max_pct, comprobante_default, numeracion_auto, prefijo_boucher, serie_comprobantes |
| 6 | Notificaciones | push_habilitado, email_alertas, alerta_mesa_abandonada, stock_bajo_alerta, stock_minimo, notif_nuevas_comandas, notif_comandas_listas |
| 7 | Cierre de Caja | cierre_automatico, hora_cierre_auto, validacion_admin, export_auto_pdf, export_auto_excel, email_reportes, desglose_complementos |
| 8 | Seguridad | sesiones_simultaneas, timeout_inactividad_min, requiere_2fa, auditoria_extendida, logs_detallados, ip_permitidas[] |
| 9 | Integraciones | socketio_activo, redis_activo, endpoint_api_externo, webhook_comandas, token_integracion |
| 10 | Avanzado | modo_mantenimiento, mensaje_mantenimiento, sync_json_legacy, version_sistema, fecha_actualizacion |

---

## Notas para Desarrollo

- El archivo `.pen` es la **fuente de diseño** para el nuevo dashboard
- Cada frame es una vista/página completa del sistema
- La implementación en código debe respetar la paleta de colores, tipografía y estructura de layout
- Las tablas usan headers con fondo `#12121a` y cornerRadius superior
- Los botones primarios usan fondo `#d4af37` con texto `#0a0a0f`
- Los botones secundarios usan borde `#d4af37` con texto dorado
- Los botones destructivos usan `#ff4757`
