'use strict';

const fs = require('fs');
const path = require('path');
const Noticia = require('../database/models/noticia.model');
const NoticiaProgramada = require('../database/models/noticiaProgramada.model');
const { imagenesDeHtml } = require('../utils/sanitizarHtmlNoticia');
const logger = require('../utils/logger');

const CADA_MS = 15 * 1000;
const ATASCO_MS = 2 * 60 * 1000;
const DIR = path.join(__dirname, '..', '..', 'uploads', 'noticias');

function cuerpoDe(doc) {
    const p = doc.payload || {};
    return {
        titulo: doc.titulo || '',
        cuerpoHtml: doc.cuerpoHtml || '',
        destinatario: p.destinatario || 'ambos',
        cocinaDestino: p.cocinaDestino || 'todas',
        pantallas: p.pantallas || [],
        cocinaCocineroIds: p.cocinaCocineroIds || [],
        segundosCocina: p.segundosCocina,
        segundosSalirMozos: p.segundosSalirMozos,
        mozosModo: p.mozosModo || 'todos',
        mozoIds: p.mozoIds || [],
    };
}

function avisoDe(doc, body) {
    return {
        _id: doc.noticiaId,
        titulo: body.titulo,
        cuerpoHtml: body.cuerpoHtml,
        segundosEnPantalla: Number(body.segundosCocina) || doc.segundosEnPantalla || 15,
        segundosSalirMozos: Number(body.segundosSalirMozos) || doc.segundosSalirMozos || 6,
        destinos: doc.destinos || [],
        cocinaAlcance: doc.cocinaAlcance || 'todas',
        pantallas: doc.pantallas || [],
        mozosAlcance: doc.mozosAlcance || 'todos',
        mozoIds: doc.mozoIds || [],
    };
}

/** La foto vive 1 hora desde que se sube. Al transmitir, se copia para que ese plazo empiece en el envío. */
function renovarImagenes(html) {
    let out = String(html || '');
    const urls = imagenesDeHtml(out);
    urls.forEach((url, i) => {
        const nombre = url.slice('/uploads/noticias/'.length);
        if (!/^[\w.-]+$/.test(nombre)) return;
        const src = path.join(DIR, nombre);
        let stat;
        try { stat = fs.statSync(src); } catch (_) { return; }
        if (!stat.isFile()) return;
        const ext = path.extname(nombre).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return;
        const nuevo = `${Date.now()}-${i}-${Math.round(Math.random() * 1e6)}${ext === '.jpeg' ? '.jpg' : ext}`;
        try {
            fs.copyFileSync(src, path.join(DIR, nuevo));
        } catch (error) {
            logger.warn('No se pudo renovar la foto programada', { nombre, error: error.message });
            return;
        }
        out = out.split(url).join(`/uploads/noticias/${nuevo}`);
    });
    return out;
}

async function recuperarAtascadas() {
    const limite = new Date(Date.now() - ATASCO_MS);
    await NoticiaProgramada.updateMany(
        { estado: 'enviando', enviandoDesde: { $lt: limite }, intentos: { $gte: 3 } },
        { $set: { estado: 'error', error: 'No se pudo confirmar el envío' } },
    );
    await NoticiaProgramada.updateMany(
        { estado: 'enviando', enviandoDesde: { $lt: limite }, intentos: { $lt: 3 } },
        { $set: { estado: 'pendiente' } },
    );
}

