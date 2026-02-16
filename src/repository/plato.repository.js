const platoModel = require('../database/models/plato.model');
const plato = platoModel;
const TIPOS_MENU = platoModel.TIPOS_MENU || ['platos-desayuno', 'plato-carta normal'];
const { syncJsonFile } = require('../utils/jsonSync');
const redisCache = require('../utils/redisCache');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const PLATO_MENU_CACHE_TTL = 300; // 5 min
const PLATO_MENU_CACHE_PREFIX = 'plato:menu';

const queryActivos = () => ({ stock: { $gte: 0 }, $or: [{ isActive: true }, { isActive: { $exists: false } }] });

/**
 * Normaliza query param tipo a valor canónico para BD.
 * Acepta: 'todos'|''|null → null; 'desayuno'|'platos-desayuno' → 'platos-desayuno'; 'carta'|'plato-carta normal' → 'plato-carta normal'.
 */
function normalizarTipoParam(tipo) {
    if (tipo == null || typeof tipo !== 'string') return null;
    const t = String(tipo).trim().toLowerCase();
    if (t === 'todos' || t === '') return null;
    if (t === 'desayuno' || t === 'platos-desayuno') return 'platos-desayuno';
    if (t === 'carta' || t === 'plato-carta normal') return 'plato-carta normal';
    return null;
}

/**
 * Filtro Mongo para tipo permitiendo espacios/case en BD.
 */
function buildTipoFilter(canonicalTipo) {
    const escaped = canonicalTipo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    return { tipo: { $regex: new RegExp('^\\s*' + escaped + '\\s*$', 'i') } };
}

const listarPlatos = async () => {
    const data = await plato.find({});
    return data;
};

/**
 * Lista platos opcionalmente filtrados por tipo (robusto: alias + regex).
 * @param {string|null} tipo - 'todos'|'desayuno'|'carta'|'platos-desayuno'|'plato-carta normal'
 * @param {object} opts - { isActive: boolean }
 */
const listarPlatosPorTipo = async (tipo, opts = {}) => {
    const canonical = normalizarTipoParam(tipo);
    const filter = { ...queryActivos() };
    if (opts.isActive === true) {
        filter.$or = [{ isActive: true }, { isActive: { $exists: false } }];
    }
    if (canonical) {
        Object.assign(filter, buildTipoFilter(canonical));
    }
    const data = await plato.find(filter).sort({ id: 1, nombre: 1 }).lean();
    if (canonical && data.length === 0) {
        logger.warn('No platos para tipo', { tipoParam: tipo, canonical, query: filter });
    }
    return data;
};

const inferirTipoDesdeNombre = (nombre) => {
    if (!nombre || typeof nombre !== 'string') return 'plato-carta normal';
    const n = nombre.toLowerCase();
    if (/desayuno|tamal|pan\s|huevo|sándwich|sandwich|jamón|tostada|avena|café|jugo|infusión/i.test(n)) return 'platos-desayuno';
    return 'plato-carta normal';
};

/** Counter id usado por mongoose-sequence para platos (inc_field: 'id'). */
const PLATO_SEQUENCE_ID = 'id';
const COUNTERS_COLLECTION = 'counters';

/**
 * Ajusta el contador de mongoose-sequence para platos para que el próximo create() use al menos nextVal.
 * Debe llamarse tras importar platos con ids fijos desde JSON para no colisionar con nuevos platos.
 * @param {number} nextVal - Próximo valor a asignar (ej. maxIdJson + 1).
 */
const setPlatoSequence = async (nextVal) => {
    const conn = plato.db;
    if (!conn) {
        logger.warn('setPlatoSequence: sin conexión');
        return;
    }
    const num = Math.max(1, Number(nextVal) | 0);
    const col = conn.collection(COUNTERS_COLLECTION);
    await col.updateOne(
        { id: PLATO_SEQUENCE_ID, reference_value: null },
        { $set: { seq: num } },
        { upsert: true }
    );
    logger.info('Sequence plato ajustada', { nextVal: num });
};

/**
 * Upsert por nombre (case-insensitive): si ya existe un plato activo con ese nombre, no crea duplicado.
 * @param {Object} data - { nombre, precio, stock, categoria?, tipo? }
 * @returns {{ action: 'created'|'skipped', doc: Object|null }}
 */
