/**
 * Cada hora: comprobantes enviados sin CDR, o pendientes a menos de 24 h del plazo.
 * @module facturacion/jobs/reconciliacion
 */

const { Worker, Queue } = require('bullmq');
const Comprobante = require('../models/comprobante.model');
const { ESTADO_COMPROBANTE } = require('../constants/catalogosSunat');
const { obtenerProveedorFiscal } = require('../providers');
const { obtenerConexion } = require('./queues');

const NOMBRE = 'reconciliacion';
const FINALES = new Set(['ACEPTADO', 'ACEPTADO_OBS', 'RECHAZADO', 'ANULADO_NC', 'DE_BAJA']);

/** @param {Object[]} docs @param {Date} [ahora] */
function candidatos(docs, ahora = new Date()) {
    const limiteCercano = ahora.getTime() + 24 * 3600 * 1000;
    return docs.filter((doc) => {
        if (FINALES.has(doc.estado)) return false;
        if (doc.estado === 'ENVIADO' && !doc.cdr?.codigo) return true;
        const vence = doc.envio?.fechaLimite ? new Date(doc.envio.fechaLimite).getTime() : 0;
        return ['PENDIENTE_ENVIO', 'EMITIDO_LOCAL', 'FIRMADO'].includes(doc.estado) && vence > 0 && vence <= limiteCercano;
    });
}

/**
 * @param {Object[]} docs
 * @param {{ proveedor: { emitir: Function, consultarTicket: Function }, guardar: Function, notificar?: Function }} deps
 */
async function reconciliar(docs, deps) {
    const lista = candidatos(docs);
    const resultados = [];
    for (const doc of lista) {
        const resp = doc.envio?.ticket
            ? await deps.proveedor.consultarTicket(doc.envio.ticket)
            : await deps.proveedor.emitir(doc);
        if (resp.codigo === '0') {
            doc.estado = (resp.observaciones || []).length ? ESTADO_COMPROBANTE.ACEPTADO_OBS : ESTADO_COMPROBANTE.ACEPTADO;
            doc.cdr = { codigo: String(resp.codigo), descripcion: resp.descripcion, observaciones: resp.observaciones || [], fecha: new Date() };
            await deps.guardar(doc);
            if (deps.notificar) deps.notificar('comprobante:estado', doc);
        }
        resultados.push({ idCompleto: doc.idCompleto, codigo: resp.codigo });
    }
    return resultados;
}

/** @param {{ logger?: Console }} [opciones] */
function iniciarWorkerReconciliacion({ logger = console } = {}) {
    const conexion = obtenerConexion();
    const cola = new Queue(NOMBRE, { connection: conexion });
    cola.add(NOMBRE, {}, { repeat: { every: 60 * 60 * 1000 }, jobId: 'reconciliacion-hora' }).catch((err) => logger.error(err.message));
    const worker = new Worker(NOMBRE, async () => {
        const desde = new Date(Date.now() - 4 * 86400000);
        const docs = await Comprobante.find({ fechaEmision: { $gte: desde }, estado: { $nin: [...FINALES] } });
        return reconciliar(docs, {
            proveedor: obtenerProveedorFiscal(),
            guardar: (doc) => doc.save(),
            notificar: (evento, doc) => global.io && global.io.emit(evento, { idCompleto: doc.idCompleto, estado: doc.estado }),
        });
    }, { connection: conexion });
    worker.on('failed', (job, err) => logger.error(`[reconciliacion] ${job?.id} ${err.message}`));
    return worker;
}

module.exports = { candidatos, reconciliar, iniciarWorkerReconciliacion, NOMBRE };
