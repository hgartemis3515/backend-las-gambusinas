/**
 * ASIGNACION AUTOMATICA DE GUARNICIONES - REPOSITORY (v1.1)
 * Clon de asignacionAutomatica.repository.js con reglasPorGuarnicion/reglasPorGrupo.
 * Lee/actualiza el singleton AsignacionAutomaticaGuarniciones + CRUD perfiles/bloques.
 */
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const AsignacionAutomaticaGuarniciones = require('../database/models/asignacionAutomaticaGuarniciones.model');
const logger = require('../utils/logger');

const obtenerConfiguracion = async () => {
    try {
        const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
        return config.toObject();
    } catch (error) {
        logger.error('Error al obtener config de asignación de guarniciones', { error: error.message });
        throw error;
    }
};

const actualizarConfiguracion = async (nuevosDatos, modificadoPor) => {
    try {
        const datosFiltrados = { ...nuevosDatos };
        delete datosFiltrados._id;
        delete datosFiltrados.createdAt;
        delete datosFiltrados.updatedAt;
        delete datosFiltrados.__v;
        datosFiltrados.actualizadoPor = modificadoPor;

        const config = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
            { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
            { $set: datosFiltrados },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return config.toObject();
    } catch (error) {
        logger.error('Error al actualizar config de asignación de guarniciones', { error: error.message });
        throw error;
    }
};

const toggleHabilitada = async (valor, modificadoPor) => {
    try {
        const config = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
            { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
            { $set: { habilitada: !!valor, actualizadoPor: modificadoPor } },
            { new: true, upsert: true }
        );
        return config.toObject();
    } catch (error) {
        logger.error('Error al toggle asignación de guarniciones', { error: error.message });
        throw error;
    }
};

// ============================ Perfiles ============================

const crearPerfil = async ({ nombre, descripcion = '', color = '#7CB342', activo = true }, modificadoPor) => {
    nombre = String(nombre || '').trim();
    if (!nombre) throw new Error('El nombre del perfil es obligatorio');

    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    const existsLower = (config.perfiles || []).some(p => (p.nombre || '').toLowerCase() === nombre.toLowerCase());
    if (existsLower) throw new Error(`Ya existe un perfil con nombre "${nombre}"`);

    const nuevoPerfil = {
        id: uuidv4(),
        nombre,
        descripcion: String(descripcion).slice(0, 500),
        color: String(color).slice(0, 20),
        activo: !!activo,
        reglasPorGuarnicion: [],
        reglasPorGrupo: [],
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const push = { perfiles: nuevoPerfil };
    if (!(config.calendario?.bloques || []).length) {
        push['calendario.bloques'] = {
            id: uuidv4(),
            perfilId: nuevoPerfil.id,
            diasSemana: [0, 1, 2, 3, 4, 5, 6],
            horaInicio: '00:00',
            horaFin: '23:59',
            etiqueta: 'Default 24h',
            activo: true,
            createdAt: new Date()
        };
    }

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $push: push, $set: { actualizadoPor: modificadoPor } },
        { new: true }
    );
    return { config: actualizado.toObject(), perfilId: nuevoPerfil.id };
};

const actualizarPerfil = async (perfilId, cambios, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    if (cambios.nombre != null) {
        const nuevoNombre = String(cambios.nombre).trim();
        if (!nuevoNombre) throw new Error('El nombre no puede quedar vacío');
        const dup = (config.perfiles || []).some(p => p.id !== perfilId && (p.nombre || '').toLowerCase() === nuevoNombre.toLowerCase());
        if (dup) throw new Error(`Ya existe un perfil con nombre "${nuevoNombre}"`);
    }

    const setObj = { actualizadoPor: modificadoPor };
    if (cambios.nombre != null) setObj['perfiles.$[p].nombre'] = String(cambios.nombre).trim();
    if (cambios.descripcion != null) setObj['perfiles.$[p].descripcion'] = String(cambios.descripcion).slice(0, 500);
    if (cambios.color != null) setObj['perfiles.$[p].color'] = String(cambios.color).slice(0, 20);
    if (typeof cambios.activo === 'boolean') setObj['perfiles.$[p].activo'] = cambios.activo;
    if (Array.isArray(cambios.reglasPorGuarnicion)) setObj['perfiles.$[p].reglasPorGuarnicion'] = cambios.reglasPorGuarnicion;
    if (Array.isArray(cambios.reglasPorGrupo)) setObj['perfiles.$[p].reglasPorGrupo'] = cambios.reglasPorGrupo;
    setObj['perfiles.$[p].updatedAt'] = new Date();

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $set: setObj },
        { new: true, arrayFilters: [{ 'p.id': perfilId }] }
    );
    return actualizado.toObject();
};

