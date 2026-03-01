/**
 * ROLES REPOSITORY
 * Operaciones CRUD para gestión de roles y permisos
 */

const rolesModel = require('../database/models/roles.model');
const mozosModel = require('../database/models/mozos.model');
const { ROLES_SISTEMA, PERMISOS_FUNDAMENTALES, PERMISOS_POR_ROL_SISTEMA } = require('../database/models/roles.model');
const { syncJsonFile } = require('../utils/jsonSync');
const logger = require('../utils/logger');
const redisCache = require('../utils/redisCache');

const CACHE_TTL = 300; // 5 minutos

/**
 * Inicializar roles del sistema (crear si no existen)
 */
const inicializarRolesSistema = async () => {
    try {
        const colores = {
            admin: 'gold',
            supervisor: 'st-preparado',
            cocinero: 'st-pedido',
            mozos: 'st-libre',
            cajero: 'st-esperando'
        };

        const descripciones = {
            admin: 'Acceso total al sistema y todas las funcionalidades',
            supervisor: 'Gestión operativa, reportes y supervisión del personal',
            cocinero: 'Gestión de comandas en la cocina',
            mozos: 'Atención al cliente y gestión de pedidos',
            cajero: 'Procesamiento de pagos y cierre de caja'
        };

        for (const rolNombre of ROLES_SISTEMA) {
            const existe = await rolesModel.findOne({ nombre: rolNombre, esSistema: true });
            
            if (!existe) {
                await rolesModel.create({
                    nombre: rolNombre,
                    nombreDisplay: rolNombre.charAt(0).toUpperCase() + rolNombre.slice(1),
                    descripcion: descripciones[rolNombre] || '',
                    permisos: PERMISOS_POR_ROL_SISTEMA[rolNombre] || [],
                    esSistema: true,
                    activo: true,
                    color: colores[rolNombre] || 'st-libre'
                });
                logger.info(`Rol del sistema creado: ${rolNombre}`);
            } else {
                // Actualizar permisos si cambiaron
                existe.permisos = PERMISOS_POR_ROL_SISTEMA[rolNombre] || [];
                existe.descripcion = descripciones[rolNombre] || '';
                existe.color = colores[rolNombre] || 'st-libre';
                await existe.save();
            }
        }

        logger.info('Roles del sistema inicializados correctamente');
    } catch (error) {
        logger.error('Error al inicializar roles del sistema', { error: error.message });
        throw error;
    }
};

/**
 * Obtener todos los roles (sistema + personalizados)
 */
const obtenerTodosLosRoles = async () => {
    try {
        const roles = await rolesModel.find({ activo: true }).sort({ esSistema: -1, nombre: 1 }).lean();
        return roles.map(r => ({
            ...r,
            permisosDetalle: r.permisos.map(p => ({
                id: p,
                ...PERMISOS_FUNDAMENTALES[p]
            }))
        }));
    } catch (error) {
        logger.error('Error al obtener roles', { error: error.message });
        throw error;
    }
};

/**
 * Obtener un rol por ID
 */
const obtenerRolPorId = async (rolId) => {
    try {
        const cached = await redisCache.getCustom('rol', rolId);
        if (cached) return cached;

        let rol = await rolesModel.findById(rolId).lean();
        if (!rol) {
            rol = await rolesModel.findOne({ rolId: parseInt(rolId) }).lean();
        }

        if (rol) {
            await redisCache.setCustom('rol', rolId, rol, CACHE_TTL);
        }

        return rol;
    } catch (error) {
        logger.error('Error al obtener rol por ID', { error: error.message, rolId });
        throw error;
    }
};

/**
 * Crear un nuevo rol personalizado
 */
