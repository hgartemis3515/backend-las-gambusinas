/**
 * Canje de boleta por factura.
 * No borra la boleta: emite NC motivo 01 y, en la misma transacción, la factura
 * con los mismos ítems. El pago se reasigna a la factura; no se crea otro cobro.
 * @module facturacion/services/canje
 */

const mongoose = require('mongoose');
const Comprobante = require('../models/comprobante.model');
const TransaccionPago = require('../models/transaccionPago.model');
const { reservarCorrelativo } = require('./serieService');
const { validarCliente } = require('./validacionCliente');
const { obtenerConfiguracionFiscal } = require('./configuracionFiscal');
const { encolarFirmarEnviar } = require('../jobs/queues');
const { ESTADO_COMPROBANTE, MOTIVO_NOTA_CREDITO } = require('../constants/catalogosSunat');

class ErrorCanje extends Error {
    /** @param {string} mensaje @param {string} codigo @param {number} [statusCode=422] */
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorCanje';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/**
 * @param {Object} boleta
 * @param {Object} extra
 */
function clonar(boleta, extra) {
    return {
        ruc: boleta.ruc,
        porcentajeIgv: boleta.porcentajeIgv,
        preciosIncluyenIGV: boleta.preciosIncluyenIGV,
        emisor: boleta.emisor,
        items: boleta.items,
        descuentoGlobal: boleta.descuentoGlobal || null,
        cargosGlobales: boleta.cargosGlobales || [],
        totales: boleta.totales,
        leyendas: (boleta.leyendas || []).filter((l) => l.codigo === '1000'),
        formaPago: { tipo: 'Contado', montoPendiente: 0, cuotas: [] },
        mediosPago: boleta.mediosPago || [],
        sucursal: boleta.sucursal,
        terminal: boleta.terminal,
        origen: boleta.origen || {},
        moneda: boleta.moneda || 'PEN',
        fechaEmision: extra.fechaEmision,
        cajero: extra.cajero,
        estado: ESTADO_COMPROBANTE.EMITIDO_LOCAL,
        envio: { fechaLimite: extra.fechaLimite },
        auditoria: [{ accion: extra.accion, usuario: extra.cajero || 'sistema', fecha: extra.fechaEmision, detalle: { boleta: boleta.idCompleto } }],
        ...extra.identidad,
    };
}

/**
 * @param {{ boletaId: string, cliente: Object, cajero?: string, serieNc?: string, serieFactura?: string }} solicitud
 * @param {Object} [deps]
 */
async function canjearBoletaPorFactura(solicitud, deps = {}) {
    const {
        Modelo = Comprobante,
        Pagos = TransaccionPago,
        iniciarSesion = () => mongoose.startSession(),
        reservar = reservarCorrelativo,
        encolar = encolarFirmarEnviar,
        obtenerConfig = obtenerConfiguracionFiscal,
        ahora = () => new Date(),
    } = deps;

    const boleta = await Modelo.findById(solicitud.boletaId);
    if (!boleta) throw new ErrorCanje('Boleta no encontrada', 'NO_ENCONTRADA', 404);
    if (boleta.tipo !== '03') throw new ErrorCanje('Solo se canjea una boleta', 'NO_ES_BOLETA');
    if (boleta.canje?.factura) throw new ErrorCanje('Esta boleta ya fue canjeada', 'YA_CANJEADA', 409);
    if (boleta.estado === ESTADO_COMPROBANTE.RECHAZADO) throw new ErrorCanje('Una boleta rechazada no se canjea', 'RECHAZADA');

    const cfg = await obtenerConfig();
    const receptorFactura = validarCliente('01', solicitud.cliente, boleta.totales.importeTotal);
    const fecha = ahora();
    const fechaLimite = new Date(fecha.getTime() + (cfg.plazoEnvioDias || 3) * 86400000);
    const serieNc = (solicitud.serieNc || 'BC01').toUpperCase();
    const serieFactura = (solicitud.serieFactura || cfg.series?.['01'] || 'F001').toUpperCase();
    const cajero = solicitud.cajero || 'sistema';
    const base = { fechaEmision: fecha, fechaLimite, cajero };

    const session = await iniciarSesion();
    let nc;
    let factura;
    try {
        await session.withTransaction(async () => {
            const corrNc = await reservar({ ruc: boleta.ruc, tipo: '07', serie: serieNc, session });
            const corrFa = await reservar({ ruc: boleta.ruc, tipo: '01', serie: serieFactura, session });
            const docNc = clonar(boleta, {
                ...base,
                accion: 'CANJE_NC',
                identidad: {
                    tipo: '07',
                    serie: corrNc.serie,
                    numero: corrNc.numero,
                    idCompleto: corrNc.idCompleto,
                    receptor: boleta.receptor,
                    referencia: {
                        tipo: '03',
                        serie: boleta.serie,
                        numero: boleta.numero,
                        fechaEmision: boleta.fechaEmision,
                        motivoCodigo: MOTIVO_NOTA_CREDITO.ANULACION_OPERACION,
                        motivoTexto: 'Anulación de la operación',
                        comprobante: boleta._id,
                    },
                    canje: { boleta: boleta._id, fecha },
                },
            });
            [nc] = await Modelo.create([docNc], { session });
            const docFa = clonar(boleta, {
                ...base,
                accion: 'CANJE_FACTURA',
                identidad: {
                    tipo: '01',
                    serie: corrFa.serie,
                    numero: corrFa.numero,
                    idCompleto: corrFa.idCompleto,
                    receptor: receptorFactura,
                    observacion: `Sustituye a la boleta ${boleta.idCompleto} anulada con ${nc.idCompleto}`,
                    canje: { boleta: boleta._id, nc: nc._id, fecha },
                },
            });
            [factura] = await Modelo.create([docFa], { session });
            await Modelo.updateOne({ _id: boleta._id }, {
                $set: {
                    estado: ESTADO_COMPROBANTE.ANULADO_NC,
                    canje: { nc: nc._id, factura: factura._id, fecha },
                },
            }, { session });
        });
    } finally {
        await session.endSession();
    }

    await Pagos.updateMany({ comprobante: boleta._id }, { $set: { comprobante: factura._id } });
    const colaNc = await encolar(nc);
    const colaFactura = await encolar(factura);
    return { boleta: boleta.idCompleto, nc, factura, colaNc, colaFactura };
}

module.exports = { canjearBoletaPorFactura, ErrorCanje };
