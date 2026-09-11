const CategoriaPlato = require('../database/models/categoriaPlato.model');
const plato = require('../database/models/plato.model');
const logger = require('../utils/logger');
const { validarCodigoMozo } = require('../utils/validarCodigoPlato');
const { wrapMutacionesCatalogo } = require('../utils/catalogoCartaPersistencia');
const { categoriasDePlato, sanitizarCategoriasPlato } = require('../utils/categoriasPlato');
const {
    sanitizarOrdenPorTipo,
    sanitizarOcultoEnTipos,
    cmpCategoriasMozo,
} = require('../utils/ordenCategoriaMozo');

function normalizeNombreCat(nombre) {
    const n = String(nombre || '').trim();
    return n || 'General';
}

async function asegurarCategoria(nombre, codigoMozo) {
    const n = normalizeNombreCat(nombre);
    const lower = n.toLowerCase();
    let doc = await CategoriaPlato.findOne({ nombreLower: lower });
    if (!doc) {
        const r = validarCodigoMozo(codigoMozo);
        doc = await CategoriaPlato.create({
            nombre: n,
            nombreLower: lower,
            codigoMozo: r.valido ? r.codigo : '',
        });
        return doc;
    }
    if (codigoMozo != null && codigoMozo !== undefined && String(codigoMozo).trim() !== '') {
        const r = validarCodigoMozo(codigoMozo);
        if (r.valido && r.codigo && doc.codigoMozo !== r.codigo) {
            doc.codigoMozo = r.codigo;
            await doc.save();
        }
    }
    return doc;
}

async function sincronizarDesdePlatos() {
    const docs = await plato.find({}).select('categoria categorias').lean();
    const names = new Set();
    docs.forEach((p) => categoriasDePlato(p).forEach((c) => names.add(c)));
    for (const n of names) await asegurarCategoria(n);
}

function platoResumen(p) {
    return {
        _id: p._id,
        id: p.id,
        nombre: p.nombre,
        codigo: p.codigo || '',
        codigoMozo: p.codigoMozo || '',
        categoria: p.categoria || 'General',
        precio: p.precio,
        stock: p.stock,
    };
}

function coincideBusqueda(cat, platosCat, q) {
    if (!q) return true;
    if (cat.nombre.toLowerCase().includes(q) || (cat.codigoMozo || '').includes(q.toUpperCase())) {
        return true;
    }
    return platosCat.some((p) => {
        const nom = String(p.nombre || '').toLowerCase();
        const cm = String(p.codigoMozo || '').toUpperCase();
        const ck = String(p.codigo || '').toUpperCase();
        return nom.includes(q) || cm.includes(q.toUpperCase()) || ck.includes(q.toUpperCase());
    });
}

async function listarCategoriasGestion(qRaw) {
    await sincronizarDesdePlatos();
    const q = String(qRaw || '').trim().toLowerCase();
    const cats = await CategoriaPlato.find({}).sort({ nombre: 1 }).lean();
    const platos = await plato.find({}).select('id nombre codigo codigoMozo categoria categorias precio stock').lean();
    const byCat = new Map();
    platos.forEach((p) => {
        categoriasDePlato(p).forEach((key) => {
            if (!byCat.has(key)) byCat.set(key, []);
            byCat.get(key).push(platoResumen({ ...p, categoria: key }));
        });
    });
    const nombresVistos = new Set(cats.map((c) => c.nombre));
    const extra = [];
    byCat.forEach((_arr, nombre) => {
        if (!nombresVistos.has(nombre)) {
            extra.push({
                nombre,
                codigoMozo: '',
                imagenUrl: '',
                orden: 99,
                ordenPorTipo: {},
                ocultoEnTipos: [],
                _id: null,
            });
        }
    });
    const todas = [...cats, ...extra];
    const out = [];
    for (const c of todas) {
        const platosCat = byCat.get(c.nombre) || [];
        if (!coincideBusqueda(c, platosCat, q)) continue;
        const filtrados = q
            ? platosCat.filter((p) => {
                const nom = String(p.nombre || '').toLowerCase();
                const cm = String(p.codigoMozo || '').toUpperCase();
                const ck = String(p.codigo || '').toUpperCase();
                const qu = q.toUpperCase();
                const catHit = c.nombre.toLowerCase().includes(q) || (c.codigoMozo || '').includes(qu);
                return catHit || nom.includes(q) || cm.includes(qu) || ck.includes(qu);
            })
            : platosCat;
        out.push({
            _id: c._id || null,
            nombre: c.nombre,
            codigoMozo: c.codigoMozo || '',
            imagenUrl: c.imagenUrl || '',
            orden: Number.isFinite(Number(c.orden)) ? Number(c.orden) : 99,
            ordenPorTipo: sanitizarOrdenPorTipo(c.ordenPorTipo),
            ocultoEnTipos: sanitizarOcultoEnTipos(c.ocultoEnTipos),
            count: platosCat.length,
            platos: filtrados,
        });
    }
    out.sort((a, b) => cmpCategoriasMozo(a, b, ''));
    return out;
}