const upsertPlatoByName = async (data) => {
    const nombreTrim = data.nombre != null ? String(data.nombre).trim() : '';
    if (!nombreTrim) {
        logger.warn('upsertPlatoByName: nombre vacío', { data });
        return { action: 'skipped', doc: null };
    }
    const nombreLower = nombreTrim.toLowerCase();
    const precio = Number(data.precio);
    const stock = Number(data.stock);
    if (Number.isNaN(precio) || precio < 0) {
        logger.warn('upsertPlatoByName: precio inválido', { nombre: nombreTrim, precio: data.precio });
        return { action: 'skipped', doc: null };
    }
    if (Number.isNaN(stock) || stock < 0) {
        logger.warn('upsertPlatoByName: stock inválido', { nombre: nombreTrim, stock: data.stock });
        return { action: 'skipped', doc: null };
    }
    const categoria = (data.categoria && String(data.categoria).trim()) || 'General';
    const tipo = data.tipo && TIPOS_MENU.includes(data.tipo) ? data.tipo : inferirTipoDesdeNombre(data.nombre);

    let existente = await plato.findOne({ nombreLower });
    if (!existente) {
        existente = await plato.findOne({ nombre: { $regex: new RegExp(`^${nombreTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, isActive: { $ne: false } });
    }
    if (existente) {
        logger.debug('Plato existente, skip', { nombre: nombreTrim, id: existente.id });
        return { action: 'skipped', doc: existente };
    }

    try {
        const nuevo = await plato.create({
            nombre: nombreTrim,
            precio,
            stock,
            categoria,
            tipo
        });
        logger.debug('Plato creado', { nombre: nombreTrim, id: nuevo.id });
        return { action: 'created', doc: nuevo };
    } catch (err) {
        if (err.code === 11000) {
            logger.warn('Dup intento, ya existe', { nombre: nombreTrim });
            return { action: 'skipped', doc: null };
        }
        throw err;
    }
};

/**
 * Construye un documento plato para insert (preserva id del JSON; no incluye _id).
 */
function buildPlatoDocFromJson(p) {
    const nombreTrim = (p.nombre != null ? String(p.nombre).trim() : '') || 'Sin nombre';
    const nombreLower = nombreTrim.toLowerCase();
    const precio = Number(p.precio);
    const stock = Number(p.stock);
    const categoria = (p.categoria && String(p.categoria).trim()) || 'General';
    const tipo = (p.tipo && TIPOS_MENU.includes(p.tipo)) ? p.tipo : inferirTipoDesdeNombre(p.nombre);
    const id = typeof p.id === 'number' && Number.isInteger(p.id) && p.id > 0 ? p.id : null;
    if (id == null) return null;
    return {
        id,
        nombre: nombreTrim,
        nombreLower,
        precio: Number.isNaN(precio) ? 0 : Math.max(0, precio),
        stock: Number.isNaN(stock) ? 0 : Math.max(0, stock),
        categoria,
        tipo,
        isActive: p.isActive !== false
    };
}

/**
 * Importa platos desde data/platos.json preservando el id exacto del JSON.
 * Inserta solo platos cuyo id no existe en BD; luego ajusta la sequence para futuros create().
 */
const importarPlatosDesdeJSON = async () => {
    try {
        if (process.env.SKIP_JSON_IMPORT === 'true') {
            console.log('⏭️ SKIP_JSON_IMPORT=true, omitiendo importación de platos.');
            return { imported: 0, skipped: 0, errors: [], preservedIds: 0, sequenceNext: null };
        }

        const filePath = path.join(DATA_DIR, 'platos.json');
        if (!fs.existsSync(filePath)) {
            console.log('⚠️ Archivo platos.json no encontrado');
            return { imported: 0, skipped: 0, errors: [], preservedIds: 0, sequenceNext: null };
        }

        let jsonData;
        try {
            jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (parseErr) {
            console.warn('⚠️ platos.json inválido o vacío, skip silencioso:', parseErr.message);
            return { imported: 0, skipped: 0, errors: [], preservedIds: 0, sequenceNext: null };
        }

        if (!Array.isArray(jsonData)) {
            console.log('⚠️ El archivo platos.json no contiene un array válido');
            return { imported: 0, skipped: 0, errors: [], preservedIds: 0, sequenceNext: null };
        }

        const idsInJson = jsonData.map(p => typeof p.id === 'number' && Number.isInteger(p.id) && p.id > 0 ? p.id : null).filter(Boolean);
        const maxIdJson = idsInJson.length ? Math.max(...idsInJson) : 0;

        const existingIds = await plato.distinct('id').then(arr => arr.filter(Number.isFinite));
        const toInsert = [];
        for (const p of jsonData) {
            const id = typeof p.id === 'number' && Number.isInteger(p.id) && p.id > 0 ? p.id : null;
            if (id == null) continue;
            if (existingIds.includes(id)) continue;
            const doc = buildPlatoDocFromJson(p);
            if (doc) toInsert.push(doc);
        }

        let imported = 0;
        const errors = [];
        if (toInsert.length > 0) {
            try {
                const result = await plato.insertMany(toInsert, { ordered: false, rawResult: true });
                const inserted = result.insertedCount != null ? result.insertedCount : (result.length || 0);
                imported = Number(inserted);
                if (result.writeErrors && result.writeErrors.length) {
                    result.writeErrors.forEach(e => errors.push({ plato: e.id ?? e.index, error: e.err?.message || String(e.err) }));
                }
            } catch (err) {
                if (err.insertedDocs && err.insertedDocs.length) {
                    imported = err.insertedDocs.length;
                }
                errors.push({ plato: 'batch', error: err.message });
                logger.warn('Import platos insertMany parcial/error', { error: err.message, imported });
            }
        }

        const skipped = jsonData.length - toInsert.length;
        const maxExisting = existingIds.length ? Math.max(...existingIds) : 0;
        const sequenceNext = Math.max(maxIdJson, maxExisting, 0) + 1;
        await setPlatoSequence(sequenceNext);

        const todosLosPlatos = await listarPlatos();
        await syncJsonFile('platos.json', todosLosPlatos);

        console.log(`✅ Import platos: ${imported} insertados con id JSON, ${skipped} ya existían. Sequence next=${sequenceNext}. Preservados IDs 1-${maxIdJson}.`);
        logger.info('Import platos completado', { imported, skipped, preservedIds: idsInJson.length, sequenceNext });
        return { imported, skipped, errors, preservedIds: idsInJson.length, sequenceNext };
    } catch (error) {
        logger.error('Error al importar platos desde JSON', { error: error.message });
        throw error;
    }
};

const obtenerPlatoPorId = async (id) => {
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) {
        const byId = await plato.findById(id);
        if (byId) return byId;
    }
    const num = Number(id);
    if (!Number.isNaN(num)) {
        const data = await plato.findOne({ id: num });
        if (data) return data;
    }
    return plato.findOne({ id: id });
}

const findByCategoria = async (categoria) => {
    const data = await plato.find({ categoria: categoria });
    return data;
}

const crearPlato = async (data) => {
    const nuevo = await plato.create(data);
    invalidatePlatoMenuCache(nuevo.tipo);
    if (global.emitPlatoMenuActualizado) await global.emitPlatoMenuActualizado(nuevo).catch(() => {});
    const todosLosPlatos = await listarPlatos();
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
};

const actualizarPlato = async (id, newData) => {
    const anterior = await plato.findOne({ id: Number(id) }).lean();
    await plato.findOneAndUpdate({ id: id }, newData);
    if (anterior?.tipo) invalidatePlatoMenuCache(anterior.tipo);
    if (newData.tipo) invalidatePlatoMenuCache(newData.tipo);
    const actualizado = await plato.findOne({ id: Number(id) });
    if (actualizado && global.emitPlatoMenuActualizado) await global.emitPlatoMenuActualizado(actualizado).catch(() => {});
    const todosLosPlatos = await listarPlatos();
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
};

const borrarPlato = async (id) => {
    const mongoose = require('mongoose');
    const doc = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
        ? await plato.findById(id)
        : await plato.findOne({ id: Number(id) });
    if (doc) {
        invalidatePlatoMenuCache(doc.tipo);
        await plato.findByIdAndDelete(doc._id);
    } else {
        await plato.findByIdAndDelete(id);
    }
    const todosLosPlatos = await listarPlatos();
    await syncJsonFile('platos.json', todosLosPlatos);
    return todosLosPlatos;
};

/**
 * Invalidar cache de menú por tipo (al actualizar/crear/eliminar plato)
 */
function invalidatePlatoMenuCache(tipo) {
    if (!tipo) return;
    redisCache.invalidateCustom(PLATO_MENU_CACHE_PREFIX, tipo).catch(() => {});
}

/**
 * GET /api/platos/menu/:tipo — Platos agrupados por categoría para un tipo de menú.
 * Cache Redis 5 min.
 */
const getMenuPorTipo = async (tipo, page = 1, limit = 500) => {
    const canonical = normalizarTipoParam(tipo) || (TIPOS_MENU.includes(tipo) ? tipo : null);
    if (!canonical) {
        const err = new Error('tipo debe ser "platos-desayuno", "plato-carta normal", "desayuno" o "carta"');
        err.statusCode = 400;
        throw err;
    }
    const cacheKey = `${canonical}:${page}:${limit}`;
    const cached = await redisCache.getCustom(PLATO_MENU_CACHE_PREFIX, cacheKey);
    if (cached) return cached;

    const skip = (Math.max(1, page) - 1) * Math.min(limit, 500);
    const limitNum = Math.min(Math.max(1, limit), 500);
    const filter = { ...buildTipoFilter(canonical), ...queryActivos() };
    const docs = await plato
        .find(filter)
        .sort({ categoria: 1, nombre: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();

    const categoriasMap = new Map();
    for (const d of docs) {
        const cat = d.categoria || 'General';
        if (!categoriasMap.has(cat)) categoriasMap.set(cat, []);
        categoriasMap.get(cat).push(d);
    }
    const categorias = Array.from(categoriasMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([categoria, platos]) => ({ categoria, platos }));

    const total = await plato.countDocuments(filter);
    const result = {
        platos: docs,
        total,
        categorias,
        filtrosAplicados: { tipo: canonical, page, limit: limitNum }
    };
    await redisCache.setCustom(PLATO_MENU_CACHE_PREFIX, cacheKey, result, PLATO_MENU_CACHE_TTL);
    if (total === 0) logger.warn('No platos para menú tipo', { tipoParam: tipo, canonical });
    logger.debug('Menu por tipo cargado', { tipo: canonical, total, categoriasCount: categorias.length });
    return result;
};

/**
 * GET /api/platos/categorias — Lista única de categorías activas con count por tipo
 */
const getCategorias = async () => {
    const match = { stock: { $gt: 0 }, $or: [{ isActive: true }, { isActive: { $exists: false } }] };
    const agg = await plato.aggregate([
        { $match: match },
        { $group: { _id: { categoria: '$categoria', tipo: '$tipo' }, count: { $sum: 1 } } },
        { $sort: { '_id.categoria': 1 } }
    ]);
    const desayuno = [];
    const carta = [];
    const tipoNorm = (t) => (t || '').trim().toLowerCase();
    for (const g of agg) {
        const item = { categoria: g._id.categoria || 'General', count: g.count };
        if (tipoNorm(g._id.tipo) === 'platos-desayuno') desayuno.push(item);
        else carta.push(item);
    }
    return { desayuno, carta };
};

/**
 * GET /api/platos/menu/:tipo/categoria/:categoria — Platos por tipo y categoría (lazy)
 */
const getMenuPorTipoYCategoria = async (tipo, categoria, page = 1, limit = 100) => {
    const canonical = normalizarTipoParam(tipo) || (TIPOS_MENU.includes(tipo) ? tipo : null);
    if (!canonical) {
        const err = new Error('tipo debe ser "platos-desayuno", "plato-carta normal", "desayuno" o "carta"');
        err.statusCode = 400;
        throw err;
    }
    const skip = (Math.max(1, page) - 1) * Math.min(limit, 100);
    const limitNum = Math.min(Math.max(1, limit), 100);
    const filter = { ...buildTipoFilter(canonical), categoria: String(categoria).trim(), ...queryActivos() };
    const platos = await plato
        .find(filter)
        .sort({ nombre: 1 })
        .skip(skip)
        .limit(limitNum)
        .lean();
    const total = await plato.countDocuments(filter);
    return {
        platos,
        total,
        categorias: [categoria],
        filtrosAplicados: { tipo, categoria, page, limit: limitNum }
    };
};

/**
 * PATCH /api/platos/:id/tipo — Cambiar tipo de un plato. Invalida cache y emite WebSocket.
 */
const actualizarTipoPlato = async (id, nuevoTipo) => {
    if (!TIPOS_MENU.includes(nuevoTipo)) {
        const err = new Error('tipo debe ser "platos-desayuno" o "plato-carta normal"');
        err.statusCode = 400;
        throw err;
    }
    const mongoose = require('mongoose');
    const doc = mongoose.Types.ObjectId.isValid(id) && String(id).length === 24
        ? await plato.findById(id)
        : await plato.findOne({ id: Number(id) });
    if (!doc) {
        const err = new Error('Plato no encontrado');
        err.statusCode = 404;
        throw err;
    }
    const tipoAnterior = doc.tipo;
    doc.tipo = nuevoTipo;
    await doc.save();
    invalidatePlatoMenuCache(tipoAnterior);
    invalidatePlatoMenuCache(nuevoTipo);
    const todosLosPlatos = await listarPlatos();
    await syncJsonFile('platos.json', todosLosPlatos);
    if (global.emitPlatoMenuActualizado) {
        await global.emitPlatoMenuActualizado(doc).catch(() => {});
    }
    logger.info('Tipo de plato actualizado', { platoId: id, tipoAnterior, nuevoTipo });
    return { plato: doc, todosLosPlatos };
};

module.exports = {
    listarPlatos,
    listarPlatosPorTipo,
    crearPlato,
    obtenerPlatoPorId,
    actualizarPlato,
    borrarPlato,
    findByCategoria,
    importarPlatosDesdeJSON,
    setPlatoSequence,
    upsertPlatoByName,
    getMenuPorTipo,
    getCategorias,
    getMenuPorTipoYCategoria,
    actualizarTipoPlato,
    invalidatePlatoMenuCache,
    TIPOS_MENU
};
