'use strict';

const moment = require('moment-timezone');
const Comanda = require('../database/models/comanda.model');
const Noticia = require('../database/models/noticia.model');
const NoticiaProgramada = require('../database/models/noticiaProgramada.model');
const { matchComandasEstadisticas } = require('../utils/estadisticasComandas');
const { ymdOperativo, boundsDiaOperativo, TZ } = require('../utils/diaOperativoRestaurante');
const { sanitizarHtmlNoticia, imagenesDeHtml, envolverEmojis, textoPlanoNoticia } = require('../utils/sanitizarHtmlNoticia');

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
        cuerpoHtml: envolverEmojis(doc.cuerpoHtml || ''),
        imagenes: doc.imagenes || [],
        autor: doc.autor || {},
        vigente: doc.vigente !== false,
        destinos: doc.destinos?.length ? doc.destinos : ['cocina', 'mozos'],
        cocinaAlcance: doc.cocinaAlcance || 'todas',
        pantallas: doc.pantallas || [],
        mozosAlcance: doc.mozosAlcance || 'todos',
        mozoIds: doc.mozoIds || [],
        segundosEnPantalla: Number(doc.segundosEnPantalla) || 15,
        segundosSalirMozos: salirMozosDe(doc.segundosSalirMozos, Number(doc.segundosEnPantalla) || 15),
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
    return { titulo, cuerpoHtml, imagenes };
}

function destinoDe(body = {}) {
    const quien = body.destinatario || 'ambos';
    const cocina = quien === 'cocina' || quien === 'ambos';
    const mozos = quien === 'mozos' || quien === 'ambos';
    const crudo = body.cocinaDestino || 'todas';
    const cocinaAlcance = !cocina
        ? 'ninguna'
        : (crudo === 'hub' ? 'pantallas' : (crudo === 'kds' ? 'kds' : (crudo === 'caja' ? 'caja' : 'todas')));
    const pantallas = (body.pantallas || body.cocinerasHub || [])
        .map((x) => Number(typeof x === 'object' ? (x.numero || x.numeroPantalla) : x))
        .filter((n) => Number.isFinite(n));
    const cocinaCocineroIds = [...new Set((body.cocinaCocineroIds || []).map(String).filter(Boolean))];
    const mozosAlcance = !mozos ? 'ninguno' : (body.mozosModo === 'seleccion' ? 'algunos' : 'todos');
    const mozoIds = (body.mozoIds || body.mozosSeleccionados || []).map(String).filter(Boolean);
    let segundos = Number(body.segundosCocina ?? body.segundosEnPantalla ?? 15);
    if (!Number.isFinite(segundos)) segundos = 15;
    segundos = Math.min(120, Math.max(5, Math.round(segundos)));
    const segundosSalirMozos = salirMozosDe(body.segundosSalirMozos, segundos);
    if (cocina && cocinaAlcance === 'pantallas' && crudo !== 'caja' && !pantallas.length) {
        const err = new Error('Elige al menos una pantalla');
        err.status = 400;
        throw err;
    }
    if (mozos && mozosAlcance === 'algunos' && !mozoIds.length) {
        const err = new Error('Elige al menos un mozo');
        err.status = 400;
        throw err;
    }
    return {
        destinos: [
            cocina && cocinaAlcance !== 'caja' ? 'cocina' : null,
            cocina && cocinaAlcance === 'caja' ? 'caja' : null,
            mozos ? 'mozos' : null,
        ].filter(Boolean),
        cocinaAlcance,
        pantallas,
        cocinaCocineroIds,
        mozosAlcance,
        mozoIds,
        segundosEnPantalla: segundos,
        segundosSalirMozos,
    };
}

function salirMozosDe(valor, tope) {
    let n = Number(valor);
    if (!Number.isFinite(n)) n = 6;
    n = Math.min(120, Math.max(0, Math.round(n)));
    const techo = Number(tope);
    if (Number.isFinite(techo)) n = Math.min(n, techo);
    return n;
}

function prepararTemporal(body, autor) {
    const campos = armarCuerpo(body);
    return {
        titulo: campos.titulo,
        cuerpoHtml: campos.cuerpoHtml,
        autor: { nombre: String(autor?.nombre || '') },
        temporal: true,
        ...destinoDe(body),
    };
}