async function listarCategoriasLigero() {
    await sincronizarDesdePlatos();
    const cats = await CategoriaPlato.find({})
        .select('nombre codigoMozo imagenUrl orden ordenPorTipo ocultoEnTipos')
        .lean();
    return cats
        .map((c) => ({
            nombre: c.nombre,
            codigoMozo: c.codigoMozo || '',
            imagenUrl: c.imagenUrl || '',
            orden: Number.isFinite(Number(c.orden)) ? Number(c.orden) : 99,
            ordenPorTipo: sanitizarOrdenPorTipo(c.ordenPorTipo),
            ocultoEnTipos: sanitizarOcultoEnTipos(c.ocultoEnTipos),
        }))
        .sort((a, b) => cmpCategoriasMozo(a, b, ''));
}

function invalidateTiposDePlatos(docs) {
    const { invalidatePlatoMenuCache } = require('./plato.repository');
    const tipos = new Set();
    (docs || []).forEach((d) => {
        (Array.isArray(d.tipos) && d.tipos.length ? d.tipos : [d.tipo]).forEach((t) => {
            if (t) tipos.add(t);
        });
    });
    tipos.forEach((t) => invalidatePlatoMenuCache(t));
}

async function renombrarCategoria(fromRaw, toRaw) {
    const from = normalizeNombreCat(fromRaw);
    const to = normalizeNombreCat(toRaw);
    if (from.toLowerCase() === to.toLowerCase() && from !== to) {
        // solo casing
    } else if (from.toLowerCase() === to.toLowerCase()) {
        return { nombre: from, renamed: false };
    }
    if (!to) {
        const err = new Error('El nombre de categoría no puede estar vacío');
        err.statusCode = 400;
        throw err;
    }
    const existing = await CategoriaPlato.findOne({ nombreLower: to.toLowerCase() });
    if (existing && existing.nombreLower !== from.toLowerCase()) {
        const err = new Error(`Ya existe la categoría "${existing.nombre}"`);
        err.statusCode = 409;
        throw err;
    }
    const doc = await CategoriaPlato.findOne({ nombreLower: from.toLowerCase() });
    const afectados = await plato.find({
        $or: [{ categoria: from }, { categorias: from }],
    });
    for (const d of afectados) {
        const cats = sanitizarCategoriasPlato(
            categoriasDePlato(d).map((c) => (c === from ? to : c)),
            null
        );
        d.categorias = cats.categorias;
        d.categoria = cats.categoria;
        await d.save();
    }
    if (doc) {
        doc.nombre = to;
        doc.nombreLower = to.toLowerCase();
        await doc.save();
    } else {
        await asegurarCategoria(to);
    }
    invalidateTiposDePlatos(afectados);
    logger.info('Categoría de plato renombrada', { from, to, platos: afectados.length });
    return { nombre: to, renamed: true, platos: afectados.length };
}

async function setCodigoMozoCategoria(nombreRaw, codigoMozo) {
    const n = normalizeNombreCat(nombreRaw);
    const r = validarCodigoMozo(codigoMozo);
    if (!r.valido) {
        const err = new Error(r.error || 'Código de mozo inválido');
        err.statusCode = 400;
        throw err;
    }
    const doc = await asegurarCategoria(n);
    doc.codigoMozo = r.codigo;
    await doc.save();
    return { nombre: doc.nombre, codigoMozo: doc.codigoMozo };
}

