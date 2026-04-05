# Usuarios, Roles y Permisos - Backend Las Gambusinas

**Versión:** 1.0  
**Última Actualización:** Abril 2026  
**Modelo Principal:** `mozos.model.js`

---

## Resumen Ejecutivo

El sistema utiliza un modelo unificado donde **todo el personal del restaurante** (mozos, cocineros, supervisores, administradores) se almacena en la colección `mozos`. El campo `rol` determina los permisos y accesos a cada aplicación.

---

## 1. Modelo de Datos de Usuario

### Archivo: `src/database/models/mozos.model.js`

### Schema Completo

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `mozoId` | Number | Auto | ID auto-incremental único |
| `name` | String | Sí | Nombre completo (sincronizado con nombres + apellidos) |
| `nombres` | String | No | Nombres del personal |
| `apellidos` | String | No | Apellidos del personal |
| `DNI` | Number | Sí | Documento de identidad (usado para login) |
| `phoneNumber` | Number | Sí | Número de teléfono |
| `fotoUrl` | String | No | URL de foto de perfil |
| `email` | String | No | Correo electrónico |
| `fechaNacimiento` | Date | No | Fecha de nacimiento |
| `genero` | String | No | Género |
| `direccion` | String | No | Dirección |
| `contactoEmergenciaNombre` | String | No | Nombre contacto de emergencia |
| `contactoEmergenciaTelefono` | String | No | Teléfono contacto de emergencia |
| `pinAcceso` | String | No | PIN numérico para POS (alternativa al DNI) |
| `usuarioWeb` | String | No | Usuario para acceso web |
| `passwordWeb` | String | No | Contraseña para acceso web |
| `rol` | String | Sí | Rol del usuario (ver sección Roles) |
| `permisos` | Array | No | Permisos personalizados |
| `zonaIds` | Array[ObjectId] | No | Zonas asignadas (para cocineros) |
| `activo` | Boolean | No | Estado activo/inactivo (default: true) |
| `enTurno` | Boolean | No | Si está en turno actualmente |

---

## 2. Roles del Sistema

### Roles Disponibles

```javascript
const ROLES = ['admin', 'supervisor', 'cocinero', 'mozos', 'cajero', 'capitanMozos'];
```

### Descripción de Roles

| Rol | Descripción | Aplicaciones con Acceso |
|-----|-------------|------------------------|
| **admin** | Administrador total del sistema | Dashboard, App Mozos, App Cocina, Panel Admin |
| **supervisor** | Supervisor con acceso a gestión y reportes | Dashboard, App Mozos, App Cocina |
| **cocinero** | Personal de cocina | App Cocina |
| **mozos** | Personal de sala (meseros) | App Mozos |
| **capitanMozos** | Capitán de mozos con permisos extendidos | App Mozos |
| **cajero** | Personal de caja | App Mozos (solo pagos) |

---

## 3. Sistema de Permisos

### 3.1 Permisos Fundamentales

```javascript
const PERMISOS_FUNDAMENTALES = {
    // Backend/Dashboard - Gestión general
    'ver-mesas': { nombre: 'Ver Mesas', grupo: 'Backend/Dashboard' },
    'editar-mesas': { nombre: 'Editar Mesas', grupo: 'Backend/Dashboard' },
    'juntar-separar-mesas': { nombre: 'Juntar y Separar Mesas', grupo: 'Backend/Dashboard' },
    'ver-platos': { nombre: 'Ver Platos', grupo: 'Backend/Dashboard' },
    'editar-platos': { nombre: 'Editar Platos', grupo: 'Backend/Dashboard' },
    'ver-areas': { nombre: 'Ver Áreas', grupo: 'Backend/Dashboard' },
    'editar-areas': { nombre: 'Editar Áreas', grupo: 'Backend/Dashboard' },
    'ver-clientes': { nombre: 'Ver Clientes', grupo: 'Backend/Dashboard' },
    'editar-clientes': { nombre: 'Editar Clientes', grupo: 'Backend/Dashboard' },
    'ver-mozos': { nombre: 'Ver Mozos', grupo: 'Backend/Dashboard' },
    'editar-mozos': { nombre: 'Editar Mozos', grupo: 'Backend/Dashboard' },
    'gestionar-roles': { nombre: 'Gestionar Roles', grupo: 'Backend/Dashboard' },
    'ver-auditoria': { nombre: 'Ver Auditoría', grupo: 'Backend/Dashboard' },
    'ver-reportes': { nombre: 'Ver Reportes', grupo: 'Backend/Dashboard' },
    'cierre-caja': { nombre: 'Cierre de Caja', grupo: 'Backend/Dashboard' },
    'ver-notificaciones': { nombre: 'Ver Notificaciones', grupo: 'Backend/Dashboard' },
    
    // App Mozos
    'crear-comandas': { nombre: 'Crear Comandas', grupo: 'App Mozos' },
    'editar-comandas': { nombre: 'Editar Comandas', grupo: 'App Mozos' },
    'eliminar-platos-comandas': { nombre: 'Eliminar Platos/Comandas', grupo: 'App Mozos' },
    'procesar-pagos': { nombre: 'Procesar Pagos/Bouchers', grupo: 'App Mozos' },
    'asociar-clientes': { nombre: 'Asociar Clientes', grupo: 'App Mozos' },
    
    // App Cocina
    'ver-comandas-cocina': { nombre: 'Ver Comandas Cocina', grupo: 'App Cocina' },
    'cambiar-estados-platos': { nombre: 'Cambiar Estados Platos', grupo: 'App Cocina' },
    'revertir-comandas': { nombre: 'Revertir Comandas', grupo: 'App Cocina' }
};
```

