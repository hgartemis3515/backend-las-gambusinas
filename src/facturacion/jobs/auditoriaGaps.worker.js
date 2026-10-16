/**
 * A las 02:00 revisa que cada serie no tenga números faltantes.
 * @module facturacion/jobs/auditoriaGaps.worker
 */

const { Worker, Queue } = require('bullmq');
const Comprobante = require('../models/comprobante.model');
const AuditoriaFiscal = require('../models/auditoriaFiscal.model');
const { auditarSeries } = require('../services/auditoriaGaps');
const { obtenerConexion } = require('./queues');

const NOMBRE = 'auditoria-gaps';

/** @param {{ logger?: Console }} [opciones] */
function iniciarWorkerAuditoriaGaps({ logger = console } = {}) {
    const conexion = obtenerConexion();
    const cola = new Queue(NOMBRE, { connection: conexion });
    cola.add(NOMBRE, {}, { repeat: { pattern: '0 2 * * *' }, jobId: 'auditoria-gaps-02' }).catch((err) => logger.error(err.message));
    const worker = new Worker(NOMBRE, async () => {
        const series = await auditarSeries(Comprobante);
        for (const serie of series) {
            await AuditoriaFiscal.create({
                tipo: 'gap',
                ruc: serie.ruc,
                tipoComprobante: serie.tipo,
                serie: serie.serie,
                faltantes: serie.faltantes,
                rangos: serie.rangos,
            });
            if (global.io) global.io.emit('comprobante:gap', serie);
        }
        logger.info(`[auditoria-gaps] series con salto: ${series.length}`);
        return series;
    }, { connection: conexion });
    worker.on('failed', (job, err) => logger.error(`[auditoria-gaps] ${job?.id} ${err.message}`));
    return worker;
}

module.exports = { iniciarWorkerAuditoriaGaps, NOMBRE };
