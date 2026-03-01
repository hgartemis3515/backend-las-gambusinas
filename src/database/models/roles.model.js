/**
 * ROLES MODEL
 * Modelo para roles personalizados del sistema
 */

const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

// Roles del sistema (no editables)
const ROLES_SISTEMA = ['admin', 'supervisor', 'cocinero', 'mozos', 'cajero'];

// Permisos fundamentales disponibles
const PERMISOS_FUNDAMENTALES = {
    // Backend/Dashboard - Gestión general
    'ver-mesas': { nombre: 'Ver Mesas', grupo: 'Backend/Dashboard', descripcion: 'Visualizar lista y estado de mesas' },
    'editar-mesas': { nombre: 'Editar Mesas', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar mesas' },
    'ver-platos': { nombre: 'Ver Platos', grupo: 'Backend/Dashboard', descripcion: 'Visualizar menú y lista de platos' },
    'editar-platos': { nombre: 'Editar Platos', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar platos del menú' },
    'ver-areas': { nombre: 'Ver Áreas', grupo: 'Backend/Dashboard', descripcion: 'Visualizar áreas del restaurante' },
    'editar-areas': { nombre: 'Editar Áreas', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar áreas' },
    'ver-clientes': { nombre: 'Ver Clientes', grupo: 'Backend/Dashboard', descripcion: 'Visualizar lista de clientes' },
    'editar-clientes': { nombre: 'Editar Clientes', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar clientes' },
    'ver-mozos': { nombre: 'Ver Usuarios', grupo: 'Backend/Dashboard', descripcion: 'Visualizar lista de usuarios' },
    'editar-mozos': { nombre: 'Editar Usuarios', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar usuarios' },
    'gestionar-roles': { nombre: 'Gestionar Roles', grupo: 'Backend/Dashboard', descripcion: 'Crear y asignar roles y permisos' },
    'ver-auditoria': { nombre: 'Ver Auditoría', grupo: 'Backend/Dashboard', descripcion: 'Acceder al registro de acciones del sistema' },
    'ver-reportes': { nombre: 'Ver Reportes', grupo: 'Backend/Dashboard', descripcion: 'Acceder a reportes y estadísticas' },
    'cierre-caja': { nombre: 'Cierre de Caja', grupo: 'Backend/Dashboard', descripcion: 'Realizar cierre de caja diario' },
    'ver-notificaciones': { nombre: 'Ver Notificaciones', grupo: 'Backend/Dashboard', descripcion: 'Acceder al centro de notificaciones' },
    
    // App Mozos
    'crear-comandas': { nombre: 'Crear Comandas', grupo: 'App Mozos', descripcion: 'Crear nuevas comandas en App Mozos' },
    'editar-comandas': { nombre: 'Editar Comandas', grupo: 'App Mozos', descripcion: 'Modificar comandas existentes' },
    'eliminar-platos-comandas': { nombre: 'Eliminar Platos/Comandas', grupo: 'App Mozos', descripcion: 'Eliminar platos o comandas completas' },
    'procesar-pagos': { nombre: 'Procesar Pagos/Bouchers', grupo: 'App Mozos', descripcion: 'Generar bouchers y procesar pagos' },
    'asociar-clientes': { nombre: 'Asociar Clientes', grupo: 'App Mozos', descripcion: 'Vincular clientes a comandas' },
    
    // App Cocina
    'ver-comandas-cocina': { nombre: 'Ver Comandas Cocina', grupo: 'App Cocina', descripcion: 'Ver comandas en App Cocina' },
    'cambiar-estados-platos': { nombre: 'Cambiar Estados Platos', grupo: 'App Cocina', descripcion: 'Marcar platos como preparando/listo/entregado' },
    'revertir-comandas': { nombre: 'Revertir Comandas', grupo: 'App Cocina', descripcion: 'Deshacer comandas desde cocina' }
};

// Permisos por defecto para roles del sistema
const PERMISOS_POR_ROL_SISTEMA = {
    admin: Object.keys(PERMISOS_FUNDAMENTALES),
    supervisor: [
        'ver-mesas', 'editar-mesas', 'ver-platos', 'editar-platos', 'ver-areas', 'editar-areas',
        'ver-clientes', 'editar-clientes', 'ver-mozos', 'ver-auditoria', 'ver-reportes',
        'cierre-caja', 'ver-notificaciones', 'crear-comandas', 'editar-comandas',
        'procesar-pagos', 'asociar-clientes', 'ver-comandas-cocina'
    ],
    cocinero: [
        'ver-platos', 'ver-comandas-cocina', 'cambiar-estados-platos', 'revertir-comandas'
    ],
    mozos: [
        'ver-mesas', 'ver-platos', 'ver-clientes', 'crear-comandas', 'editar-comandas',
        'asociar-clientes'
    ],
    cajero: [
        'ver-mesas', 'ver-platos', 'ver-clientes', 'procesar-pagos', 'cierre-caja'
    ]
};

const rolesSchema = new mongoose.Schema({
    rolId: { type: Number, unique: true },
    nombre: { 
        type: String, 
        required: true, 
        unique: true,
        lowercase: true,
        trim: true
    },
    nombreDisplay: { 
        type: String, 
        required: true 
    },
    descripcion: { 
        type: String, 
        default: '' 
    },
    permisos: [{ 
        type: String, 
        enum: Object.keys(PERMISOS_FUNDAMENTALES) 
    }],
    esSistema: { 
        type: Boolean, 
        default: false 
    },
    activo: { 
        type: Boolean, 
        default: true 
    },
    color: {
        type: String,
        default: 'st-libre'
    },
    creadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'mozos'
    }
}, { 
    timestamps: true 
});

rolesSchema.plugin(AutoIncrement, { inc_field: 'rolId' });

// Índices
rolesSchema.index({ nombre: 1 });
rolesSchema.index({ esSistema: 1 });

const roles = mongoose.model('roles', rolesSchema);

module.exports = roles;
module.exports.ROLES_SISTEMA = ROLES_SISTEMA;
module.exports.PERMISOS_FUNDAMENTALES = PERMISOS_FUNDAMENTALES;
module.exports.PERMISOS_POR_ROL_SISTEMA = PERMISOS_POR_ROL_SISTEMA;
