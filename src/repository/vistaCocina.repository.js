/**
 * VISTA COCINA REPOSITORY
 * Acceso a datos para gestion de Vistas de Cocina y Pantallas de Cocina
 */

const VistaCocina = require('../database/models/vistaCocina.model');
const PantallaCocina = require('../database/models/pantallaCocina.model');
const logger = require('../utils/logger');

/* ====================== VISTAS DE COCINA ====================== */

async function obtenerVistasCocina(filtros = {}) {
    try {
        const query = {};
        if (filtros.activo !== undefined) {
            query.activo = filtros.activo;
        }
        return await VistaCocina.find(query).sort({ nombre: 1 }).lean();
    } catch (error) {
        logger.error('Error al obtener vistas de cocina', { error: error.message });
        throw error;
    }
}

async function obtenerVistasCocinaActivas() {
    try {
        return await VistaCocina.find({ activo: true })
            .select('nombre descripcion color icono filtrosPlatos configVisual ordenamiento configCronometro')
            .sort({ nombre: 1 })
            .lean();
    } catch (error) {
        logger.error('Error al obtener vistas activas', { error: error.message });
        throw error;
    }
}

async function obtenerVistaCocinaPorId(id) {
    try {
        return await VistaCocina.findById(id).lean();
    } catch (error) {
        logger.error('Error al obtener vista de cocina por ID', { error: error.message });
        throw error;
    }
}

async function crearVistaCocina(datos, creadoPor = null) {
    try {
        const existente = await VistaCocina.findOne({ nombre: datos.nombre });
        if (existente) {
            throw new Error('Ya existe una vista de cocina con ese nombre');
        }
        const vista = await VistaCocina.create({ ...datos, creadoPor });
        logger.info('Vista de Cocina creada', { vistaId: vista._id, nombre: vista.nombre, creadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al crear vista de cocina', { error: error.message });
        throw error;
    }
}

async function actualizarVistaCocina(id, datos, actualizadoPor = null) {
    try {
        const existente = await VistaCocina.findById(id);
        if (!existente) {
            throw new Error('Vista de cocina no encontrada');
        }
        if (datos.nombre && datos.nombre !== existente.nombre) {
            const dup = await VistaCocina.findOne({ nombre: datos.nombre, _id: { $ne: id } });
            if (dup) {
                throw new Error('Ya existe otra vista de cocina con ese nombre');
            }
        }
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { ...datos, actualizadoPor, updatedAt: new Date() } },
            { new: true }
        );
        logger.info('Vista de Cocina actualizada', { vistaId: id, actualizadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al actualizar vista de cocina', { error: error.message });
        throw error;
    }
}

async function eliminarVistaCocina(id, eliminadoPor = null) {
    try {
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { activo: false, actualizadoPor: eliminadoPor, updatedAt: new Date() } },
            { new: true }
        );
        if (!vista) {
            throw new Error('Vista de cocina no encontrada');
        }
        logger.info('Vista de Cocina desactivada', { vistaId: id, eliminadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al eliminar vista de cocina', { error: error.message });
        throw error;
    }
}

async function reactivarVistaCocina(id, actualizadoPor = null) {
    try {
        const vista = await VistaCocina.findByIdAndUpdate(
            id,
            { $set: { activo: true, actualizadoPor, updatedAt: new Date() } },
            { new: true }
        );
        if (!vista) {
            throw new Error('Vista de cocina no encontrada');
        }
        logger.info('Vista de Cocina reactivada', { vistaId: id, actualizadoPor });
        return vista;
    } catch (error) {
        logger.error('Error al reactivar vista de cocina', { error: error.message });
        throw error;
    }
}

/* ====================== PANTALLAS DE COCINA ====================== */

async function obtenerPantallasCocina() {
    try {
        return await PantallaCocina.find().sort({ numeroPantalla: 1 }).populate('vistaCocinaId', 'nombre color icono').lean();
    } catch (error) {
        logger.error('Error al obtener pantallas de cocina', { error: error.message });
        throw error;
    }
}

async function obtenerPantallasActivas() {
    try {
        return await PantallaCocina.find({ activo: true })
            .sort({ numeroPantalla: 1 })
            .populate('vistaCocinaId', 'nombre descripcion color icono filtrosPlatos configVisual ordenamiento configCronometro')
            .lean();
    } catch (error) {
        logger.error('Error al obtener pantallas activas', { error: error.message });
        throw error;
    }
}

async function crearPantallaCocina(datos, creadoPor = null) {
    try {
        const existente = await PantallaCocina.findOne({ numeroPantalla: datos.numeroPantalla });
        if (existente) {
            throw new Error(`Ya existe la pantalla ${datos.numeroPantalla}`);
        }
        const pantalla = await PantallaCocina.create(datos);
        logger.info('Pantalla de Cocina creada', { pantallaId: pantalla._id, numero: pantalla.numeroPantalla, creadoPor });
        return pantalla;
    } catch (error) {
        logger.error('Error al crear pantalla de cocina', { error: error.message });
        throw error;
    }
}

async function actualizarPantallaCocina(id, datos, actualizadoPor = null) {
    try {
        const pantalla = await PantallaCocina.findByIdAndUpdate(
            id,
            { $set: { ...datos, updatedAt: new Date() } },
            { new: true }
        );
        if (!pantalla) {
            throw new Error('Pantalla de cocina no encontrada');
        }
        logger.info('Pantalla de Cocina actualizada', { pantallaId: id, actualizadoPor });
        return pantalla;
    } catch (error) {
        logger.error('Error al actualizar pantalla de cocina', { error: error.message });
        throw error;
    }
}

async function eliminarPantallaCocina(id) {
    try {
        const pantalla = await PantallaCocina.findByIdAndDelete(id);
        if (!pantalla) {
            throw new Error('Pantalla de cocina no encontrada');
        }
        logger.info('Pantalla de Cocina eliminada', { pantallaId: id });
        return pantalla;
    } catch (error) {
        logger.error('Error al eliminar pantalla de cocina', { error: error.message });
        throw error;
    }
}

module.exports = {
    obtenerVistasCocina,
    obtenerVistasCocinaActivas,
    obtenerVistaCocinaPorId,
    crearVistaCocina,
    actualizarVistaCocina,
    eliminarVistaCocina,
    reactivarVistaCocina,
    obtenerPantallasCocina,
    obtenerPantallasActivas,
    crearPantallaCocina,
    actualizarPantallaCocina,
    eliminarPantallaCocina
};