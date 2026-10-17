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

function noticiaPublica(doc) {
    return {
        _id: doc._id,
        fechaOperativa: doc.fechaOperativa,
        titulo: doc.titulo,
        cuerpoHtml: doc.cuerpoHtml || '',
        imagenes: doc.imagenes || [],
        autor: doc.autor || {},
        vigente: doc.vigente !== false,
        createdAt: doc.createdAt,
    };
}

async function listarHoy(now = new Date()) {
    const fechaOperativa = ymdOperativo(now);
    const docs = await Noticia.find({ fechaOperativa, vigente: true }).sort({ createdAt: -1 }).limit(20).lean();
    return { fechaOperativa, noticias: docs.map(noticiaPublica) };
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
    return { titulo, cuerpoHtml, imagenes };
}

function prepararTemporal(body, autor) {
    const campos = armarCuerpo(body);
    return {
        titulo: campos.titulo,
        cuerpoHtml: campos.cuerpoHtml,
        autor: { nombre: String(autor?.nombre || '') },
        temporal: true,
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
    retirarNoticia,
};
