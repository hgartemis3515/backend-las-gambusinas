/**
 * ZONA REPOSITORY
 * Acceso a datos para gestión de zonas de cocina
 */

const Zona = require('../database/models/zona.model');
const Mozos = require('../database/models/mozos.model');
const logger = require('../utils/logger');

/**
 * Obtener todas las zonas
 */
async function obtenerZonas(filtros = {}) {
    try {
        const query = {};
        
        if (filtros.activo !== undefined) {
            query.activo = filtros.activo;
        }
        
        const zonas = await Zona.find(query)
            .sort({ nombre: 1 })
            .lean();
        
        return zonas;
    } catch (error) {
        logger.error('Error al obtener zonas', { error: error.message });
        throw error;
    }
}

/**
 * Obtener una zona por ID
 */
async function obtenerZonaPorId(zonaId) {
    try {
        const zona = await Zona.findById(zonaId).lean();
        return zona;
    } catch (error) {
        logger.error('Error al obtener zona por ID', { error: error.message });
        throw error;
    }
}

/**
 * Crear una nueva zona
 */
async function crearZona(datosZona, creadoPor = null) {
    try {
        // Verificar que no exista una zona con el mismo nombre
        const zonaExistente = await Zona.findOne({ nombre: datosZona.nombre });
        if (zonaExistente) {
            throw new Error('Ya existe una zona con ese nombre');
        }
        
        const zona = await Zona.create({
            ...datosZona,
            creadoPor
        });
        
        logger.info('Zona creada', { zonaId: zona._id, nombre: zona.nombre, creadoPor });
        
        return zona;
    } catch (error) {
        logger.error('Error al crear zona', { error: error.message });
        throw error;
    }
}

/**
 * Actualizar una zona
 */
async function actualizarZona(zonaId, datosZona, actualizadoPor = null) {
    try {
        // Verificar que la zona existe
        const zonaExistente = await Zona.findById(zonaId);
        if (!zonaExistente) {
            throw new Error('Zona no encontrada');
        }
        
        // Si se cambia el nombre, verificar que no exista otra con el mismo nombre
        if (datosZona.nombre && datosZona.nombre !== zonaExistente.nombre) {
            const zonaConMismoNombre = await Zona.findOne({ 
                nombre: datosZona.nombre,
                _id: { $ne: zonaId }
            });
            if (zonaConMismoNombre) {
                throw new Error('Ya existe otra zona con ese nombre');
            }
        }
        
        const zona = await Zona.findByIdAndUpdate(
            zonaId,
            {
                $set: {
                    ...datosZona,
                    actualizadoPor,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        logger.info('Zona actualizada', { zonaId, actualizadoPor });
        
        return zona;
    } catch (error) {
        logger.error('Error al actualizar zona', { error: error.message });
        throw error;
    }
}

/**
 * Eliminar una zona (soft delete)
 */
async function eliminarZona(zonaId, eliminadoPor = null) {
    try {
        const zona = await Zona.findByIdAndUpdate(
            zonaId,
            {
                $set: {
                    activo: false,
                    actualizadoPor: eliminadoPor,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        if (!zona) {
            throw new Error('Zona no encontrada');
        }
        
        logger.info('Zona desactivada', { zonaId, eliminadoPor });
        
        return zona;
    } catch (error) {
        logger.error('Error al eliminar zona', { error: error.message });
        throw error;
    }
}

/**
 * Reactivar una zona
 */
async function reactivarZona(zonaId, actualizadoPor = null) {
    try {
        const zona = await Zona.findByIdAndUpdate(
            zonaId,
            {
                $set: {
                    activo: true,
                    actualizadoPor,
                    updatedAt: new Date()
                }
            },
            { new: true }
        );
        
        if (!zona) {
            throw new Error('Zona no encontrada');
        }
        
        logger.info('Zona reactivada', { zonaId, actualizadoPor });
        
        return zona;
    } catch (error) {
        logger.error('Error al reactivar zona', { error: error.message });
        throw error;
    }
}

/**
 * Obtener zonas activas para asignación
 */
async function obtenerZonasActivas() {
    try {
        const zonas = await Zona.find({ activo: true })
            .select('nombre descripcion color icono filtrosPlatos filtrosComandas')
            .sort({ nombre: 1 })
            .lean();
        
        return zonas;
    } catch (error) {
        logger.error('Error al obtener zonas activas', { error: error.message });
        throw error;
    }
}

/**
 * Obtener cocineros asignados a una zona
 */
async function obtenerCocinerosPorZona(zonaId) {
    try {
        // Buscar usuarios que tengan esta zona en su lista de zonaIds
        const cocineros = await Mozos.find({
            rol: 'cocinero',
            zonaIds: zonaId
        })
            .select('_id name DNI')
            .lean();
        
        return cocineros;
    } catch (error) {
        logger.error('Error al obtener cocineros por zona', { error: error.message });
        throw error;
    }
}

module.exports = {
    obtenerZonas,
    obtenerZonaPorId,
    crearZona,
    actualizarZona,
    eliminarZona,
    reactivarZona,
    obtenerZonasActivas,
    obtenerCocinerosPorZona
};