/** Si el envío quedó marcado pero la noticia no está en el archivo, la cocina la pierde al reiniciar. */
async function repararEnviadasSinAviso() {
    const limite = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const docs = await NoticiaProgramada.find({
        estado: 'enviada',
        enviadaAt: { $gte: limite },
    }).sort({ enviadaAt: -1 }).limit(20);

    const repo = require('../repository/noticias.repository');
    const { emitirNoticia } = require('../controllers/noticiasController');
    for (const doc of docs) {
        const id = String(doc.noticiaId || '');
        if (/^[a-f\d]{24}$/i.test(id)) {
            const existe = await Noticia.findById(id).select('_id').lean();
            if (existe) continue;
        }
        const body = cuerpoDe(doc);
        const cuando = doc.enviadaAt || doc.programadaPara || new Date();
        const noticia = await repo.reponerNoticia(id, body, doc.autor || {}, cuando);
        const segundos = Math.min(120, Math.max(5, Number(doc.segundosEnPantalla) || Number(body.segundosCocina) || 15));
        const muestraHasta = doc.muestraHasta && new Date(doc.muestraHasta).getTime() > Date.now()
            ? doc.muestraHasta
            : new Date(Date.now() + segundos * 1000);
        await NoticiaProgramada.updateOne(
            { _id: doc._id },
            { $set: { noticiaId: String(noticia._id), muestraHasta } },
        );
        emitirNoticia('creada', noticia, body);
        logger.warn('Aviso programado recuperado: no estaba en el archivo', { id: String(doc._id) });
    }
}

async function dispararUna() {
    const doc = await NoticiaProgramada.findOneAndUpdate(
        { estado: 'pendiente', programadaPara: { $lte: new Date() }, intentos: { $lt: 3 } },
        { $set: { estado: 'enviando', enviandoDesde: new Date() }, $inc: { intentos: 1 } },
        { sort: { programadaPara: 1 }, new: true },
    );
    if (!doc) return false;

    try {
        const repo = require('../repository/noticias.repository');
        const { emitirAvisoTemporal } = require('../controllers/noticiasController');
        const body = cuerpoDe(doc);
        let noticia = null;
        if (doc.noticiaId) {
            noticia = avisoDe(doc, body);
        } else {
            body.cuerpoHtml = renovarImagenes(body.cuerpoHtml);
            noticia = await repo.crearNoticia(body, doc.autor || {}, new Date());
            await NoticiaProgramada.updateOne(
                { _id: doc._id },
                { $set: { noticiaId: String(noticia._id), cuerpoHtml: body.cuerpoHtml } },
            );
        }
        const aviso = repo.prepararTemporal({
            ...body,
            titulo: noticia.titulo || body.titulo,
            cuerpoHtml: noticia.cuerpoHtml || body.cuerpoHtml,
            segundosCocina: noticia.segundosEnPantalla || body.segundosCocina,
            segundosSalirMozos: noticia.segundosSalirMozos ?? body.segundosSalirMozos,
        }, doc.autor || {});
        emitirAvisoTemporal(aviso);
        const segundos = Math.min(120, Math.max(5, Number(aviso.segundosEnPantalla) || 15));
        const enviadaAt = new Date();
        await NoticiaProgramada.updateOne(
            { _id: doc._id },
            { $set: { estado: 'enviada', enviadaAt, muestraHasta: new Date(enviadaAt.getTime() + segundos * 1000), error: '' } },
        );
        logger.info('Noticia programada enviada', { id: String(doc._id), cuando: doc.programadaPara });
    } catch (error) {
        const intentos = doc.intentos || 1;
        await NoticiaProgramada.updateOne(
            { _id: doc._id },
            { $set: { estado: intentos >= 3 ? 'error' : 'pendiente', error: error.message || 'No se pudo enviar' } },
        );
        logger.warn('No se pudo enviar la noticia programada', { id: String(doc._id), error: error.message });
    }
    return true;
}

async function barrerProgramadas() {
    await repararEnviadasSinAviso();
    await recuperarAtascadas();
    for (let i = 0; i < 10; i += 1) {
        const hubo = await dispararUna();
        if (!hubo) break;
    }
}

function iniciarBarridoNoticiasProgramadas() {
    if (iniciarBarridoNoticiasProgramadas.hecho) return;
    iniciarBarridoNoticiasProgramadas.hecho = true;
    const tick = () => {
        barrerProgramadas().catch((error) => {
            logger.warn('Barrido de noticias programadas', { error: error.message });
        });
    };
    setInterval(tick, CADA_MS);
    setImmediate(tick);
}

module.exports = {
    iniciarBarridoNoticiasProgramadas,
    barrerProgramadas,
};
