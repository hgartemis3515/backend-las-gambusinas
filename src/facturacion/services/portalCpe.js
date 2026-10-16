/**
 * Consulta pública de comprobantes. El enlace de descarga expira a los 15 minutos.
 * @module facturacion/services/portalCpe
 */

const crypto = require('crypto');

const VIGENCIA_MS = 15 * 60 * 1000;

/** @param {Object} doc @param {Object} consulta */
function coincideConsulta(doc, consulta) {
    const fechaDoc = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(doc.fechaEmision));
    const fecha = String(consulta.fechaEmision || '').slice(0, 10);
    return doc.ruc === consulta.rucEmisor
        && doc.tipo === consulta.tipo
        && doc.serie === String(consulta.serie || '').toUpperCase()
        && doc.numero === String(consulta.numero || '').padStart(8, '0')
        && fechaDoc === fecha
        && Number(doc.totales?.importeTotal) === Number(consulta.montoTotal);
}

/** @param {Object} payload @param {string} secreto @param {number} [ahora] */
function firmarDescarga(payload, secreto, ahora = Date.now()) {
    const cuerpo = Buffer.from(JSON.stringify({ ...payload, exp: ahora + VIGENCIA_MS })).toString('base64url');
    const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
    return `${cuerpo}.${firma}`;
}

/** @param {string} token @param {string} secreto @param {number} [ahora] */
function leerDescarga(token, secreto, ahora = Date.now()) {
    const [cuerpo, firma] = String(token || '').split('.');
    if (!cuerpo || !firma) throw Object.assign(new Error('Enlace inválido'), { statusCode: 401 });
    const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
    const a = Buffer.from(firma);
    const b = Buffer.from(esperada);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        throw Object.assign(new Error('Enlace inválido'), { statusCode: 401 });
    }
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    if (datos.exp < ahora) throw Object.assign(new Error('Enlace vencido'), { statusCode: 401 });
    return datos;
}

module.exports = { coincideConsulta, firmarDescarga, leerDescarga, VIGENCIA_MS };
