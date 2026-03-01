const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

// Roles disponibles en el sistema
const ROLES = ['admin', 'supervisor', 'cocinero', 'mozos', 'cajero'];

// Permisos fundamentales agrupados por aplicación
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
    'ver-mozos': { nombre: 'Ver Mozos', grupo: 'Backend/Dashboard', descripcion: 'Visualizar lista de personal' },
    'editar-mozos': { nombre: 'Editar Mozos', grupo: 'Backend/Dashboard', descripcion: 'Crear, modificar y eliminar mozos' },
    'gestionar-roles': { nombre: 'Gestionar Roles', grupo: 'Backend/Dashboard', descripcion: 'Asignar y modificar roles y permisos' },
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

// Permisos por defecto según rol
const PERMISOS_POR_ROL = {
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

const permisoSchema = new mongoose.Schema({
    permiso: { type: String, required: true, enum: Object.keys(PERMISOS_FUNDAMENTALES) },
    permitido: { type: Boolean, default: true }
}, { _id: false });

const mozosSchema = new mongoose.Schema({
    mozoId: { type: Number, unique: true },
    name: { type: String, required: true },
    DNI: { type: Number, required: true, min: 0 },
    phoneNumber: { type: Number, required: true, min: 0 },
    rol: { 
        type: String, 
        enum: ROLES, 
        default: 'mozos',
        required: true
    },
    permisos: [permisoSchema],
    activo: { type: Boolean, default: true }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual para obtener permisos efectivos (rol + personalizados)
mozosSchema.virtual('permisosEfectivos').get(function() {
    const permisosRol = PERMISOS_POR_ROL[this.rol] || [];
    const permisosPersonalizados = this.permisos || [];
    
    // Si tiene permisos personalizados, estos sobrescriben los del rol
    if (permisosPersonalizados.length > 0) {
        const permisosMap = new Map();
        
        // Primero agregar permisos del rol
        permisosRol.forEach(p => permisosMap.set(p, true));
        
        // Luego sobrescribir con permisos personalizados
        permisosPersonalizados.forEach(p => {
            permisosMap.set(p.permiso, p.permitido);
        });
        
        return Array.from(permisosMap.entries())
            .filter(([_, permitido]) => permitido)
            .map(([permiso]) => permiso);
    }
    
    return permisosRol;
});

// Método estático para obtener roles disponibles
mozosSchema.statics.getRoles = function() {
    return ROLES;
};

// Método estático para obtener permisos fundamentales
mozosSchema.statics.getPermisosFundamentales = function() {
    return PERMISOS_FUNDAMENTALES;
};

// Método estático para obtener permisos por rol
mozosSchema.statics.getPermisosPorRol = function(rol) {
    return PERMISOS_POR_ROL[rol] || [];
};

mozosSchema.plugin(AutoIncrement, { inc_field: 'mozoId' });
const mozos = mongoose.model('mozos', mozosSchema);

module.exports = mozos;
module.exports.ROLES = ROLES;
module.exports.PERMISOS_FUNDAMENTALES = PERMISOS_FUNDAMENTALES;
module.exports.PERMISOS_POR_ROL = PERMISOS_POR_ROL;