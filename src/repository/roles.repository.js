/**
 * ROLES REPOSITORY
 * Operaciones CRUD para gestión de roles y permisos
 */

const mozos = require('../database/models/mozos.model');
const { ROLES, PERMISOS_FUNDAMENTALES, PERMISOS_POR_ROL } = require('../database/models/mozos.model');
const { syncJsonFile } = require('../utils/jsonSync');
const logger = require('../utils/logger');
const redisCache = require('../utils/redisCache');

const CACHE_TTL = 300; // 5 minutos

/**
 * Obtener todos los mozos con sus roles y permisos
 */
const listarMozosConRoles = async () => {
    try {
        const data = await mozos.find({}).select('-__v').lean();
        return data.map(m => ({
            ...m,
            permisosEfectivos: calcularPermisosEfectivos(m)
        }));
    } catch (error) {
        logger.error('Error al listar mozos con roles', { error: error.message });
        throw error;
    }
};

/**
 * Obtener un mozo con su rol y permisos por ID
 */
const obtenerMozoConRol = async (mozoId) => {
    try {
        // Intentar obtener de cache primero
        const cacheKey = `mozo:rol:${mozoId}`;
        const cached = await redisCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        let mozo = await mozos.findById(mozoId).select('-__v').lean();
        if (!mozo) {
            mozo = await mozos.findOne({ mozoId: parseInt(mozoId) }).select('-__v').lean();
        }

        if (!mozo) {
            return null;
        }

        const result = {
            ...mozo,
            permisosEfectivos: calcularPermisosEfectivos(mozo)
        };

        // Guardar en cache
        await redisCache.set(cacheKey, result, CACHE_TTL);

        return result;
    } catch (error) {
        logger.error('Error al obtener mozo con rol', { error: error.message, mozoId });
        throw error;
    }
};

/**
 * Asignar rol a un mozo
 */
const asignarRol = async (mozoId, rol, permisosPersonalizados = null) => {
    try {
        if (!ROLES.includes(rol)) {
            throw new Error(`Rol inválido. Roles válidos: ${ROLES.join(', ')}`);
        }

        let mozo = await mozos.findById(mozoId);
        if (!mozo) {
            mozo = await mozos.findOne({ mozoId: parseInt(mozoId) });
        }

        if (!mozo) {
            throw new Error('Mozo no encontrado');
        }

        mozo.rol = rol;

        // Si se proporcionan permisos personalizados, validar y asignar
        if (permisosPersonalizados && Array.isArray(permisosPersonalizados)) {
            const permisosValidados = permisosPersonalizados.filter(p => 
                PERMISOS_FUNDAMENTALES[p.permiso] !== undefined
            ).map(p => ({
                permiso: p.permiso,
                permitido: p.permitido !== false
            }));
            mozo.permisos = permisosValidados;
        } else {
            // Si no hay permisos personalizados, limpiar para usar los del rol
            mozo.permisos = [];
        }

        await mozo.save();

        // Invalidar cache
        await invalidarCacheMozo(mozoId);

        // Sincronizar con JSON
        const todosLosMozos = await mozos.find({}).lean();
        await syncJsonFile('mozos.json', todosLosMozos);

        logger.info('Rol asignado correctamente', { 
            mozoId: mozo._id, 
            mozoIdNum: mozo.mozoId,
            nombre: mozo.name, 
            rol 
        });

        return {
            ...mozo.toObject(),
            permisosEfectivos: calcularPermisosEfectivos(mozo.toObject())
        };
    } catch (error) {
        logger.error('Error al asignar rol', { error: error.message, mozoId, rol });
        throw error;
    }
};

/**
 * Actualizar permisos personalizados de un mozo
 */
const actualizarPermisos = async (mozoId, permisos) => {
    try {
        let mozo = await mozos.findById(mozoId);
        if (!mozo) {
            mozo = await mozos.findOne({ mozoId: parseInt(mozoId) });
        }

        if (!mozo) {
            throw new Error('Mozo no encontrado');
        }

        // Validar y filtrar permisos
        const permisosValidados = permisos.filter(p => 
            PERMISOS_FUNDAMENTALES[p.permiso] !== undefined
        ).map(p => ({
            permiso: p.permiso,
            permitido: p.permitido !== false
        }));

        mozo.permisos = permisosValidados;
        await mozo.save();

        // Invalidar cache
        await invalidarCacheMozo(mozoId);

        // Sincronizar con JSON
        const todosLosMozos = await mozos.find({}).lean();
        await syncJsonFile('mozos.json', todosLosMozos);

        logger.info('Permisos actualizados', { 
            mozoId: mozo._id, 
            nombre: mozo.name,
            permisosCount: permisosValidados.length 
        });

        return {
            ...mozo.toObject(),
            permisosEfectivos: calcularPermisosEfectivos(mozo.toObject())
        };
    } catch (error) {
        logger.error('Error al actualizar permisos', { error: error.message, mozoId });
        throw error;
    }
};

