# Cómo abrir el dashboard Las Gambusinas

## Con npm start (Express)

En la raíz del proyecto:

```bash
npm start
```

Luego en el navegador:

| Qué quieres ver | URL |
|----------------|-----|
| **Dashboard principal (multi-página)** | http://localhost:3000/ o http://localhost:3000/index.html |
| **Login** | http://localhost:3000/login |
| **Dashboard completo (todo en uno, sin login)** | http://localhost:3000/lasgambusinas-dashboard.html |
| **Dashboard completo (con token, tras login)** | http://localhost:3000/dashboard |
| **Panel admin** | http://localhost:3000/admin |

Al abrir **http://localhost:3000** ya no verás la página de “Backend API”; se muestra directamente el dashboard (`index.html`).

## Por archivo (file://)

- **Dashboard completo:**  
  `file:///e:/PROYECTOGAMBUSINAS/Backend-LasGambusinas/public/lasgambusinas-dashboard.html`

- **Desde el proyecto:**  
  `Backend-LasGambusinas/public/lasgambusinas-dashboard.html`

## Desde el propio dashboard

En **index.html** (multi-página), en el sidebar abajo del botón “Colapsar” está el enlace **“Dashboard completo”** que abre `lasgambusinas-dashboard.html`.
