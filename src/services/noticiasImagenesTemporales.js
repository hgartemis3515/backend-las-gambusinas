'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const Noticia = require('../database/models/noticia.model');

const DIR = path.join(__dirname, '..', '..', 'uploads', 'noticias');
const UNA_HORA_MS = 60 * 60 * 1000;
const CADA_MS = 5 * 60 * 1000;

function edadMs(nombre, mtimeMs) {
    const marca = /^(\d{13})-/.exec(nombre);
    const desde = marca ? Number(marca[1]) : mtimeMs;
    if (!Number.isFinite(desde)) return 0;
    return Date.now() - desde;
}

function quitarImg(html, url) {
    const esc = String(url).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(html || '').replace(new RegExp(`<img\\b[^>]*src="${esc}"[^>]*>`, 'gi'), '');
}

async function barrerImagenesNoticia() {
    let nombres = [];
    try {
        nombres = fs.readdirSync(DIR);
    } catch (_) {
        return { borradas: 0 };
    }
    const caducadas = [];
    for (const nombre of nombres) {
        if (!/^[\w.-]+$/.test(nombre)) continue;
        const full = path.join(DIR, nombre);
        let stat;
        try { stat = fs.statSync(full); } catch (_) { continue; }
        if (!stat.isFile() || edadMs(nombre, stat.mtimeMs) < UNA_HORA_MS) continue;
        caducadas.push(`/uploads/noticias/${nombre}`);
    }
    if (!caducadas.length) return { borradas: 0 };

    const docs = await Noticia.find({
        $or: [
            { imagenes: { $in: caducadas } },
            { cuerpoHtml: /\/uploads\/noticias\// },
        ],
    }).select('_id cuerpoHtml imagenes').lean();

    for (const doc of docs) {
        let html = doc.cuerpoHtml || '';
        let cambio = false;
        for (const url of caducadas) {
            if (!html.includes(url) && !(doc.imagenes || []).includes(url)) continue;
            const siguiente = quitarImg(html, url);
            if (siguiente !== html) cambio = true;
            html = siguiente;
        }
        const quedan = (doc.imagenes || []).filter((u) => !caducadas.includes(u));
        if (cambio || quedan.length !== (doc.imagenes || []).length) {
            await Noticia.updateOne({ _id: doc._id }, { cuerpoHtml: html, imagenes: quedan });
        }
    }

    let borradas = 0;
    for (const url of caducadas) {
        const nombre = url.slice('/uploads/noticias/'.length);
        try {
            fs.unlinkSync(path.join(DIR, nombre));
            borradas += 1;
        } catch (error) {
            logger.warn('No se borró la foto de la noticia', { nombre, error: error.message });
        }
    }
    if (borradas) logger.info('Fotos de noticia eliminadas al cumplirse 1 hora', { borradas });
    return { borradas };
}

function iniciarBarridoImagenesNoticia() {
    if (iniciarBarridoImagenesNoticia.hecho) return;
    iniciarBarridoImagenesNoticia.hecho = true;
    const tick = () => {
        barrerImagenesNoticia().catch((error) => {
            logger.warn('Barrido de fotos de noticia', { error: error.message });
        });
    };
    setInterval(tick, CADA_MS);
    setImmediate(tick);
}

module.exports = {
    UNA_HORA_MS,
    edadMs,
    barrerImagenesNoticia,
    iniciarBarridoImagenesNoticia,
};
