/**
 * ASIGNACION AUTOMATICA DE PLATOS - REPOSITORY
 * Lee/actualiza el singleton AsignacionAutomatica (patrón de configuracion.repository).
 */

const AsignacionAutomatica = require('../database/models/asignacionAutomatica.model');
const logger = require('../utils/logger');

const obtenerConfiguracion = async () => {
    try {
        const config = await AsignacionAutomatica.obtenerConfiguracion();
        return config.toObject();
    } catch (error) {
        logger.error('Error al obtener config de asignación automática', { error: error.message });
        throw error;
    }
};

const actualizarConfiguracion = async (nuevosDatos, modificadoPor) => {
    try {
        const datosFiltrados = { ...nuevosDatos };
        // Proteger campos inmutables
        delete datosFiltrados._id;
        delete datosFiltrados.createdAt;
        delete datosFiltrados.updatedAt;
        delete datosFiltrados.__v;
        datosFiltrados.actualizadoPor = modificadoPor;

        const config = await AsignacionAutomatica.findOneAndUpdate(
            { _id: AsignacionAutomatica.CONFIG_ID },
            { $set: datosFiltrados },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return config.toObject();
    } catch (error) {
        logger.error('Error al actualizar config de asignación automática', { error: error.message });
        throw error;
    }
};

const toggleHabilitada = async (valor, modificadoPor) => {
    try {
        const config = await AsignacionAutomatica.findOneAndUpdate(
            { _id: AsignacionAutomatica.CONFIG_ID },
            { $set: { habilitada: !!valor, actualizadoPor: modificadoPor } },
            { new: true, upsert: true }
        );
        return config.toObject();
    } catch (error) {
        logger.error('Error al toggle asignación automática', { error: error.message });
        throw error;
    }
};

module.exports = {
    obtenerConfiguracion,
    actualizarConfiguracion,
    toggleHabilitada
};