/**
 * Colas BullMQ del módulo de facturación.
 * @module facturacion/jobs/queues
 */

const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const NOMBRE_COLA_FIRMAR_ENVIAR = 'firmar-enviar';

/** Reintentos: 1 m, 2 m, 4 m, … (≈ 8.5 h con 10 intentos). El job de reconciliación cubre el resto del plazo legal. */
const OPCIONES_JOB_FIRMAR_ENVIAR = Object.freeze({
    attempts: Number(process.env.FACTURACION_REINTENTOS || 10),
    backoff: { type: 'custom' },
    removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },
    removeOnFail: false,
});

/** Tiempo máximo que el cobro espera a Redis antes de seguir sin encolar. */
const TIMEOUT_ENCOLAR_MS = Number(process.env.FACTURACION_TIMEOUT_ENCOLAR_MS || 100);

/** @type {IORedis|null} */
let conexionWorker = null;
/** @type {IORedis|null} */
let conexionProductor = null;
/** @type {Queue|null} */
let colaFirmarEnviar = null;

/** @returns {boolean} */
const redisHabilitado = () => process.env.REDIS_ENABLED !== 'false';

/** @param {Object} extra @returns {IORedis} */
function crearConexion(extra) {
    const opciones = { maxRetriesPerRequest: null, enableReadyCheck: false, ...extra };
    return process.env.REDIS_URL
        ? new IORedis(process.env.REDIS_URL, opciones)
        : new IORedis({ host: process.env.REDIS_HOST || '127.0.0.1', port: Number(process.env.REDIS_PORT || 6379), ...opciones });
}

/**
 * Conexión de workers (BullMQ exige `maxRetriesPerRequest: null`).
 * @returns {IORedis}
 */
function obtenerConexion() {
    if (!conexionWorker) conexionWorker = crearConexion({});
    return conexionWorker;
}

/** @returns {Queue} */
function obtenerColaFirmarEnviar() {
    if (!colaFirmarEnviar) {
        // Productor sin cola offline: si Redis cae, `add` falla rápido y el cobro no se bloquea.
        conexionProductor = crearConexion({ enableOfflineQueue: false });
        conexionProductor.on('error', () => {});
        colaFirmarEnviar = new Queue(NOMBRE_COLA_FIRMAR_ENVIAR, {
            connection: conexionProductor,
            defaultJobOptions: OPCIONES_JOB_FIRMAR_ENVIAR,
        });
    }
    return colaFirmarEnviar;
}

/**
 * Encola la firma/envío. Idempotente: `jobId = idCompleto` (SERIE-NUMERO);
 * BullMQ ignora un segundo `add` con el mismo jobId.
 * Si Redis no responde a tiempo devuelve `encolado: false`; el comprobante queda
 * en EMITIDO_LOCAL y lo recoge la reconciliación.
 * @param {{_id: *, idCompleto: string}} comprobante
 * @returns {Promise<{encolado: boolean, jobId: string, motivo?: string}>}
 */
async function encolarFirmarEnviar(comprobante) {
    const jobId = comprobante.idCompleto;
    if (!redisHabilitado()) return { encolado: false, jobId, motivo: 'REDIS_DESHABILITADO' };
    let timer;
    const timeout = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error('TIMEOUT_REDIS')), TIMEOUT_ENCOLAR_MS);
    });
    try {
        await Promise.race([
            obtenerColaFirmarEnviar().add(
                NOMBRE_COLA_FIRMAR_ENVIAR,
                { comprobanteId: String(comprobante._id), idCompleto: jobId },
                { jobId }
            ),
            timeout,
        ]);
        return { encolado: true, jobId };
    } catch (err) {
        return { encolado: false, jobId, motivo: err.message };
    } finally {
        clearTimeout(timer);
    }
}

async function cerrarColas() {
    if (colaFirmarEnviar) await colaFirmarEnviar.close();
    if (conexionProductor) await conexionProductor.quit();
    if (conexionWorker) await conexionWorker.quit();
    colaFirmarEnviar = null;
    conexionProductor = null;
    conexionWorker = null;
}

module.exports = {
    NOMBRE_COLA_FIRMAR_ENVIAR,
    OPCIONES_JOB_FIRMAR_ENVIAR,
    obtenerConexion,
    obtenerColaFirmarEnviar,
    encolarFirmarEnviar,
    cerrarColas,
    redisHabilitado,
};