async function crearNoticia(body, autor, cuando = new Date(), idForzado = null) {
    const campos = armarCuerpo(body);
    const datos = {
        ...campos,
        fechaOperativa: ymdOperativo(cuando),
        autor: {
            id: String(autor?.id || ''),
            nombre: String(autor?.nombre || ''),
            rol: String(autor?.rol || ''),
        },
        vigente: true,
        ...destinoDe(body),
    };
    if (idForzado && idNoticia(idForzado)) datos._id = idForzado;
    const doc = await Noticia.create(datos);
    const guardada = await Noticia.findById(doc._id).select('_id').lean();
    if (!guardada) {
        const err = new Error('La noticia no quedó guardada');
        err.status = 500;
        throw err;
    }
    return noticiaPublica(doc.toObject());
}

async function reponerNoticia(id, body, autor, cuando = new Date()) {
    if (id && idNoticia(id)) {
        const ya = await Noticia.findById(id).lean();
        if (ya) return noticiaPublica(ya);
    }
    return crearNoticia(body, autor, cuando, id);
}

async function actualizarNoticia(id, body) {
    const campos = { ...armarCuerpo(body), ...destinoDe(body) };
    const doc = await Noticia.findByIdAndUpdate(id, campos, { new: true }).lean();
    if (!doc) {
        const err = new Error('Noticia no encontrada');
        err.status = 404;
        throw err;
    }
    return noticiaPublica(doc);
}

async function idsMozosActivosHoy(now = new Date()) {
    const dia = ymdOperativo(now);
    const ids = await Comanda.distinct('mozos', {
        diaOperativo: dia,
        mozos: { $ne: null },
    });
    return ids.filter(Boolean).map(String);
}

function idNoticia(id) {
    return /^[a-f\d]{24}$/i.test(String(id || ''));
}

function parseProgramadaPara(valor) {
    const s = String(valor || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
        const err = new Error('Elige el día y la hora');
        err.status = 400;
        throw err;
    }
    const cuando = moment.tz(s, 'YYYY-MM-DDTHH:mm', true, TZ);
    if (!cuando.isValid()) {
        const err = new Error('La hora no es válida');
        err.status = 400;
        throw err;
    }
    if (cuando.valueOf() < Date.now() + 20 * 1000) {
        const err = new Error('Elige una hora que todavía no haya pasado');
        err.status = 400;
        throw err;
    }
    if (cuando.diff(moment.tz(TZ), 'days', true) > 60) {
        const err = new Error('Solo se puede programar hasta 60 días');
        err.status = 400;
        throw err;
    }
    return cuando.toDate();
}

function programadaPublica(doc) {
    const destinos = doc.destinos?.length ? doc.destinos : [];
    const nombres = [];
    if (destinos.includes('cocina')) nombres.push('Cocina');
    if (destinos.includes('caja')) nombres.push('Caja');
    if (destinos.includes('mozos')) nombres.push('Mozos');
    return {
        _id: doc._id,
        programadaPara: doc.programadaPara,
        estado: doc.estado,
        titulo: doc.titulo || '',
        extracto: textoPlanoNoticia(doc.cuerpoHtml).slice(0, 180),
        destinosTexto: nombres.join(' · ') || 'Aviso',
        error: doc.error || '',
        autorNombre: doc.autor?.nombre || '',
    };
}

async function programarNoticia(body, autor) {
    const programadaPara = parseProgramadaPara(body?.programadaPara);
    const campos = armarCuerpo(body);
    if (!campos.titulo && !textoPlanoNoticia(campos.cuerpoHtml) && !campos.imagenes.length) {
        const err = new Error('Escribe el mensaje antes de programarlo');
        err.status = 400;
        throw err;
    }
    const destino = destinoDe(body);
    const doc = await NoticiaProgramada.create({
        programadaPara,
        estado: 'pendiente',
        titulo: campos.titulo,
        cuerpoHtml: campos.cuerpoHtml,
        autor: {
            id: String(autor?.id || ''),
            nombre: String(autor?.nombre || ''),
            rol: String(autor?.rol || ''),
        },
        payload: {
            destinatario: body.destinatario || 'ambos',
            cocinaDestino: body.cocinaDestino || 'todas',
            pantallas: destino.pantallas,
            cocinaCocineroIds: destino.cocinaCocineroIds,
            segundosCocina: destino.segundosEnPantalla,
            segundosSalirMozos: destino.segundosSalirMozos,
            mozosModo: body.mozosModo === 'seleccion' ? 'seleccion' : 'todos',
            mozoIds: destino.mozoIds,
        },
        ...destino,
    });
    return programadaPublica(doc.toObject());
}

