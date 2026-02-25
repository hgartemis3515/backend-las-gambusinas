# Contenido de `public` — Las Gambusinas

Con `npm start` el servidor Express sirve esta carpeta. Rutas principales:

| Ruta | Archivo | Descripción |
|------|---------|-------------|
| `/` | `index.html` | Dashboard multi-página (mesas, platos, comandas, etc.) |
| `/login` | `login.html` | Inicio de sesión (diseño según pencil-new.pen) |
| `/dashboard/login.html` | `login.html` | Mismo login (redirección de rutas antiguas) |
| `/dashboard` | `dashboard/lasgambusinas-dashboard.html` | Dashboard completo (protegido por token) |
| `/admin` | `admin.html` | Panel de administración |
| `/index.html` | `index.html` | Igual que `/` |
| `/lasgambusinas-dashboard.html` | `lasgambusinas-dashboard.html` | Dashboard completo (acceso directo, sin protección) |

## Estructura de archivos

```
public/
├── index.html              # Entrada principal: dashboard multi-página
├── login.html              # Login (igual que frame Login de pencil-new.pen)
├── lasgambusinas-dashboard.html   # Dashboard todo-en-uno (acceso directo)
├── admin.html
├── mesas.html, mozos.html, platos.html, comandas.html, bouchers.html,
│   clientes.html, auditoria.html, cierre-caja.html, reportes.html, configuracion.html
├── assets/
│   ├── css/dashboard.css
│   ├── js/shared.js, charts.js, modals.js
│   └── components/topbar.html, sidebar.html
├── dashboard/
│   ├── lasgambusinas-dashboard.html   # Servido en /dashboard (con auth)
│   ├── login.html                     # Antiguo; usar /login
│   ├── DESIGN_MODEL_DASHBOARD.md, wireframe-model.html
│   └── assets/   # CSS/JS del dashboard premium y login
└── pencil-new.pen
```

## Resumen

- **Al hacer `npm start` y abrir `http://localhost:3000`** se muestra el mismo `index.html` (dashboard multi-página). Ya no aparece la página de “Backend API funcionando”.
- **Login** está en `/login` y su diseño coincide con el frame **Login** de `pencil-new.pen` (fondo radial oscuro, card #12121a, acentos #d4af37, “Bienvenido de vuelta”, “Iniciar Sesión”).
- **Dashboard completo** (todo en una página): acceso directo en `/lasgambusinas-dashboard.html` o, con token, en `/dashboard`.