const crearRol = async (data, creadoPor = null) => {
    try {
        const { nombre, nombreDisplay, descripcion, permisos, color } = data;

        // Validar que no sea un nombre de sistema
        if (ROLES_SISTEMA.includes(nombre.toLowerCase())) {
            throw new Error(`No se puede crear un rol con nombre reservado del sistema: ${nombre}`);
        }

        // Verificar que no exista
        const existe = await rolesModel.findOne({ nombre: nombre.toLowerCase() });
        if (existe) {
            throw new Error(`Ya existe un rol con el nombre: ${nombre}`);
        }

        // Validar permisos
        const permisosValidos = (permisos || []).filter(p => PERMISOS_FUNDAMENTALES[p]);

        const nuevoRol = await rolesModel.create({
            nombre: nombre.toLowerCase(),
            nombreDisplay: nombreDisplay || nombre,
            descripcion: descripcion || '',
            permisos: permisosValidos,
            esSistema: false,
            activo: true,
            color: color || 'st-libre',
            creadoPor
        });

        logger.info('Rol personalizado creado', { 
            rolId: nuevoRol._id, 
            nombre: nuevoRol.nombre,
            creadoPor 
        });

        return nuevoRol.toObject();
    } catch (error) {
        logger.error('Error al crear rol', { error: error.message, data });
        throw error;
    }
};

/**
 * Actualizar un rol
 */
const actualizarRol = async (rolId, data) => {
    try {
        const mongoose = require('mongoose');
        let rol = null;

        // Intentar buscar por ObjectId si es válido
        if (mongoose.Types.ObjectId.isValid(rolId)) {
            rol = await rolesModel.findById(rolId);
        }

        // Si no se encontró, intentar por rolId numérico
        if (!rol) {
            const numId = parseInt(rolId);
            if (!isNaN(numId)) {
                rol = await rolesModel.findOne({ rolId: numId });
            }
        }

        if (!rol) {
            throw new Error('Rol no encontrado');
        }

        // No permitir modificar roles del sistema
        if (rol.esSistema) {
            throw new Error('No se puede modificar un rol del sistema');
        }

        // Actualizar campos
        if (data.nombreDisplay) rol.nombreDisplay = data.nombreDisplay;
        if (data.descripcion !== undefined) rol.descripcion = data.descripcion;
        if (data.permisos) {
            rol.permisos = data.permisos.filter(p => PERMISOS_FUNDAMENTALES[p]);
        }
        if (data.color) rol.color = data.color;
        if (data.activo !== undefined) rol.activo = data.activo;

        await rol.save({ validateModifiedOnly: true });

        // Invalidar cache
        await redisCache.invalidateCustom('rol', rolId);

        logger.info('Rol actualizado', { rolId: rol._id, nombre: rol.nombre });

        return rol.toObject();
    } catch (error) {
        logger.error('Error al actualizar rol', { error: error.message, rolId });
        throw error;
    }
};

/**
 * Eliminar un rol (soft delete)
 */
const eliminarRol = async (rolId) => {
    try {
        let rol = await rolesModel.findById(rolId);
        if (!rol) {
            rol = await rolesModel.findOne({ rolId: parseInt(rolId) });
        }

        if (!rol) {
            throw new Error('Rol no encontrado');
        }

        // No permitir eliminar roles del sistema
        if (rol.esSistema) {
            throw new Error('No se puede eliminar un rol del sistema');
        }

        // Verificar si hay usuarios usando este rol
        const usuariosConRol = await mozosModel.countDocuments({ rol: rol.nombre });
        if (usuariosConRol > 0) {
            throw new Error(`No se puede eliminar el rol porque ${usuariosConRol} usuario(s) lo están usando`);
        }

        // Soft delete
        rol.activo = false;
        await rol.save();

        // Invalidar cache
        await redisCache.invalidateCustom('rol', rolId);

        logger.info('Rol eliminado (soft delete)', { rolId: rol._id, nombre: rol.nombre });

        return { success: true, message: 'Rol eliminado correctamente' };
    } catch (error) {
        logger.error('Error al eliminar rol', { error: error.message, rolId });
        throw error;
    }
};

/**
 * Obtener permisos fundamentales disponibles
 */
const obtenerPermisosFundamentales = () => {
    return Object.entries(PERMISOS_FUNDAMENTALES).map(([key, value]) => ({
        id: key,
        nombre: value.nombre,
        grupo: value.grupo,
        descripcion: value.descripcion
    }));
};

/**
 * Obtener permisos agrupados
 */
const obtenerPermisosAgrupados = () => {
    const grupos = {};
    Object.entries(PERMISOS_FUNDAMENTALES).forEach(([key, value]) => {
        if (!grupos[value.grupo]) grupos[value.grupo] = [];
        grupos[value.grupo].push({
            id: key,
            nombre: value.nombre,
            descripcion: value.descripcion
        });
    });
    return grupos;
};

