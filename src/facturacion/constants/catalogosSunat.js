/**
 * Catálogos SUNAT usados por el módulo de facturación electrónica (UBL 2.1).
 * Solo se incluyen los códigos que aplican a un restaurante.
 * @module facturacion/constants/catalogosSunat
 */

/** Catálogo 01 — Tipo de documento. */
const TIPO_DOCUMENTO = Object.freeze({
    FACTURA: '01',
    BOLETA: '03',
    NOTA_CREDITO: '07',
    NOTA_DEBITO: '08',
});

/** Catálogo 06 — Tipo de documento de identidad. */
const TIPO_DOC_IDENTIDAD = Object.freeze({
    SIN_DOCUMENTO: '0',
    DNI: '1',
    CARNET_EXTRANJERIA: '4',
    RUC: '6',
    PASAPORTE: '7',
});

/** Catálogo 07 — Tipo de afectación del IGV. */
const AFECTACION_IGV = Object.freeze({
    GRAVADO_ONEROSA: '10',
    GRAVADO_RETIRO_PREMIO: '11',
    GRAVADO_RETIRO_DONACION: '12',
    GRAVADO_RETIRO: '13',
    GRAVADO_RETIRO_PUBLICIDAD: '14',
    GRAVADO_BONIFICACIONES: '15',
    GRAVADO_RETIRO_TRABAJADORES: '16',
    EXONERADO_ONEROSA: '20',
    EXONERADO_GRATUITA: '21',
    INAFECTO_ONEROSA: '30',
    INAFECTO_RETIRO_BONIFICACION: '31',
});

/** Afectaciones gravadas a título gratuito (cortesías). */
const AFECTACIONES_GRATUITAS_GRAVADAS = Object.freeze(['11', '12', '13', '14', '15', '16']);
const AFECTACIONES_GRATUITAS = Object.freeze([...AFECTACIONES_GRATUITAS_GRAVADAS, '21', '31']);

/** Catálogo 05 — Códigos de tributo (TaxScheme). */
const TRIBUTO = Object.freeze({
    IGV: { codigo: '1000', nombre: 'IGV', codigoInternacional: 'VAT' },
    EXONERADO: { codigo: '9997', nombre: 'EXO', codigoInternacional: 'VAT' },
    INAFECTO: { codigo: '9998', nombre: 'INA', codigoInternacional: 'FRE' },
    GRATUITO: { codigo: '9996', nombre: 'GRA', codigoInternacional: 'FRE' },
});

/** Catálogo 16 — Tipo de precio unitario. */
const TIPO_PRECIO = Object.freeze({
    PRECIO_UNITARIO_CON_IGV: '01',
    VALOR_REFERENCIAL_GRATUITO: '02',
});

/** Catálogo 52 — Leyendas. */
const LEYENDA = Object.freeze({
    MONTO_EN_LETRAS: '1000',
    TRANSFERENCIA_GRATUITA: '1002',
});

const TEXTO_LEYENDA_1002 = 'TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE';

/** Catálogo 53 — Cargos y descuentos usados por el restaurante. */
const CARGO_DESCUENTO = Object.freeze({
    DESCUENTO_ITEM_AFECTA_BASE: '00',
    DESCUENTO_GLOBAL_AFECTA_BASE: '02',
    RECARGO_CONSUMO_PROPINA: '46',
});

/** Catálogo 59 — Medios de pago. Clave = medio interno del POS. */
const MEDIO_PAGO_SUNAT = Object.freeze({
    efectivo: '001',
    tarjeta_debito: '005',
    tarjeta_credito: '006',
    yape: '008',
    plin: '008',
    transferencia: '008',
});

/** Catálogo 09 — Motivos de Nota de Crédito. */
const MOTIVO_NOTA_CREDITO = Object.freeze({
    ANULACION_OPERACION: '01',
    ANULACION_ERROR_RUC: '02',
    CORRECCION_DESCRIPCION: '03',
    DESCUENTO_GLOBAL: '04',
    DESCUENTO_ITEM: '05',
    DEVOLUCION_TOTAL: '06',
    DEVOLUCION_ITEM: '07',
    BONIFICACION: '08',
    DISMINUCION_VALOR: '09',
    AJUSTE_MONTOS_FECHAS_PAGO: '13',
});

/** Forma de pago (cac:PaymentTerms). */
const FORMA_PAGO = Object.freeze({
    CONTADO: 'Contado',
    CREDITO: 'Credito',
});

/** Estados internos del ciclo de vida del comprobante. */
const ESTADO_COMPROBANTE = Object.freeze({
    EMITIDO_LOCAL: 'EMITIDO_LOCAL',
    FIRMADO: 'FIRMADO',
    PENDIENTE_ENVIO: 'PENDIENTE_ENVIO',
    ENVIADO: 'ENVIADO',
    ACEPTADO: 'ACEPTADO',
    ACEPTADO_OBS: 'ACEPTADO_OBS',
    RECHAZADO: 'RECHAZADO',
    ANULADO_NC: 'ANULADO_NC',
    BAJA_PENDIENTE: 'BAJA_PENDIENTE',
    DE_BAJA: 'DE_BAJA',
});

/** Regex de series por tipo de comprobante. */
const REGEX_SERIE = Object.freeze({
    '01': /^F(?!C\d{2}$)[A-Z0-9]{3}$/,
    '03': /^B(?!C\d{2}$)[A-Z0-9]{3}$/,
    '07': /^(FC|BC)[0-9]{2}$/,
});

const POR_NOMBRE = {
    '01': TIPO_DOCUMENTO,
    '06': TIPO_DOC_IDENTIDAD,
    '07': AFECTACION_IGV,
    '09': MOTIVO_NOTA_CREDITO,
    '59': MEDIO_PAGO_SUNAT,
};

/** Primera lectura guarda el catálogo 24 h. El seed vive en este archivo: al cambiarlo, el TTL vence solo. */
async function leerCatalogo(nombre) {
    const clave = String(nombre || '');
    const dato = POR_NOMBRE[clave];
    if (!dato) return null;
    const redisCache = require('../../utils/redisCache');
    const hit = await redisCache.getCustom('facturacion:catalogo', clave);
    if (hit) return hit;
    const plano = JSON.parse(JSON.stringify(dato));
    await redisCache.setCustom('facturacion:catalogo', clave, plano, 86400);
    return plano;
}

module.exports = {
    leerCatalogo,
    TIPO_DOCUMENTO,
    TIPO_DOC_IDENTIDAD,
    AFECTACION_IGV,
    AFECTACIONES_GRATUITAS,
    AFECTACIONES_GRATUITAS_GRAVADAS,
    TRIBUTO,
    TIPO_PRECIO,
    LEYENDA,
    TEXTO_LEYENDA_1002,
    CARGO_DESCUENTO,
    MEDIO_PAGO_SUNAT,
    MOTIVO_NOTA_CREDITO,
    FORMA_PAGO,
    ESTADO_COMPROBANTE,
    REGEX_SERIE,
};
