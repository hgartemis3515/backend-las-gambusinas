# Modelo de dashboard — Las Gambusinas — Para Pencil y Figma

Especificación de diseño para recrear en **Pencil** (wireframes) y **Figma** (diseño final).  
Dimensiones base: **1440×900px** (desktop). Mobile: **375×812px**.

---

## 1. Estructura global (Frame principal)

| Zona        | Dimensiones      | Contenido |
|------------|------------------|-----------|
| **Topbar** | 100% × 68px      | Logo, búsqueda, reloj, notificaciones, avatar |
| **Sidebar**| 270px × calc(100% - 68px) | Navegación + ítem usuario abajo |
| **Content**| Resto             | Saludo, KPIs, mapa de mesas, gráfica, actividad |

---

## 2. Topbar (68px)

- **Izq:** Menú hamburguesa (solo mobile) | Logo "Las Gambusinas"
- **Centro:** Campo búsqueda (placeholder "Buscar...")
- **Derecha:** Reloj | Icono notificaciones (badge) | Avatar + nombre (dropdown)

---

## 3. Sidebar (270px, colapsado: 68px)

**Ítems de menú (orden):**
- Dashboard (activo)
- Mesas
- Áreas
- Mozos
- Platos
- Comandas
- Bouchers
- Clientes
- Auditoría
- Cierre Caja
- Separador
- Avatar + "Admin" / "Gerente" + flecha

Colapsado: solo iconos + tooltip al hover.

---

## 4. Área de contenido — Dashboard principal

### 4.1 Cabecera
- Texto: "Buenas tardes, Admin" (o según hora)
- Subtexto: "Lunes 23 Feb 2026" + botones [↺ Actualizar] [📊 Exportar]

### 4.2 KPI Cards (5 en fila)
| Card   | Título      | Valor ejemplo | Subtexto     |
|--------|-------------|---------------|--------------|
| 1      | Mesas       | 12/20         | 60%          |
| 2      | Ventas      | S/. 2k        | 47 tickets   |
| 3      | Platos top  | Ceviche / Paella | —        |
| 4      | Mozos       | Juan — S/.980 | —            |
| 5      | Alertas     | 2             | pendientes   |

Cada card: ícono (gold), título, número grande, subtexto.  
Estilo: `bg/card`, border sutil, border-radius 16px.

### 4.3 Dos columnas
- **Izq (~60%):** Mapa de mesas (grid de “mesa tiles”: M1, M2, …). Estados: libre (verde), ocupada (ámbar), pagando (rojo), reservada (azul).
- **Der (~40%):** Gráfica “Ventas por hora” (placeholder barras o línea).

### 4.4 Actividad reciente
- Lista: “Mesa 5 — Juan — Ceviche x2”, “Mesa 2 — María — Paella x1”, etc.

---

## 5. Panel detalle mesa (overlay / slide)

Al hacer clic en una mesa:
- Título: "Mesa 5 · Área: Terraza" + [Cerrar]
- Estado: Ocupada | Tiempo: 1h 23m
- Mozo, comensales
- Lista de pedido (ítem, cantidad, precio)
- Total
- Botones: [Liberar Mesa] [Ver Comanda]

---

## 6. Design tokens (Figma / CSS)

```
Backgrounds:  bg/primary #0a0a0f, bg/secondary #12121a, bg/card #1a1a28
Brand:        gold/primary #d4af37, gold/light #f4d03f, gold/dark #b8960c
Estados:      emerald #00d4aa, amber #ffa502, rose #ff4757, sapphire #5352ed
Text:         primary #fff, secondary rgba(255,255,255,0.65), muted 0.35
Borders:      border/subtle rgba(255,255,255,0.06), border/gold rgba(212,175,55,0.25)
```

---

## 7. Uso en Pencil

1. Abrir `pencil-new.pen` (o crear nuevo).
2. Crear **Frame 1440×900** “Dashboard Principal”.
3. Dentro del frame: rectángulos para Topbar, Sidebar, Content; dentro de Content: bloques para cabecera, 5 KPI cards, grid mesas, gráfica, actividad.
4. Opcional: Frames adicionales para Sidebar colapsado, Panel mesa, Dropdown usuario, Mobile 375px.

## 8. Uso en Figma

1. Crear archivo “Las Gambusinas — Dashboard v2.0”.
2. Definir variables de color según sección 6.
3. Crear componentes: KPI Card, Mesa Tile (variantes libre/ocupada/pagando/reservada), Sidebar Item.
4. Montar el layout del frame principal según esta especificación.
5. Usar `get_design_context` en Cursor para generar código a partir del diseño.

---

*Documento generado para uso con herramientas Pencil y Figma MCP en Cursor.*
