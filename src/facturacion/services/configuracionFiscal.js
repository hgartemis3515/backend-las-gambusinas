/**
 * Configuración fiscal derivada de `configuracionSistema` + variables de entorno.
 * El RUC y los datos del restaurante guardados en configuración tienen prioridad
 * sobre el RUC de pruebas de SUNAT, para que boleta y factura salgan a nombre del local.
 * @module facturacion/services/configuracionFiscal
 */

const ConfiguracionSistema = require('../../database/models/configuracionSistema.model');
const { esRucValido } = require('./validacionCliente');

/**
 * @typedef {Object} ConfiguracionFiscal
 * @property {{ruc: string, razonSocial: string, nombreComercial: string, direccion: string, telefono: string, email: string, logoUrl: string, ubigeo: string, codigoEstablecimiento: string}} emisor
 * @property {number} tasaIgv
 * @property {boolean} preciosIncluyenIGV
 * @property {{'01': string, '03': string}} series
 * @property {number} limiteBoletaAnonima
 * @property {number} plazoEnvioDias
 * @property {string} afectacionCortesia
 * @property {boolean} listoParaEmitir
 */

function texto(...valores) {
    for (const valor of valores) {
        const limpio = String(valor ?? '').trim();
        if (limpio) return limpio;
    }
    return '';
}

function codigoEstablecimiento(valor) {
    const digitos = String(valor ?? '').replace(/\D/g, '');
    return /^\d{4}$/.test(digitos) ? digitos : '0000';
}

/**
 * Arma el emisor a partir del documento de configuración.
 * Si no hay razón social, usa el nombre comercial para no bloquear la emisión.
 * @param {Object} [cfg]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {ConfiguracionFiscal}
 */
function armarConfiguracionFiscal(cfg = {}, env = process.env) {
    const df = cfg.datosFiscales || {};
    const rucConfigurado = texto(df.ruc);
    const ruc = esRucValido(rucConfigurado) ? rucConfigurado : texto(env.SUNAT_RUC);
    const nombreComercial = texto(df.nombreComercial);
    const razonSocial = texto(
        df.razonSocial,
        nombreComercial,
        env.SUNAT_RAZON_SOCIAL,
        env.SUNAT_AMBIENTE === 'beta' ? 'EMPRESA DEMO' : '',
    );
    const emisor = {
        ruc,
        razonSocial,
        nombreComercial,
        direccion: texto(df.direccionFiscal),
        telefono: texto(df.telefono),
        email: texto(df.email),
        logoUrl: texto(df.logoUrl),
        ubigeo: texto(df.ubigeo, env.FACTURACION_UBIGEO),
        codigoEstablecimiento: codigoEstablecimiento(texto(df.codigoEstablecimiento, env.FACTURACION_COD_ESTABLECIMIENTO)),
    };
    return {
        emisor,
        tasaIgv: Number(cfg.igvPorcentaje ?? env.IGV_PORCENTAJE ?? 10.5),
        preciosIncluyenIGV: cfg.preciosIncluyenIGV ?? true,
        series: {
            '01': cfg.numeracion?.serieFactura || 'F001',
            '03': cfg.numeracion?.serieBoleta || 'B001',
        },
        limiteBoletaAnonima: Number(cfg.facturacion?.limiteBoletaAnonima ?? env.FACTURACION_LIMITE_BOLETA_ANONIMA ?? 700),
        topeDescuentoPct: Number(cfg.facturacion?.topeDescuentoPct ?? env.FACTURACION_TOPE_DESCUENTO_PCT ?? 10),
        plazoEnvioDias: Number(cfg.facturacion?.plazoEnvioDias ?? env.FACTURACION_PLAZO_ENVIO_DIAS ?? 3),
        afectacionCortesia: env.FACTURACION_AFECTACION_CORTESIA || '15',
        listoParaEmitir: esRucValido(emisor.ruc) && Boolean(emisor.razonSocial),
    };
}

const FISCAL_TTL = 300;

/** @returns {Promise<ConfiguracionFiscal>} */
async function obtenerConfiguracionFiscal() {
    const redisCache = require('../../utils/redisCache');
    const hit = await redisCache.getCustom('facturacion', 'fiscal');
    if (hit) return hit;
    const cfg = await ConfiguracionSistema.obtenerConfiguracion();
    const fiscal = armarConfiguracionFiscal(cfg);
    await redisCache.setCustom('facturacion', 'fiscal', fiscal, FISCAL_TTL);
    return fiscal;
}

async function invalidarConfiguracionFiscal() {
    const redisCache = require('../../utils/redisCache');
    await redisCache.invalidateCustom('facturacion', 'fiscal');
}

module.exports = { obtenerConfiguracionFiscal, armarConfiguracionFiscal, invalidarConfiguracionFiscal };
