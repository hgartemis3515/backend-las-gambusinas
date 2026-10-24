'use strict';

const moment = require('moment-timezone');
const Comanda = require('../database/models/comanda.model');
const Noticia = require('../database/models/noticia.model');
const { matchComandasEstadisticas } = require('../utils/estadisticasComandas');
const { ymdOperativo, boundsDiaOperativo, TZ } = require('../utils/diaOperativoRestaurante');
const { sanitizarHtmlNoticia, textoPlanoNoticia, imagenesDeHtml } = require('../utils/sanitizarHtmlNoticia');

let cacheTop = null;

function invalidarTopSemana() {
    cacheTop = null;
}

function ventanaSemana(now = new Date()) {
    const hasta = ymdOperativo(now);
    const desde = moment.tz(hasta, 'YYYY-MM-DD', TZ).subtract(6, 'days').format('YYYY-MM-DD');
    const { inicio } = boundsDiaOperativo(desde);
    const { fin } = boundsDiaOperativo(hasta);
    return { desde, hasta, inicio, fin };
}

async function topSemana(now = new Date()) {
    const ventana = ventanaSemana(now);
    if (cacheTop && cacheTop.hasta === ventana.hasta) return cacheTop;
    const filas = await Comanda.aggregate([
        { $match: matchComandasEstadisticas(ventana.inicio, ventana.fin) },
        { $unwind: '$platos' },
        {
            $match: {
                'platos.eliminado': { $ne: true },
                'platos.anulado': { $ne: true },
            },
        },
        {
            $lookup: {
                from: 'platos',
                localField: 'platos.plato',
                foreignField: '_id',
                as: '_platoDoc',
            },
        },
        {
            $addFields: {
                _doc: { $arrayElemAt: ['$_platoDoc', 0] },
                _cant: { $ifNull: ['$platos.cantidad', 1] },
                _soles: { $ifNull: ['$platos.precio', 0] },
                _nombre: {
                    $ifNull: [
                        '$platos.nombre',
                        { $ifNull: [{ $arrayElemAt: ['$_platoDoc.nombre', 0] }, 'Plato'] },
                    ],
                },
            },
        },
        {
            $group: {
                _id: { $ifNull: ['$platos.plato', '$_nombre'] },
                nombre: { $first: '$_nombre' },
                codigo: { $first: { $ifNull: ['$_doc.codigoMozo', ''] } },
                cantidad: { $sum: '$_cant' },
                soles: { $sum: { $multiply: ['$_cant', '$_soles'] } },
            },
        },
        { $sort: { cantidad: -1, soles: -1, nombre: 1 } },
        { $limit: 10 },
    ]);
    const platos = filas.map((r, i) => ({
        puesto: i + 1,
        _id: r._id,
        nombre: r.nombre || 'Plato',
        codigo: r.codigo || '',
        cantidad: r.cantidad || 0,
        soles: Math.round((r.soles || 0) * 100) / 100,
    }));
    cacheTop = {
        fechaOperativa: ventana.hasta,
        desde: ventana.desde,
        hasta: ventana.hasta,
        platos,
    };
    return cacheTop;
}

const DESTINOS = ['mozos', 'cocina', 'caja'];

/** Sin lista guardada: mozos y cocina, como antes. Caja no entra sola. */
function normalizarDestinos(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return ['mozos', 'cocina'];
    const out = [];
    for (const item of raw) {
        const id = String(item || '').trim();
        if (DESTINOS.includes(id) && !out.includes(id)) out.push(id);
    }
    return out;
}

function destinosDe(body) {
    if (!body || !Object.prototype.hasOwnProperty.call(body, 'destinos')) return ['mozos', 'cocina'];
    if (!Array.isArray(body.destinos) || body.destinos.length === 0) {
        const err = new Error('Elige a quién llega');
        err.status = 400;
        throw err;
    }
    const out = [];
    for (const item of body.destinos) {
        const id = String(item || '').trim();
        if (!DESTINOS.includes(id)) {
            const err = new Error('Elige a quién llega');
            err.status = 400;
            throw err;
        }
        if (!out.includes(id)) out.push(id);
    }
    return out;
}

function noticiaPublica(doc) {
    return {
        _id: doc._id,
        fechaOperativa: doc.fechaOperativa,
        titulo: doc.titulo,
        cuerpoHtml: doc.cuerpoHtml || '',
        imagenes: doc.imagenes || [],
        autor: doc.autor || {},
        vigente: doc.vigente !== false,
        destinos: normalizarDestinos(doc.destinos),
        createdAt: doc.createdAt,
    };
}

async function listarHoy(now = new Date(), destino = '') {
    const fechaOperativa = ymdOperativo(now);
    const docs = await Noticia.find({ fechaOperativa, vigente: true }).sort({ createdAt: -1 }).limit(20).lean();
    let noticias = docs.map(noticiaPublica);
    const filtro = String(destino || '').trim();
    if (DESTINOS.includes(filtro)) {
        noticias = noticias.filter((n) => n.destinos.includes(filtro));
    }
    return { fechaOperativa, noticias };
}

async function listarArchivo() {
    const docs = await Noticia.find({}).sort({ createdAt: -1 }).limit(40).lean();
    return docs.map(noticiaPublica);
}

function armarCuerpo(body) {
    const titulo = String(body?.titulo || '').replace(/<[^>]+>/g, '').trim().slice(0, 120);
    const cuerpoHtml = sanitizarHtmlNoticia(body?.cuerpoHtml || '');
    const imagenes = imagenesDeHtml(cuerpoHtml);
    if (!titulo) {
        const err = new Error('La noticia necesita un título');
        err.status = 400;
        throw err;
    }
    if (!textoPlanoNoticia(cuerpoHtml) && imagenes.length === 0) {
        const err = new Error('La noticia necesita texto o una imagen');
        err.status = 400;
        throw err;
    }
    return { titulo, cuerpoHtml, imagenes, destinos: destinosDe(body) };
}

function prepararTemporal(body, autor) {
    const campos = armarCuerpo(body);
    return {
        titulo: campos.titulo,
        cuerpoHtml: campos.cuerpoHtml,
        autor: { nombre: String(autor?.nombre || '') },
        temporal: true,
        destinos: campos.destinos,
    };
}

async function crearNoticia(body, autor) {
    const campos = armarCuerpo(body);
    const doc = await Noticia.create({
        ...campos,
        fechaOperativa: ymdOperativo(),
        autor: {
            id: String(autor?.id || ''),
            nombre: String(autor?.nombre || ''),
            rol: String(autor?.rol || ''),
        },
        vigente: true,
    });
    return noticiaPublica(doc.toObject());
}

async function actualizarNoticia(id, body) {
    const campos = armarCuerpo(body);
    const doc = await Noticia.findByIdAndUpdate(id, campos, { new: true }).lean();
    if (!doc) {
        const err = new Error('Noticia no encontrada');
        err.status = 404;
        throw err;
    }
    return noticiaPublica(doc);
}

async function retirarNoticia(id) {
    const doc = await Noticia.findByIdAndUpdate(id, { vigente: false }, { new: true }).lean();
    if (!doc) {
        const err = new Error('Noticia no encontrada');
        err.status = 404;
        throw err;
    }
    return noticiaPublica(doc);
}

module.exports = {
    invalidarTopSemana,
    topSemana,
    listarHoy,
    listarArchivo,
    prepararTemporal,
    crearNoticia,
    actualizarNoticia,
    destinosDe,
    normalizarDestinos,
    retirarNoticia,
};
