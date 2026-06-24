const TipoPlato = require('../database/models/tipoPlato.model');
const platoModel = require('../database/models/plato.model');
const logger = require('../utils/logger');

/**
 * Normaliza un texto a slug: "Cena" -> "platos-cena"
 */
function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Listar tipos con uso (conteo de platos).
 * @param {Object} opts - { soloActivos: boolean, conUso: boolean }
 */
const listarTiposPlato = async (opts = {}) => {
    const filter = {};
    if (opts.soloActivos === true) filter.activo = true;

    const tipos = await TipoPlato.find(filter).sort({ orden: 1, nombre: 1 }).lean();

    if (opts.conUso !== false) {
        const aggs = await platoModel.aggregate([
            { $group: { _id: '$tipo', count: { $sum: 1 } } }
        ]);
        const usoMap = {};
        aggs.forEach(a => { usoMap[a._id] = a.count; });
        tipos.forEach(t => { t._usoEnPlatos = usoMap[t.slug] || 0; });
    }

    return tipos;
};

/**
 * Menú ligero para clientes (apps móviles): [{ slug, nombre, ... }]
 */
const getMenuLigero = async (soloActivos = true) => {
    return TipoPlato.getMenuLigero(soloActivos);
};

const obtenerTipoPlatoPorSlug = async (slug) => {
    return TipoPlato.findOne({ slug: String(slug).toLowerCase().trim() }).lean();
};

const obtenerTipoPlatoPorId = async (id) => {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
        const byId = await TipoPlato.findById(id).lean();
        if (byId) return byId;
    }
    const num = Number(id);
    if (!Number.isNaN(num)) {
        const byNum = await TipoPlato.findOne({ id: num }).lean();
        if (byNum) return byNum;
    }
    return null;
};

const crearTipoPlato = async (data) => {
    const nombreTrim = String(data.nombre || '').trim();
    if (!nombreTrim) {
        const err = new Error('El nombre es requerido');
        err.statusCode = 400;
        throw err;
    }

    let slug = data.slug ? slugify(data.slug) : slugify('platos-' + nombreTrim);
    if (!slug.startsWith('plato') && !slug.startsWith('desayuno')) {
        slug = 'platos-' + slug;
    }

    const existente = await TipoPlato.findOne({ slug });
    if (existente) {
        const err = new Error(`Ya existe un tipo con slug "${slug}"`);
        err.statusCode = 409;
        throw err;
    }

    const alias = Array.isArray(data.alias)
        ? data.alias.map(a => String(a).toLowerCase().trim()).filter(Boolean)
        : [];

    const nuevo = await TipoPlato.create({
        slug,
        nombre: nombreTrim,
        nombreCorto: String(data.nombreCorto || '').trim() || nombreTrim.toUpperCase(),
        icono: String(data.icono || '🍽️').trim(),
        color: String(data.color || '#d4af37').trim(),
        orden: Number(data.orden) || 99,
        activo: data.activo !== false,
        esSistema: false,
        alias,
        creadoPor: data.creadoPor || 'admin',
        actualizadoPor: data.actualizadoPor || 'admin'
    });

    invalidatePlatoMenuCache();
    return nuevo.toObject();
};

const actualizarTipoPlato = async (id, newData) => {
    const tipo = await _findDoc(id);
    if (!tipo) {
        const err = new Error('Tipo de plato no encontrado');
        err.statusCode = 404;
        throw err;
    }

    if (newData.nombre != null) {
        const nombreTrim = String(newData.nombre).trim();
        if (!nombreTrim) {
            const err = new Error('El nombre no puede estar vacío');
            err.statusCode = 400;
            throw err;
        }
        tipo.nombre = nombreTrim;
        if (!newData.nombreCorto) tipo.nombreCorto = nombreTrim.toUpperCase();
    }
    if (newData.nombreCorto != null) tipo.nombreCorto = String(newData.nombreCorto).trim();
    if (newData.icono != null) tipo.icono = String(newData.icono).trim();
    if (newData.color != null) tipo.color = String(newData.color).trim();
    if (newData.orden != null) tipo.orden = Number(newData.orden) || tipo.orden;
    if (newData.activo != null) tipo.activo = Boolean(newData.activo);
    if (newData.alias != null && Array.isArray(newData.alias)) {
        tipo.alias = newData.alias.map(a => String(a).toLowerCase().trim()).filter(Boolean);
    }
    tipo.actualizadoPor = newData.actualizadoPor || 'admin';

    await tipo.save();
    invalidatePlatoMenuCache();
    return tipo.toObject();
};