async function setVistaCategoria(nombreRaw, { ordenPorTipo, ocultoEnTipos } = {}) {
    const n = normalizeNombreCat(nombreRaw);
    const doc = await asegurarCategoria(n);
    if (ordenPorTipo !== undefined) {
        doc.ordenPorTipo = sanitizarOrdenPorTipo(ordenPorTipo);
        doc.markModified('ordenPorTipo');
    }
    if (ocultoEnTipos !== undefined) {
        doc.ocultoEnTipos = sanitizarOcultoEnTipos(ocultoEnTipos);
    }
    await doc.save();
    return {
        nombre: doc.nombre,
        ordenPorTipo: sanitizarOrdenPorTipo(doc.ordenPorTipo),
        ocultoEnTipos: sanitizarOcultoEnTipos(doc.ocultoEnTipos),
    };
}

async function guardarCategoriasLote(items) {
    if (!Array.isArray(items) || items.length === 0) {
        const err = new Error('No hay categorías para guardar');
        err.statusCode = 400;
        throw err;
    }
    let guardadas = 0;
    const errores = [];
    for (const it of items) {
        const from = normalizeNombreCat(it.nombre);
        const to = normalizeNombreCat(it.nuevoNombre != null ? it.nuevoNombre : it.nombre);
        try {
            if (to !== from) await renombrarCategoria(from, to);
            if (it.codigoMozo != null) await setCodigoMozoCategoria(to, it.codigoMozo);
            const hasVista = Object.prototype.hasOwnProperty.call(it, 'ordenPorTipo')
                || Object.prototype.hasOwnProperty.call(it, 'ocultoEnTipos');
            if (hasVista) {
                await setVistaCategoria(to, {
                    ordenPorTipo: Object.prototype.hasOwnProperty.call(it, 'ordenPorTipo') ? it.ordenPorTipo : undefined,
                    ocultoEnTipos: Object.prototype.hasOwnProperty.call(it, 'ocultoEnTipos') ? it.ocultoEnTipos : undefined,
                });
            }
            guardadas += 1;
        } catch (e) {
            errores.push({ nombre: from, error: e.message || 'No se pudo guardar' });
        }
    }
    return { guardadas, errores };
}

async function setImagenCategoria(nombreRaw, imagenUrl) {
    const n = String(nombreRaw || '').trim();
    if (!n) {
        const err = new Error('Falta el nombre de la categoría');
        err.statusCode = 400;
        throw err;
    }
    const doc = await asegurarCategoria(n);
    const prev = String(doc.imagenUrl || '').trim();
    doc.imagenUrl = String(imagenUrl || '').trim();
    await doc.save();
    return { nombre: doc.nombre, imagenUrl: doc.imagenUrl, anterior: prev };
}

async function moverPlatos(platoIds, categoriaDestino) {
    const dest = normalizeNombreCat(categoriaDestino);
    if (!Array.isArray(platoIds) || platoIds.length === 0) {
        const err = new Error('Selecciona al menos un plato');
        err.statusCode = 400;
        throw err;
    }
    await asegurarCategoria(dest);
    const mongoose = require('mongoose');
    const ids = platoIds.map((id) => {
        if (mongoose.Types.ObjectId.isValid(id) && String(id).length === 24) return id;
        return null;
    }).filter(Boolean);
    const nums = platoIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0);
    const filter = ids.length && nums.length
        ? { $or: [{ _id: { $in: ids } }, { id: { $in: nums } }] }
        : (ids.length ? { _id: { $in: ids } } : { id: { $in: nums } });
    const docs = await plato.find(filter).select('tipos tipo').lean();
    const res = await plato.updateMany(filter, { $set: { categoria: dest, categorias: [dest] } });
    invalidateTiposDePlatos(docs);
    logger.info('Platos movidos de categoría', { destino: dest, matched: res.matchedCount });
    return { categoria: dest, movidos: res.modifiedCount || res.matchedCount || 0 };
}

module.exports = wrapMutacionesCatalogo({
    asegurarCategoria,
    sincronizarDesdePlatos,
    listarCategoriasGestion,
    listarCategoriasLigero,
    renombrarCategoria,
    setCodigoMozoCategoria,
    setVistaCategoria,
    guardarCategoriasLote,
    setImagenCategoria,
    moverPlatos,
}, ['categorias_platos.json', 'platos.json'], [
    'listarCategoriasGestion',
    'listarCategoriasLigero',
]);