function avisoEnPantalla(doc, ahora = new Date()) {
    const fin = new Date(doc.muestraHasta).getTime();
    const queda = Math.max(1, Math.ceil((fin - ahora.getTime()) / 1000));
    const salirBase = Number(doc.segundosSalirMozos);
    const salir = Math.min(queda, Math.max(0, Number.isFinite(salirBase) ? Math.round(salirBase) : 6));
    return {
        _id: doc.noticiaId || String(doc._id),
        titulo: doc.titulo || '',
        cuerpoHtml: doc.cuerpoHtml || '',
        segundosEnPantalla: queda,
        segundosSalirMozos: salir,
        destinos: doc.destinos?.length ? doc.destinos : ['cocina', 'mozos'],
        cocinaAlcance: doc.cocinaAlcance || 'todas',
        pantallas: doc.pantallas || [],
        cocinaCocineroIds: doc.payload?.cocinaCocineroIds || [],
        mozosAlcance: doc.mozosAlcance || 'todos',
        mozoIds: doc.mozoIds || [],
        temporal: true,
    };
}

async function listarEnPantalla(ahora = new Date()) {
    const docs = await NoticiaProgramada.find({
        estado: 'enviada',
        muestraHasta: { $gt: ahora },
    }).sort({ muestraHasta: 1 }).limit(8).lean();
    return docs.map((doc) => avisoEnPantalla(doc, ahora));
}

async function listarProgramadas() {
    const docs = await NoticiaProgramada.find({ estado: { $in: ['pendiente', 'error'] } })
        .sort({ programadaPara: 1 })
        .limit(50)
        .lean();
    return docs.map(programadaPublica);
}

async function cancelarProgramada(id) {
    if (!idNoticia(id)) {
        const err = new Error('Ese mensaje ya se envió o no existe');
        err.status = 404;
        throw err;
    }
    const doc = await NoticiaProgramada.findOneAndUpdate(
        { _id: id, estado: { $in: ['pendiente', 'error'] } },
        { $set: { estado: 'cancelada' } },
        { new: true },
    ).lean();
    if (!doc) {
        const err = new Error('Ese mensaje ya se envió o no existe');
        err.status = 404;
        throw err;
    }
    return programadaPublica(doc);
}

async function reintentarProgramada(id) {
    if (!idNoticia(id)) {
        const err = new Error('Ese mensaje ya se envió o no existe');
        err.status = 404;
        throw err;
    }
    const doc = await NoticiaProgramada.findOne({ _id: id, estado: 'error' });
    if (!doc) {
        const err = new Error('Ese mensaje ya se envió o no existe');
        err.status = 404;
        throw err;
    }
    doc.estado = 'pendiente';
    doc.intentos = 0;
    doc.error = '';
    doc.enviandoDesde = null;
    if (!doc.programadaPara || doc.programadaPara.getTime() < Date.now()) {
        doc.programadaPara = new Date();
    }
    await doc.save();
    return programadaPublica(doc.toObject());
}

function avisoReenvio(doc) {
    const noticia = noticiaPublica(doc);
    return {
        titulo: noticia.titulo,
        cuerpoHtml: noticia.cuerpoHtml,
        autor: { nombre: noticia.autor?.nombre || '' },
        temporal: true,
        reenvio: true,
        noticiaId: String(noticia._id),
        destinos: noticia.destinos,
        cocinaAlcance: noticia.cocinaAlcance,
        pantallas: noticia.pantallas,
        mozosAlcance: noticia.mozosAlcance,
        mozoIds: noticia.mozoIds,
        segundosEnPantalla: noticia.segundosEnPantalla,
        segundosSalirMozos: noticia.segundosSalirMozos,
    };
}

async function reenviarNoticia(id) {
    if (!idNoticia(id)) {
        const err = new Error('Noticia no encontrada');
        err.status = 404;
        throw err;
    }
    const doc = await Noticia.findById(id).lean();
    if (!doc || doc.vigente === false) {
        const err = new Error('Esa publicación ya no está en el archivo vigente');
        err.status = 404;
        throw err;
    }
    return avisoReenvio(doc);
}

async function retirarNoticia(id) {
    const doc = await Noticia.findByIdAndDelete(id).lean();
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
    reponerNoticia,
    actualizarNoticia,
    idsMozosActivosHoy,
    retirarNoticia,
    reenviarNoticia,
    programarNoticia,
    listarEnPantalla,
    listarProgramadas,
    cancelarProgramada,
    reintentarProgramada,
    parseProgramadaPara,
};
