/**
 * Resumen SUNAT del talonario. Agrupa por fecha de emisión y usa el correlativo RC.
 * @module facturacion/services/contingenciaSunat
 */

const Contingencia = require('../models/contingencia.model');
const { firmarXml } = require('./firmaService');
const { reservarEnvio } = require('./correlativoEnvio');
const { xmlResumen, fechaLima } = require('./resumenDiario');
const SunatDirecto = require('../providers/sunatDirecto');

/** @param {Object} doc @param {number} tasa */
function lineaTalonario(doc, tasa) {
    const total = Number(doc.total) || 0;
    const base = Math.round((total / (1 + tasa / 100)) * 100) / 100;
    const igv = Math.round((total - base) * 100) / 100;
    return {
        tipo: '03',
        serie: doc.serieTalonario,
        numero: doc.numero,
        importeTotal: total,
        gravadas: base,
        exoneradas: 0,
        inafectas: 0,
        igv,
        porcentajeIgv: tasa,
        receptor: doc.cliente,
    };
}

/**
 * @param {{ ruc: string, emisor: Object, tasaIgv?: number }} solicitud
 * @param {Object} [deps]
 */
async function declararContingencia(solicitud, deps = {}) {
    const Modelo = deps.Modelo || Contingencia;
    const pendientes = await Modelo.find({ ruc: solicitud.ruc, estado: 'REGISTRADO' });
    if (!pendientes.length) return { enviados: 0, lotes: [] };
    const grupos = new Map();
    for (const doc of pendientes) {
        const fecha = fechaLima(doc.fechaEmision);
        if (!grupos.has(fecha)) grupos.set(fecha, []);
        grupos.get(fecha).push(doc);
    }
    const reservar = deps.reservar || reservarEnvio;
    const firmar = deps.firmar || firmarXml;
    const enviar = deps.enviar || (async (nombre, xml) => new SunatDirecto({ persistirLote: false }).enviarResumenFirmado(nombre, xml));
    const hoy = fechaLima(new Date());
    const tasa = solicitud.tasaIgv || 10.5;
    const lotes = [];
    for (const [fecha, docs] of grupos) {
        const { id } = await reservar({ ruc: solicitud.ruc, tipo: 'RC', fecha });
        const xml = xmlResumen({
            id,
            fechaReferencia: fecha,
            fechaGeneracion: hoy < fecha ? fecha : hoy,
            emisor: solicitud.emisor,
            lineas: docs.map((doc) => lineaTalonario(doc, tasa)),
        });
        const firmado = firmar(xml);
        const { ticket } = await enviar(`${solicitud.ruc}-${id}`, firmado.xml || firmado);
        await Modelo.updateMany({ _id: { $in: docs.map((d) => d._id) } }, { $set: { estado: 'ENVIADO', ticketSunat: ticket } });
        lotes.push({ id, fecha, ticket, enviados: docs.length, estado: 'ENVIADO' });
    }
    return { enviados: pendientes.length, lotes, ticket: lotes[0]?.ticket || null, id: lotes[0]?.id || null };
}

module.exports = { declararContingencia, lineaTalonario };