/**
 * Obtener un mozo con su rol y permisos efectivos
 */
const obtenerMozoConRol = async (mozoId) => {
    try {
        let mozo = await mozosModel.findById(mozoId).lean();
        if (!mozo) {
            mozo = await mozosModel.findOne({ mozoId: parseInt(mozoId) }).lean();
        }
        
        if (!mozo) return null;
        
        // Obtener permisos efectivos según el rol
        const permisosRol = PERMISOS_POR_ROL_SISTEMA[mozo.rol] || [];
        
        return {
            ...mozo,
            permisosEfectivos: permisosRol
        };
    } catch (error) {
        logger.error('Error al obtener mozo con rol', { error: error.message, mozoId });
        throw error;
    }
};

/**
 * Asignar rol a un usuario
 */
const asignarRolAUsuario = async (usuarioId, rolNombre) => {
    try {
        // Verificar que el rol existe
        const rol = await rolesModel.findOne({ nombre: rolNombre.toLowerCase(), activo: true });
        if (!rol) {
            throw new Error(`El rol "${rolNombre}" no existe`);
        }

        // Actualizar usuario
        let usuario = await mozosModel.findById(usuarioId);
        if (!usuario) {
            usuario = await mozosModel.findOne({ mozoId: parseInt(usuarioId) });
        }

        if (!usuario) {
            throw new Error('Usuario no encontrado');
        }

        usuario.rol = rolNombre.toLowerCase();
        await usuario.save();

        // Invalidar cache del usuario
        await redisCache.invalidateCustom('mozo:rol', usuarioId);

        logger.info('Rol asignado a usuario', { 
            usuarioId: usuario._id, 
            rol: rolNombre 
        });

        return usuario.toObject();
    } catch (error) {
        logger.error('Error al asignar rol a usuario', { error: error.message, usuarioId, rolNombre });
        throw error;
    }
};

/**
 * Obtener usuarios por rol
 */
const obtenerUsuariosPorRol = async (rolNombre) => {
    try {
        const usuarios = await mozosModel.find({ 
            rol: rolNombre.toLowerCase(), 
            activo: { $ne: false } 
        }).lean();

        return usuarios;
    } catch (error) {
        logger.error('Error al obtener usuarios por rol', { error: error.message, rolNombre });
        throw error;
    }
};

/**
 * Verificar si un usuario tiene un permiso específico
 */
const tienePermiso = async (usuarioId, permiso) => {
    try {
        const usuario = await mozosModel.findById(usuarioId).lean();
        if (!usuario) return false;
        
        // Admin tiene todos los permisos
        if (usuario.rol === 'admin') return true;
        
        // Obtener permisos del rol del sistema
        const permisosRol = PERMISOS_POR_ROL_SISTEMA[usuario.rol] || [];
        
        // Verificar si tiene el permiso
        return permisosRol.includes(permiso);
    } catch (error) {
        logger.error('Error al verificar permiso', { error: error.message, usuarioId, permiso });
        return false;
    }
};

/**
 * Verificar si un usuario tiene un rol específico
 */
const tieneRol = async (usuarioId, rolesPermitidos) => {
    try {
        const usuario = await mozosModel.findById(usuarioId).lean();
        if (!usuario) return false;
        
        const rolesArray = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
        return rolesArray.includes(usuario.rol);
    } catch (error) {
        logger.error('Error al verificar rol', { error: error.message, usuarioId, rolesPermitidos });
        return false;
    }
};

module.exports = {
    inicializarRolesSistema,
    obtenerTodosLosRoles,
    obtenerRolPorId,
    crearRol,
    actualizarRol,
    eliminarRol,
    obtenerPermisosFundamentales,
    obtenerPermisosAgrupados,
    obtenerMozoConRol,
    asignarRolAUsuario,
    obtenerUsuariosPorRol,
    tienePermiso,
    tieneRol,
    ROLES_SISTEMA,
    PERMISOS_FUNDAMENTALES,
    PERMISOS_POR_ROL_SISTEMA,
    PERMISOS_POR_ROL: PERMISOS_POR_ROL_SISTEMA
};
