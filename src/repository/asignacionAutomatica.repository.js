/**
 * ASIGNACION AUTOMATICA DE PLATOS - REPOSITORY (v2: Perfiles + Calendario)
 * ---------------------------------------------------------------------------
 * Lee/actualiza el singleton AsignacionAutomatica (patrón de configuracion.repository),
 * más CRUD sobre subdocumentos `perfiles[]` y `calendario.bloques[]`.
 *
 * Operaciones atómicas con findOneAndUpdate + $set sobre paths anidados para evitar
 * races cuando el admin edita dos perfiles/bloques casi al mismo tiempo.
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
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

// ============================ Perfiles ============================

/**
 * Crea un nuevo perfil. Valida unicidad case-insensitive de nombre.
 * Devuelve el documento completo actualizado.
 */
const crearPerfil = async ({ nombre, descripcion = '', color = '#D4AF37', activo = true }, modificadoPor) => {
    nombre = String(nombre || '').trim();
    if (!nombre) throw new Error('El nombre del perfil es obligatorio');

    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const existsLower = (config.perfiles || []).some(p => (p.nombre || '').toLowerCase() === nombre.toLowerCase());
    if (existsLower) throw new Error(`Ya existe un perfil con nombre "${nombre}"`);

    const nuevoPerfil = {
        id: uuidv4(),
        nombre,
        descripcion: String(descripcion).slice(0, 500),
        color: String(color).slice(0, 20),
        activo: !!activo,
        reglasPorPlato: [],
        reglasPorCategoria: [],
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

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        {
            $push: push,
            $set: { actualizadoPor: modificadoPor }
        },
        { new: true }
    );
    return { config: actualizado.toObject(), perfilId: nuevoPerfil.id };
};

/**
 * Actualiza un perfil (nombre, descripcion, color, activo) y/o sus reglas.
 * `cambios` puede incluir reglasPorPlato / reglasPorCategoria (sanitizadas previamente).
 */
const actualizarPerfil = async (perfilId, cambios, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    // Validar unicidad de nombre si cambia
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
    if (Array.isArray(cambios.reglasPorPlato)) setObj['perfiles.$[p].reglasPorPlato'] = cambios.reglasPorPlato;
    if (Array.isArray(cambios.reglasPorCategoria)) setObj['perfiles.$[p].reglasPorCategoria'] = cambios.reglasPorCategoria;
    setObj['perfiles.$[p].updatedAt'] = new Date();

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        { $set: setObj },
        { new: true, arrayFilters: [{ 'p.id': perfilId }] }
    );
    return actualizado.toObject();
};

/**
 * Elimina un perfil. Bloquea si algún bloque del calendario lo referencia.
 */
const eliminarPerfil = async (perfilId, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    const referencias = (config.calendario?.bloques || []).filter(b => b.perfilId === perfilId);
    if (referencias.length > 0) {
        const err = new Error(`No se puede eliminar: ${referencias.length} bloque(s) del calendario referencia(n) este perfil. Reasigna o elimina esos bloques primero.`);
        err.code = 'PERFIL_EN_USO';
        err.referencias = referencias.map(r => ({ id: r.id, dias: r.diasSemana, horaInicio: r.horaInicio, horaFin: r.horaFin }));
        throw err;
    }

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        {
            $pull: { perfiles: { id: perfilId } },
            $set: { actualizadoPor: modificadoPor }
        },
        { new: true }
    );
    return actualizado.toObject();
};

/**
 * Duplica un perfil (nuevo id, nombre sugerido).
 */
const duplicarPerfil = async (perfilId, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('Perfil no encontrado');

    // Buscar nombre libre del estilo "Nombre copia", "Nombre copia 2"...
    let baseNombre = `${perfil.nombre} copia`;
    let candidato = baseNombre;
    let n = 2;
    const existe = (nom) => (config.perfiles || []).some(p => (p.nombre || '').toLowerCase() === nom.toLowerCase());
    while (existe(candidato)) { candidato = `${baseNombre} ${n++}`; }

    const nuevoId = uuidv4();
    const copia = {
        id: nuevoId,
        nombre: candidato,
        descripcion: perfil.descripcion || '',
        color: perfil.color || '#D4AF37',
        activo: true,
        reglasPorPlato: (perfil.reglasPorPlato || []).map(r => ({ ...r, backups: (r.backups || []).map(b => ({ ...b })) })),
        reglasPorCategoria: (perfil.reglasPorCategoria || []).map(r => ({ ...r, backups: (r.backups || []).map(b => ({ ...b })) })),
        createdAt: new Date(),
        updatedAt: new Date()
    };

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        {
            $push: { perfiles: copia },
            $set: { actualizadoPor: modificadoPor }
        },
        { new: true }
    );
    return { config: actualizado.toObject(), perfilId: nuevoId };
};