### 3.2 Permisos por Rol (Default)

| Permiso | admin | supervisor | cocinero | mozos | capitanMozos | cajero |
|---------|:-----:|:----------:|:--------:|:-----:|:------------:|:------:|
| **Backend/Dashboard** |
| ver-mesas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| editar-mesas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| juntar-separar-mesas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ver-platos | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| editar-platos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ver-areas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| editar-areas | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ver-clientes | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| editar-clientes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ver-mozos | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| editar-mozos | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| gestionar-roles | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ver-auditoria | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| ver-reportes | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| cierre-caja | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| ver-notificaciones | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **App Mozos** |
| crear-comandas | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| editar-comandas | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| eliminar-platos-comandas | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| procesar-pagos | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| asociar-clientes | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **App Cocina** |
| ver-comandas-cocina | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| cambiar-estados-platos | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| revertir-comandas | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |

---

## 4. Autenticación

### 4.1 Middleware de Autenticación

#### Archivo: `src/middleware/adminAuth.js`

Middleware JWT para rutas HTTP protegidas del Dashboard.

**Uso:**
- Valida token JWT en header `Authorization: Bearer <token>`
- Adjunta `req.usuario` con datos del usuario autenticado
- Verifica permisos específicos según endpoint

#### Archivo: `src/middleware/socketAuth.js`

Middleware JWT para conexiones Socket.io.

**Características:**
- Validación JWT en conexión de sockets
- Verificación de roles por namespace
- Advertencia de token próximo a expirar (<5 min)
- Rate limiting configurable

### 4.2 Endpoints de Autenticación

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/admin/auth` | POST | Login (body: `{ username, password }`) |
| `/api/admin/verify` | GET | Verificar token JWT |
| `/api/admin/perfil` | GET | Obtener perfil del usuario autenticado |
| `/api/mozos/auth` | POST | Login para App Mozos |

### 4.3 Estructura del Token JWT

```javascript
{
    usuarioId: ObjectId,
    rol: String,
    nombre: String,
    DNI: Number,
    iat: Number,    // Issued at
    exp: Number     // Expiration
}
```

---

## 5. Autorización por Namespace Socket.io

### Roles Permitidos por Namespace

| Namespace | Roles Permitidos | Aplicación |
|-----------|------------------|------------|
| `/cocina` | cocinero, admin, supervisor | App Cocina |
| `/mozos` | mozos, admin, supervisor, capitanMozos, cajero | App Mozos |
| `/admin` | admin, supervisor | Dashboard Admin |

### Implementación

```javascript
// Ejemplo de validación en socketAuth.js
const authenticateCocina = async (socket, next) => {
    const { rol } = socket.usuario;
    if (!['cocinero', 'admin', 'supervisor'].includes(rol)) {
        return next(new Error('No autorizado para namespace /cocina'));
    }
    next();
};
```

---

## 6. Permisos Personalizados

### Estructura

Los usuarios pueden tener permisos personalizados que sobrescriben los del rol:

```javascript
permisos: [
    { permiso: 'ver-mesas', permitido: true },
    { permiso: 'editar-mesas', permitido: false }
]
```

### Virtual: permisosEfectivos

```javascript
// Obtener permisos efectivos combinando rol + personalizados
const permisosEfectivos = usuario.permisosEfectivos;
// Retorna array de permisos activos
```

---

## 7. Acceso por Aplicación

### 7.1 App de Mozos (React Native + Expo)

**Usuarios con Acceso:** mozos, capitanMozos, cajero, admin, supervisor

**Permisos Relevantes:**
- `crear-comandas`: Crear nuevas comandas
- `editar-comandas`: Modificar comandas existentes
- `eliminar-platos-comandas`: Eliminar platos o comandas
- `procesar-pagos`: Generar bouchers y procesar pagos
- `asociar-clientes`: Vincular clientes a comandas

**Flujo de Autenticación:**
1. Usuario ingresa DNI o PIN en la app
2. Backend valida en `/api/mozos/auth`
3. Retorna JWT con permisos
4. App almacena token y lo usa en cada request

### 7.2 App de Cocina (React + Vite)

**Usuarios con Acceso:** cocinero, admin, supervisor

**Permisos Relevantes:**
- `ver-comandas-cocina`: Ver tablero KDS
- `cambiar-estados-platos`: Marcar platos como preparando/listo
- `revertir-comandas`: Deshacer cambios

**Namespace Socket.io:** `/cocina`

**Flujo de Autenticación:**
1. Cocinero selecciona su perfil en la app
2. Backend valida credenciales
3. Conecta a namespace `/cocina` con JWT
4. Recibe comandas filtradas por zona asignada

### 7.3 Dashboard Admin (HTML + Tailwind + Alpine.js)

**Usuarios con Acceso:** admin, supervisor

**Permisos Completos (admin):**
- Gestión de mesas, platos, áreas, clientes, mozos
- Reportes y auditoría
- Cierre de caja
- Gestión de roles y permisos

**Permisos Limitados (supervisor):**
- Ver y editar mesas, platos, áreas
- Ver reportes y auditoría
- Ver mozos (sin editar)

**Namespace Socket.io:** `/admin`

---

## 8. Gestión de Usuarios

### Endpoints CRUD

| Endpoint | Método | Descripción | Permiso Requerido |
|----------|--------|-------------|-------------------|
| `/api/mozos` | GET | Listar todos | `ver-mozos` |
| `/api/mozos/:id` | GET | Obtener por ID | `ver-mozos` |
| `/api/mozos` | POST | Crear usuario | `editar-mozos` |
| `/api/mozos/:id` | PUT | Actualizar usuario | `editar-mozos` |
| `/api/mozos/:id` | DELETE | Eliminar usuario | `editar-mozos` |

### Endpoints de Roles y Permisos

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/cocineros/:id/asignar-rol` | POST | Asignar rol de cocinero |
| `/api/cocineros/:id/quitar-rol` | POST | Quitar rol de cocinero |