const eliminarPerfil = async (perfilId, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    const referencias = (config.calendario?.bloques || []).filter(b => b.perfilId === perfilId);
    if (referencias.length > 0) {
        const err = new Error(`No se puede eliminar: ${referencias.length} bloque(s) del calendario referencia(n) este perfil.`);
        err.code = 'PERFIL_EN_USO';
        err.referencias = referencias.map(r => ({ id: r.id, dias: r.diasSemana, horaInicio: r.horaInicio, horaFin: r.horaFin }));
        throw err;
    }

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $pull: { perfiles: { id: perfilId } }, $set: { actualizadoPor: modificadoPor } },
        { new: true }
    );
    return actualizado.toObject();
};

const duplicarPerfil = async (perfilId, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    let baseName = `${perfil.nombre} (copia)`;
    let i = 1;
    while ((config.perfiles || []).some(p => (p.nombre || '').toLowerCase() === baseName.toLowerCase())) {
        baseName = `${perfil.nombre} (copia ${i++})`;
    }

    const copia = {
        id: uuidv4(),
        nombre: baseName,
        descripcion: perfil.descripcion || '',
        color: perfil.color || '#7CB342',
        activo: false, // copia nace inactiva
        reglasPorGuarnicion: (perfil.reglasPorGuarnicion || []).map(r => ({ ...r })),
        reglasPorGrupo: (perfil.reglasPorGrupo || []).map(r => ({ ...r })),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $push: { perfiles: copia }, $set: { actualizadoPor: modificadoPor } },
        { new: true }
    );
    return { config: actualizado.toObject(), perfilId: copia.id };
};

// ============================ Calendario ============================

const crearBloque = async (bloque, modificadoPor) => {
    const config = await AsignacionAutomaticaGuarniciones.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === bloque.perfilId);
    if (!perfil) throw new Error('El perfilId no existe');

    const diasNorm = Array.isArray(bloque.diasSemana)
        ? [...new Set(bloque.diasSemana.map(d => Number(d)).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : [];
    if (diasNorm.length === 0) throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');

    const nuevoBloque = {
        id: uuidv4(),
        perfilId: bloque.perfilId,
        diasSemana: diasNorm,
        horaInicio: bloque.horaInicio,
        horaFin: bloque.horaFin,
        etiqueta: bloque.etiqueta || '',
        activo: bloque.activo !== false,
        createdAt: new Date()
    };

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $push: { 'calendario.bloques': nuevoBloque }, $set: { actualizadoPor: modificadoPor } },
        { new: true }
    );
    return actualizado.toObject();
};

const actualizarBloque = async (bloqueId, cambios, modificadoPor) => {
    if (!bloqueId) throw new Error('bloqueId es requerido');
    const setObj = { actualizadoPor: modificadoPor };
    if (cambios.perfilId != null) setObj['calendario.bloques.$[b].perfilId'] = cambios.perfilId;
    if (Array.isArray(cambios.diasSemana)) setObj['calendario.bloques.$[b].diasSemana'] = cambios.diasSemana;
    if (cambios.horaInicio != null) setObj['calendario.bloques.$[b].horaInicio'] = cambios.horaInicio;
    if (cambios.horaFin != null) setObj['calendario.bloques.$[b].horaFin'] = cambios.horaFin;
    if (cambios.etiqueta != null) setObj['calendario.bloques.$[b].etiqueta'] = String(cambios.etiqueta).slice(0, 100);
    if (typeof cambios.activo === 'boolean') setObj['calendario.bloques.$[b].activo'] = cambios.activo;

    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $set: setObj },
        { new: true, arrayFilters: [{ 'b.id': bloqueId }] }
    );
    return actualizado.toObject();
};

const eliminarBloque = async (bloqueId, modificadoPor) => {
    if (!bloqueId) throw new Error('bloqueId es requerido');
    const actualizado = await AsignacionAutomaticaGuarniciones.findOneAndUpdate(
        { _id: AsignacionAutomaticaGuarniciones.CONFIG_ID },
        { $pull: { 'calendario.bloques': { id: bloqueId } }, $set: { actualizadoPor: modificadoPor } },
        { new: true }
    );
    return actualizado.toObject();
};

module.exports = {
    obtenerConfiguracion,
    actualizarConfiguracion,
    toggleHabilitada,
    crearPerfil,
    actualizarPerfil,
    eliminarPerfil,
    duplicarPerfil,
    crearBloque,
    actualizarBloque,
    eliminarBloque
};
