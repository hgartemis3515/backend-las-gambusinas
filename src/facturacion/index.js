/**
 * Punto de entrada del módulo de facturación electrónica.
 * @module facturacion
 */

const comprobanteRoutes = require('./controllers/comprobanteController');
const operacionRoutes = require('./controllers/operacionController');
const { iniciarWorkerFirmarEnviar } = require('./jobs/firmarEnviar.worker');
const { iniciarWorkerReconciliacion } = require('./jobs/reconciliacion.worker');
const { iniciarWorkerAuditoriaGaps } = require('./jobs/auditoriaGaps.worker');
const { redisHabilitado } = require('./jobs/queues');

/**
 * Monta las rutas siempre. Los workers arrancan si `FACTURACION_HABILITADA=true`, el worker no está apagado y Redis está habilitado.
 * @param {import('express').Express} app
 * @param {{info: Function, error: Function, warn?: Function}} [logger]
 */
function montarFacturacion(app, logger = console) {
    app.use('/api', comprobanteRoutes);
    app.use('/api', operacionRoutes);
    const emisionActiva = process.env.FACTURACION_HABILITADA === 'true';
    if (emisionActiva && process.env.FACTURACION_WORKER !== 'false' && redisHabilitado()) {
        iniciarWorkerFirmarEnviar({ logger });
        iniciarWorkerReconciliacion({ logger });
        iniciarWorkerAuditoriaGaps({ logger });
        logger.info('[facturacion] workers firmar-enviar, reconciliacion y auditoria-gaps iniciados');
    } else {
        (logger.warn || logger.info)('[facturacion] rutas listas; worker apagado (FACTURACION_HABILITADA, FACTURACION_WORKER o Redis)');
    }
}

module.exports = { montarFacturacion };