---

## 9. Auditoría de Acciones

El sistema registra todas las acciones relevantes con información del usuario:

### Modelo: `auditoriaAcciones.model.js`

| Campo | Descripción |
|-------|-------------|
| `usuarioId` | ID del usuario que realizó la acción |
| `usuarioNombre` | Nombre del usuario |
| `accion` | Tipo de acción (comanda_eliminada, plato_modificado, etc.) |
| `fecha` | Timestamp de la acción |
| `ip` | Dirección IP |
| `detalles` | Información adicional |

---

## 10. Sesiones de Usuario

### Modelo: `sesionesUsuarios.model.js`

Registra sesiones activas de cada usuario:

| Campo | Descripción |
|-------|-------------|
| `usuarioId` | Referencia al usuario |
| `fechaInicio` | Inicio de sesión |
| `fechaFin` | Fin de sesión |
| `dispositivo` | Tipo de dispositivo |
| `ip` | Dirección IP |

---

## 11. Diagrama de Accesos

```
┌─────────────────────────────────────────────────────────────────────┐
│                        SISTEMA DE PERMISOS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   admin     │    │ supervisor  │    │       cocinero          │ │
│  ├─────────────┤    ├─────────────┤    ├─────────────────────────┤ │
│  │ Dashboard   │    │ Dashboard   │    │ App Cocina              │ │
│  │ App Mozos   │    │ App Mozos   │    │ - Ver comandas         │ │
│  │ App Cocina  │    │ App Cocina  │    │ - Cambiar estados      │ │
│  │ Panel Admin │    │             │    │ - Revertir             │ │
│  │ (TODO)      │    │ (Limitado)  │    └─────────────────────────┘ │
│  └─────────────┘    └─────────────┘                                  │
│                                                                     │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │   mozos     │    │capitanMozos │    │       cajero            │ │
│  ├─────────────┤    ├─────────────┤    ├─────────────────────────┤ │
│  │ App Mozos   │    │ App Mozos   │    │ App Mozos              │ │
│  │ - Crear     │    │ - Crear     │    │ - Procesar pagos       │ │
│  │ - Editar    │    │ - Editar    │    │ - Cierre de caja       │ │
│  │ - Asociar   │    │ - Eliminar  │    └─────────────────────────┘ │
│  │   clientes  │    │ - Procesar  │                               │
│  └─────────────┘    │   pagos     │                               │
│                     └─────────────┘                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 12. Mejoras Futuras

1. **Modelo Usuario separado:** Considerar separar usuarios de personal (mozos)
2. **Roles personalizados:** Implementar creación de roles dinámicos
3. **Permisos granulares:** Agregar permisos a nivel de recurso específico
4. **2FA:** Implementar autenticación de dos factores
5. **Logs de seguridad:** Mejorar trazabilidad de acciones sensibles

---

## Referencias

- Modelo: `src/database/models/mozos.model.js`
- Middleware JWT: `src/middleware/adminAuth.js`
- Middleware Socket: `src/middleware/socketAuth.js`
- Controller: `src/controllers/adminController.js`
- Documentación completa: `docs/automated/BACKEND_LASGAMBUSINAS_DOCUMENTACION_COMPLETA.md`
