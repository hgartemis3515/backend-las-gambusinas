/**
 * Worker de la cola `firmar-enviar`: firma, envía y guarda el CDR.
 * Errores de red/servicio se reintentan con backoff; rechazos SUNAT no.
 * @module facturacion/jobs/firmarEnviar.worker
 */

const { Worker, UnrecoverableError } = require('bullmq');
const Comprobante = require('../models/comprobante.model');
const { ESTADO_COMPROBANTE } = require('../constants/catalogosSunat');
const { obtenerProveedorFiscal } = require('../providers');
const { NOMBRE_COLA_FIRMAR_ENVIAR, obtenerConexion } = require('./queues');

const ESTADOS_FINALES = new Set([
    ESTADO_COMPROBANTE.ACEPTADO,
    ESTADO_COMPROBANTE.ACEPTADO_OBS,
    ESTADO_COMPROBANTE.RECHAZADO,
    ESTADO_COMPROBANTE.ANULADO_NC,
    ESTADO_COMPROBANTE.BAJA_PENDIENTE,
    ESTADO_COMPROBANTE.DE_BAJA,
]);

/**
 * Traduce el código de respuesta SUNAT/OSE a estado interno.
 * '0' aceptado · 0100–1999 excepción (reintentar) · 2000–3999 rechazo · ≥4000 observación.
 * @param {{codigo: string, observaciones?: string[]}} cdr
 * @returns {{estado: string, reintentar: boolean}}
 */
function interpretarCdr(cdr) {
    const codigo = Number(String(cdr.codigo).replace(/\D/g, '') || NaN);
    if (codigo === 0) {
        const obs = (cdr.observaciones || []).length > 0;
        return { estado: obs ? ESTADO_COMPROBANTE.ACEPTADO_OBS : ESTADO_COMPROBANTE.ACEPTADO, reintentar: false };
    }
    if (codigo >= 4000) return { estado: ESTADO_COMPROBANTE.ACEPTADO_OBS, reintentar: false };
    if (codigo >= 2000) return { estado: ESTADO_COMPROBANTE.RECHAZADO, reintentar: false };
    return { estado: ESTADO_COMPROBANTE.PENDIENTE_ENVIO, reintentar: true };
}

/**
 * Procesa un job. Exportado para tests (inyección de dependencias).
 * @param {{data: {comprobanteId: string, idCompleto: string}, attemptsMade?: number}} job
 * @param {{Modelo?: import('mongoose').Model, proveedor?: import('../providers/ProveedorFiscal'), notificar?: Function}} [deps]
 */
async function procesarFirmarEnviar(job, deps = {}) {
    const Modelo = deps.Modelo || Comprobante;
    const proveedor = deps.proveedor || obtenerProveedorFiscal();
    const notificar = deps.notificar || notificarSocket;

    const doc = await Modelo.findById(job.data.comprobanteId);
    if (!doc) throw new UnrecoverableError(`Comprobante ${job.data.idCompleto} no encontrado`);
    if (ESTADOS_FINALES.has(doc.estado)) return { omitido: true, estado: doc.estado };

    doc.envio.intentos += 1;
    doc.envio.ultimoIntento = new Date();
    doc.envio.proveedor = proveedor.nombre;

    let resp;
    try {
        resp = await proveedor.emitir(doc.toObject());
    } catch (err) {
        doc.estado = ESTADO_COMPROBANTE.PENDIENTE_ENVIO;
        doc.envio.ultimoError = String(err.message || err).slice(0, 1000);
        doc.auditar('ENVIO_ERROR', 'sistema', { intento: doc.envio.intentos, error: doc.envio.ultimoError });
        await doc.save();
        throw err;
    }

    const { estado, reintentar } = interpretarCdr(resp);
    doc.estado = estado;
    if (resp.hash) doc.hash = resp.hash;
    if (resp.xmlNombre) doc.xml.nombre = resp.xmlNombre;
    doc.cdr.codigo = String(resp.codigo);
    doc.cdr.descripcion = resp.descripcion || null;
    doc.cdr.observaciones = resp.observaciones || [];
    doc.cdr.fecha = new Date();
    doc.envio.ultimoError = reintentar || estado === ESTADO_COMPROBANTE.RECHAZADO ? resp.descripcion : null;
    doc.auditar(`CDR_${estado}`, 'sistema', { codigo: resp.codigo, intento: doc.envio.intentos });
    await doc.save();

    if (estado === ESTADO_COMPROBANTE.RECHAZADO) {
        notificar('comprobante:rechazado', doc);
        throw new UnrecoverableError(`${doc.idCompleto} rechazado: [${resp.codigo}] ${resp.descripcion}`);
    }
    if (reintentar) throw new Error(`${doc.idCompleto} excepción [${resp.codigo}] ${resp.descripcion}`);

    notificar('comprobante:estado', doc);
    return { estado, hash: doc.hash };
}

/**
 * @param {string} evento
 * @param {Object} doc
 */
function notificarSocket(evento, doc) {
    if (!global.io) return;
    global.io.emit(evento, {
        id: String(doc._id),
        idCompleto: doc.idCompleto,
        estado: doc.estado,
        cdr: { codigo: doc.cdr.codigo, descripcion: doc.cdr.descripcion },
    });
}

/** @type {Worker|null} */
let worker = null;

/**
 * Inicia el worker (una vez por proceso).
 * @param {{concurrencia?: number, logger?: {info: Function, error: Function}}} [opciones]
 * @returns {Worker}
 */
function iniciarWorkerFirmarEnviar({ concurrencia = 5, logger = console } = {}) {
    if (worker) return worker;
    worker = new Worker(NOMBRE_COLA_FIRMAR_ENVIAR, (job) => procesarFirmarEnviar(job), {
        connection: obtenerConexion(),
        concurrency: concurrencia,
        settings: {
            backoffStrategy: (intento) => [60000, 300000, 900000, 3600000][Math.min(intento - 1, 3)],
        },
    });
    worker.on('completed', (job, res) => logger.info(`[facturacion] ${job.id} → ${res?.estado || 'omitido'}`));
    worker.on('failed', (job, err) => logger.error(`[facturacion] ${job?.id} falló (intento ${job?.attemptsMade}): ${err.message}`));
    return worker;
}

async function detenerWorkerFirmarEnviar() {
    if (worker) await worker.close();
    worker = null;
}

module.exports = { procesarFirmarEnviar, interpretarCdr, iniciarWorkerFirmarEnviar, detenerWorkerFirmarEnviar };
