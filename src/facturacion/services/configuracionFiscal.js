/**
 * Configuración fiscal derivada de `configuracionSistema` + variables de entorno.
 * @module facturacion/services/configuracionFiscal
 */

const ConfiguracionSistema = require('../../database/models/configuracionSistema.model');

/**
 * @typedef {Object} ConfiguracionFiscal
 * @property {{ruc: string, razonSocial: string, nombreComercial: string, direccion: string, ubigeo: string, codigoEstablecimiento: string}} emisor
 * @property {number} tasaIgv
 * @property {boolean} preciosIncluyenIGV
 * @property {{'01': string, '03': string}} series
 * @property {number} limiteBoletaAnonima
 * @property {number} plazoEnvioDias
 * @property {string} afectacionCortesia
 */

/** @returns {Promise<ConfiguracionFiscal>} */
async function obtenerConfiguracionFiscal() {
    const cfg = await ConfiguracionSistema.obtenerConfiguracion();
    const df = cfg?.datosFiscales || {};
    return {
        emisor: {
            ruc: (process.env.SUNAT_AMBIENTE === 'beta' && process.env.SUNAT_RUC) ? process.env.SUNAT_RUC : (df.ruc || process.env.SUNAT_RUC || ''),
            razonSocial: process.env.SUNAT_RAZON_SOCIAL || df.razonSocial || (process.env.SUNAT_AMBIENTE === 'beta' ? 'EMPRESA DEMO' : ''),
            nombreComercial: df.nombreComercial || '',
            direccion: df.direccionFiscal || '',
            ubigeo: process.env.FACTURACION_UBIGEO || '',
            codigoEstablecimiento: process.env.FACTURACION_COD_ESTABLECIMIENTO || '0000',
        },
        tasaIgv: Number(cfg?.igvPorcentaje ?? process.env.IGV_PORCENTAJE ?? 10.5),
        preciosIncluyenIGV: cfg?.preciosIncluyenIGV ?? true,
        series: {
            '01': cfg?.numeracion?.serieFactura || 'F001',
            '03': cfg?.numeracion?.serieBoleta || 'B001',
        },
        limiteBoletaAnonima: Number(cfg?.facturacion?.limiteBoletaAnonima ?? process.env.FACTURACION_LIMITE_BOLETA_ANONIMA ?? 700),
        topeDescuentoPct: Number(cfg?.facturacion?.topeDescuentoPct ?? process.env.FACTURACION_TOPE_DESCUENTO_PCT ?? 10),
        plazoEnvioDias: Number(cfg?.facturacion?.plazoEnvioDias ?? process.env.FACTURACION_PLAZO_ENVIO_DIAS ?? 3),
        afectacionCortesia: process.env.FACTURACION_AFECTACION_CORTESIA || '15',
    };
}

module.exports = { obtenerConfiguracionFiscal };