const desactivarTipoPlato = async (id) => {
    const tipo = await _findDoc(id);
    if (!tipo) {
        const err = new Error('Tipo de plato no encontrado');
        err.statusCode = 404;
        throw err;
    }
    tipo.activo = false;
    await tipo.save();
    invalidatePlatoMenuCache();
    return tipo.toObject();
};

const reactivarTipoPlato = async (id) => {
    const tipo = await _findDoc(id);
    if (!tipo) {
        const err = new Error('Tipo de plato no encontrado');
        err.statusCode = 404;
        throw err;
    }
    tipo.activo = true;
    await tipo.save();
    invalidatePlatoMenuCache();
    return tipo.toObject();
};

const eliminarTipoPlato = async (id) => {
    const tipo = await _findDoc(id);
    if (!tipo) {
        const err = new Error('Tipo de plato no encontrado');
        err.statusCode = 404;
        throw err;
    }
    if (tipo.esSistema) {
        const err = new Error('No se puede eliminar un tipo de sistema; solo desactívalo');
        err.statusCode = 400;
        throw err;
    }
    const uso = await platoModel.countDocuments({ tipo: tipo.slug });
    if (uso > 0) {
        const err = new Error(`No se puede eliminar: hay ${uso} plato(s) usando "${tipo.slug}". Reasigna primero.`);
        err.statusCode = 409;
        err.platosUsandolo = uso;
        throw err;
    }
    await TipoPlato.deleteOne({ _id: tipo._id });
    invalidatePlatoMenuCache();
    return { deleted: true, slug: tipo.slug };
};

const obtenerPlatosQueUsanTipo = async (slug) => {
    const s = String(slug).toLowerCase().trim();
    const docs = await platoModel.find({ tipo: s }).select('id nombre categoria tipo -_id').lean();
    return { slug: s, count: docs.length, platos: docs };
};

const reasignarTipoPlato = async (slugOrigen, slugDestino, platoIds = null) => {
    const origen = String(slugOrigen).toLowerCase().trim();
    const destino = String(slugDestino).toLowerCase().trim();
    if (!origen || !destino) {
        const err = new Error('slugOrigen y slugDestino son requeridos');
        err.statusCode = 400;
        throw err;
    }
    const destTipo = await TipoPlato.findOne({ slug: destino });
    if (!destTipo) {
        const err = new Error(`Tipo destino "${destino}" no existe`);
        err.statusCode = 404;
        throw err;
    }

    const filter = { tipo: origen };
    if (platoIds && Array.isArray(platoIds) && platoIds.length) {
        filter.id = { $in: platoIds.map(Number).filter(Number.isFinite) };
    }
    const result = await platoModel.updateMany(filter, { $set: { tipo: destino } });
    invalidatePlatoMenuCache();
    return { modifiedCount: result.modifiedCount || 0, origen, destino };
};

/**
 * Conteo de uso por slug (agregación).
 */
const contarUsoPorSlug = async () => {
    const aggs = await platoModel.aggregate([
        { $group: { _id: '$tipo', count: { $sum: 1 } } }
    ]);
    const map = {};
    aggs.forEach(a => { map[a._id] = a.count; });
    return map;
};

/**
 * Helpers internos
 */
async function _findDoc(id) {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
        return TipoPlato.findById(id);
    }
    const num = Number(id);
    if (!Number.isNaN(num)) {
        const d = await TipoPlato.findOne({ id: num });
        if (d) return d;
    }
    const bySlug = await TipoPlato.findOne({ slug: String(id).toLowerCase().trim() });
    return bySlug;
}

async function invalidatePlatoMenuCache() {
    try {
        const redisCache = require('../utils/redisCache');
        if (!redisCache || typeof redisCache.invalidateCustom !== 'function') return;
        const tipos = await TipoPlato.find({}).select('slug -_id').lean();
        for (const t of tipos) {
            redisCache.invalidateCustom('plato:menu', t.slug).catch(() => {});
        }
    } catch (_) {}
}

module.exports = {
    listarTiposPlato,
    getMenuLigero,
    obtenerTipoPlatoPorSlug,
    obtenerTipoPlatoPorId,
    crearTipoPlato,
    actualizarTipoPlato,
    desactivarTipoPlato,
    reactivarTipoPlato,
    eliminarTipoPlato,
    obtenerPlatosQueUsanTipo,
    reasignarTipoPlato,
    contarUsoPorSlug,
    slugify
};