/**
 * Verificar si un mozo tiene un permiso específico
 */
const tienePermiso = async (mozoId, permiso) => {
    try {
        const mozo = await obtenerMozoConRol(mozoId);
        if (!mozo) return false;

        return mozo.permisosEfectivos.includes(permiso);
    } catch (error) {
        logger.error('Error al verificar permiso', { error: error.message, mozoId, permiso });
        return false;
    }
};

/**
 * Verificar si un mozo tiene un rol específico o superior
 */
const tieneRol = async (mozoId, rolesPermitidos) => {
    try {
        const mozo = await obtenerMozoConRol(mozoId);
        if (!mozo) return false;

        const rolesArray = Array.isArray(rolesPermitidos) ? rolesPermitidos : [rolesPermitidos];
        return rolesArray.includes(mozo.rol);
    } catch (error) {
        logger.error('Error al verificar rol', { error: error.message, mozoId, rolesPermitidos });
        return false;
    }
};

/**
 * Obtener lista de roles disponibles
 */
const obtenerRolesDisponibles = () => {
    return ROLES.map(rol => ({
        id: rol,
        nombre: rol.charAt(0).toUpperCase() + rol.slice(1),
        permisosPorDefecto: PERMISOS_POR_ROL[rol] || []
    }));
};

/**
 * Obtener lista de permisos fundamentales
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
 * Calcular permisos efectivos basados en rol y permisos personalizados
 */
const calcularPermisosEfectivos = (mozo) => {
    const permisosRol = PERMISOS_POR_ROL[mozo.rol] || [];
    const permisosPersonalizados = mozo.permisos || [];

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
};

/**
 * Invalidar cache de un mozo específico
 */
const invalidarCacheMozo = async (mozoId) => {
    try {
        const cacheKey = `mozo:rol:${mozoId}`;
        await redisCache.del(cacheKey);
        
        // También invalidar por mozoId numérico si es diferente
        if (!isNaN(mozoId)) {
            await redisCache.del(`mozo:rol:${parseInt(mozoId)}`);
        }
    } catch (error) {
        logger.warn('Error al invalidar cache', { error: error.message, mozoId });
    }
};

/**
 * Migrar usuarios existentes sin rol al rol por defecto 'mozos'
 */
const migrarRolesDefault = async () => {
    try {
        const resultado = await mozos.updateMany(
            { rol: { $exists: false } },
            { $set: { rol: 'mozos', activo: true } }
        );

        if (resultado.modifiedCount > 0) {
            logger.info('Migración de roles completada', { 
                usuariosMigrados: resultado.modifiedCount 
            });
        }

        return resultado;
    } catch (error) {
        logger.error('Error en migración de roles', { error: error.message });
        throw error;
    }
};

/**
 * Obtener usuarios por rol
 */
const obtenerUsuariosPorRol = async (rol) => {
    try {
        if (!ROLES.includes(rol)) {
            throw new Error(`Rol inválido: ${rol}`);
        }

        const usuarios = await mozos.find({ rol, activo: true }).lean();
        return usuarios.map(u => ({
            ...u,
            permisosEfectivos: calcularPermisosEfectivos(u)
        }));
    } catch (error) {
        logger.error('Error al obtener usuarios por rol', { error: error.message, rol });
        throw error;
    }
};

module.exports = {
    listarMozosConRoles,
    obtenerMozoConRol,
    asignarRol,
    actualizarPermisos,
    tienePermiso,
    tieneRol,
    obtenerRolesDisponibles,
    obtenerPermisosFundamentales,
    calcularPermisosEfectivos,
    migrarRolesDefault,
    obtenerUsuariosPorRol,
    invalidarCacheMozo,
    ROLES,
    PERMISOS_FUNDAMENTALES,
    PERMISOS_POR_ROL
};