// ============================ Calendario: bloques ============================

const crearBloque = async ({ perfilId, diasSemana, horaInicio, horaFin, etiqueta = '', activo = true }, modificadoPor) => {
    if (!perfilId) throw new Error('perfilId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const perfil = (config.perfiles || []).find(p => p.id === perfilId);
    if (!perfil) throw new Error('El perfil indicado no existe');

    // Validaciones básicas de horario (sin cruce de medianoche en v1).
    if (!/^\d{2}:\d{2}$/.test(horaInicio) || !/^\d{2}:\d{2}$/.test(horaFin)) {
        throw new Error('horaInicio y horaFin deben tener formato HH:mm');
    }
    if (horaFin <= horaInicio) throw new Error('horaFin debe ser mayor que horaInicio (sin cruce de medianoche en v1)');

    // Alpine a veces envía días como strings ("4"); normalizar a enteros 0..6.
    const diasNorm = Array.isArray(diasSemana)
        ? [...new Set(diasSemana.map(d => Number(d)).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
        : [];
    if (diasNorm.length === 0) {
        throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
    }

    const nuevoBloque = {
        id: uuidv4(),
        perfilId,
        diasSemana: diasNorm,
        horaInicio,
        horaFin,
        etiqueta: String(etiqueta).slice(0, 100),
        activo: !!activo,
        createdAt: new Date()
    };

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        {
            $push: { 'calendario.bloques': nuevoBloque },
            $set: { actualizadoPor: modificadoPor }
        },
        { new: true }
    );
    return { config: actualizado.toObject(), bloqueId: nuevoBloque.id };
};

const actualizarBloque = async (bloqueId, cambios, modificadoPor) => {
    if (!bloqueId) throw new Error('bloqueId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const bloque = (config.calendario?.bloques || []).find(b => b.id === bloqueId);
    if (!bloque) throw new Error('Bloque no encontrado');

    if (cambios.perfilId != null) {
        const perfil = (config.perfiles || []).find(p => p.id === cambios.perfilId);
        if (!perfil) throw new Error('El perfil indicado no existe');
    }
    if (cambios.horaInicio != null && cambios.horaFin != null && cambios.horaFin <= cambios.horaInicio) {
        throw new Error('horaFin debe ser mayor que horaInicio (sin cruce de medianoche en v1)');
    }

    const setObj = { actualizadoPor: modificadoPor };
    if (cambios.perfilId != null) setObj['calendario.bloques.$[b].perfilId'] = cambios.perfilId;
    if (Array.isArray(cambios.diasSemana)) {
        const diasNorm = [...new Set(cambios.diasSemana.map(d => Number(d)).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
        if (diasNorm.length === 0) throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
        setObj['calendario.bloques.$[b].diasSemana'] = diasNorm;
    } else if (cambios.diasSemana != null) {
        throw new Error('diasSemana debe ser un array no vacío de enteros 0..6');
    }
    if (cambios.horaInicio != null) setObj['calendario.bloques.$[b].horaInicio'] = cambios.horaInicio;
    if (cambios.horaFin != null) setObj['calendario.bloques.$[b].horaFin'] = cambios.horaFin;
    if (cambios.etiqueta != null) setObj['calendario.bloques.$[b].etiqueta'] = String(cambios.etiqueta).slice(0, 100);
    if (typeof cambios.activo === 'boolean') setObj['calendario.bloques.$[b].activo'] = cambios.activo;

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        { $set: setObj },
        { new: true, arrayFilters: [{ 'b.id': bloqueId }] }
    );
    return actualizado.toObject();
};

const eliminarBloque = async (bloqueId, modificadoPor) => {
    if (!bloqueId) throw new Error('bloqueId es requerido');
    const config = await AsignacionAutomatica.obtenerConfiguracion();
    const bloque = (config.calendario?.bloques || []).find(b => b.id === bloqueId);
    if (!bloque) throw new Error('Bloque no encontrado');

    const actualizado = await AsignacionAutomatica.findOneAndUpdate(
        { _id: AsignacionAutomatica.CONFIG_ID },
        {
            $pull: { 'calendario.bloques': { id: bloqueId } },
            $set: { actualizadoPor: modificadoPor }
        },
        { new: true }
    );
    return actualizado.toObject();
};

module.exports = {
    obtenerConfiguracion,
    actualizarConfiguracion,
    toggleHabilitada,
    // Perfiles
    crearPerfil,
    actualizarPerfil,
    eliminarPerfil,
    duplicarPerfil,
    // Calendario
    crearBloque,
    actualizarBloque,
    eliminarBloque
};
