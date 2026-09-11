'use strict';

/**
 * Catálogo de platos.html ↔ Mongo ↔ data/*.json
 * Fuente de verdad: Mongo. El JSON es espejo para restaurar otro backend.
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { syncJsonFile } = require('./jsonSync');
const logger = require('./logger');

const DATA_DIR = path.join(__dirname, '../../data');
const OID_RE = /^[a-fA-F0-9]{24}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

const OID_KEYS = new Set([
    '_id',
    'plato',
    'platoPrincipal',
    'cocineroId',
    'cocineroPrimarioId',
    'actualizadoPor',
    'createdBy',
    'updatedBy',
    'usuario',
    'mozos',
    'mesas',
    'cliente',
]);

const CATALOGO = [
    { file: 'platos.json', collection: 'platos', sort: { orden: 1, id: 1, nombre: 1 } },
    { file: 'complementos_plantilla.json', collection: 'complementos_plantilla', sort: { nombre: 1 } },
    { file: 'categorias_platos.json', collection: 'categorias_platos', sort: { orden: 1, nombre: 1 } },
    { file: 'tipos_plato.json', collection: 'tipos_plato', sort: { orden: 1, nombre: 1 } },
    { file: 'asignacion_automatica.json', collection: 'asignacion_automatica' },
    { file: 'asignacion_automatica_guarniciones.json', collection: 'asignacion_automatica_guarniciones' },
];

const FILE_SET = new Set(CATALOGO.map((c) => c.file));
const timers = Object.create(null);

function normalizeFiles(files) {
    if (files == null) return CATALOGO.map((c) => c.file);
    const arr = Array.isArray(files) ? files : [files];
    return arr.filter((f) => FILE_SET.has(f));
}

function hydrateCatalogoDoc(value, key) {
    if (Array.isArray(value)) return value.map((v) => hydrateCatalogoDoc(v, key));
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = hydrateCatalogoDoc(v, k);
        return out;
    }
    if (typeof value === 'string') {
        if (OID_KEYS.has(key) && OID_RE.test(value)) {
            return new mongoose.Types.ObjectId(value);
        }
        if (ISO_RE.test(value)) return new Date(value);
    }
    return value;
}

function loadJsonArray(fileName) {
    const filePath = path.join(DATA_DIR, fileName);
    if (!fs.existsSync(filePath)) return [];
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        logger.warn('JSON de catálogo ilegible', { fileName, error: err.message });
        return [];
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((doc) => hydrateCatalogoDoc(doc));
}

async function writeCatalogoFile(fileName) {
    const meta = CATALOGO.find((c) => c.file === fileName);
    if (!meta || !mongoose.connection?.db) return 0;
    const cursor = mongoose.connection.db.collection(meta.collection).find({});
    if (meta.sort) cursor.sort(meta.sort);
    const docs = await cursor.toArray();
    await syncJsonFile(fileName, docs);
    return docs.length;
}

function scheduleExport(fileName) {
    clearTimeout(timers[fileName]);
    timers[fileName] = setTimeout(() => {
        writeCatalogoFile(fileName).catch((err) => {
            logger.warn('No se pudo sincronizar JSON del catálogo', { fileName, error: err.message });
        });
    }, 300);
}

async function exportarCatalogoCartaAJson(files, opts = {}) {
    const list = normalizeFiles(files);
    const inmediato = opts.inmediato === true;
    if (!inmediato) {
        list.forEach(scheduleExport);
        return { scheduled: list };
    }
    const counts = {};
    for (const fileName of list) {
        clearTimeout(timers[fileName]);
        counts[fileName] = await writeCatalogoFile(fileName);
    }
    return counts;
}

async function importarColeccionSiVacia(meta) {
    const db = mongoose.connection?.db;
    if (!db) return { collection: meta.collection, imported: 0, skipped: 0 };
    const col = db.collection(meta.collection);
    const n = await col.countDocuments();
    if (n > 0) return { collection: meta.collection, imported: 0, skipped: n };
    const docs = loadJsonArray(meta.file);
    if (!docs.length) return { collection: meta.collection, imported: 0, skipped: 0 };
    try {
        const r = await col.insertMany(docs, { ordered: false });
        return { collection: meta.collection, imported: r.insertedCount || docs.length, skipped: 0 };
    } catch (err) {
        const inserted = err.insertedDocs ? err.insertedDocs.length : 0;
        logger.warn('Import catálogo parcial', { collection: meta.collection, error: err.message, inserted });
        return { collection: meta.collection, imported: inserted, skipped: 0, error: err.message };
    }
}

/**
 * Restaura colecciones de carta si Mongo está vacío (otro backend / DB nueva).
 * No pisa documentos existentes.
 */
async function importarCatalogoCartaDesdeJson() {
    if (process.env.SKIP_JSON_IMPORT === 'true') {
        return { skippedAll: true };
    }
    const results = [];
    for (const meta of CATALOGO) {
        if (meta.collection === 'platos') continue;
        results.push(await importarColeccionSiVacia(meta));
    }
    return results;
}

function wrapMutacionesCatalogo(fns, files, readOnly = []) {
    const skip = new Set(readOnly);
    const fileList = Array.isArray(files) ? files : [files];
    const out = {};
    for (const [name, fn] of Object.entries(fns)) {
        if (typeof fn !== 'function' || skip.has(name)) {
            out[name] = fn;
            continue;
        }
        out[name] = async (...args) => {
            const result = await fn(...args);
            exportarCatalogoCartaAJson(fileList).catch((err) => {
                logger.warn('Sync catálogo tras mutación', { name, error: err.message });
            });
            return result;
        };
    }
    return out;
}

module.exports = {
    CATALOGO,
    hydrateCatalogoDoc,
    loadJsonArray,
    exportarCatalogoCartaAJson,
    importarCatalogoCartaDesdeJson,
    wrapMutacionesCatalogo,
};
