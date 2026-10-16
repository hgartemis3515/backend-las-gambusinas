/**
 * Nota de crédito suelta. Motivo 01 anula el origen. Otros motivos lo referencian sin borrarlo.
 * @module facturacion/services/notaCredito
 */

const mongoose = require('mongoose');
const Comprobante = require('../models/comprobante.model');
const { reservarCorrelativo } = require('./serieService');
const { firmarLocal } = require('./emisionService');
const { encolarFirmarEnviar } = require('../jobs/queues');
const { ESTADO_COMPROBANTE, MOTIVO_NOTA_CREDITO } = require('../constants/catalogosSunat');

const MOTIVOS = new Set(Object.values(MOTIVO_NOTA_CREDITO));
const ANULAN_ORIGEN = new Set(['01', '06']);

class ErrorNota extends Error {
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorNota';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/** @param {'01'|'03'} tipoOrigen */
function serieDeNota(tipoOrigen) {
    if (tipoOrigen === '01') return 'FC01';
    if (tipoOrigen === '03') return 'BC01';
    throw new ErrorNota('La nota de crédito solo referencia factura o boleta', 'ORIGEN_INVALIDO');
}

/** @param {string} codigo */
function validarMotivo(codigo) {
    if (!MOTIVOS.has(codigo)) throw new ErrorNota(`Motivo ${codigo} no está en el catálogo 09`, 'MOTIVO_INVALIDO');
    return codigo;
}

/**
 * @param {{ comprobanteOrigenId: string, motivoCodigo: string, sustento: string, cajero?: string }} solicitud
 * @param {Object} [deps]
 */
async function emitirNotaCredito(solicitud, deps = {}) {
    const motivoCodigo = validarMotivo(solicitud.motivoCodigo);
    if (!solicitud.sustento) throw new ErrorNota('El sustento es obligatorio', 'SUSTENTO_REQUERIDO');
    const Modelo = deps.Modelo || Comprobante;
    const reservar = deps.reservar || reservarCorrelativo;
    const firmar = deps.firmar || firmarLocal;
    const encolar = deps.encolar || encolarFirmarEnviar;
    const iniciarSesion = deps.iniciarSesion || (() => mongoose.startSession());
    const origen = await Modelo.findById(solicitud.comprobanteOrigenId);
    if (!origen) throw new ErrorNota('Comprobante origen no encontrado', 'NO_ENCONTRADO', 404);
    if (origen.estado === ESTADO_COMPROBANTE.ANULADO_NC) throw new ErrorNota('El comprobante ya está anulado', 'YA_ANULADO', 409);
    const serie = serieDeNota(origen.tipo);
    const fecha = deps.ahora ? deps.ahora() : new Date();
    const session = await iniciarSesion();
    let nc;
    try {
        await session.withTransaction(async () => {
            const corr = await reservar({ ruc: origen.ruc, tipo: '07', serie, session });
            const borrador = {
                ruc: origen.ruc,
                tipo: '07',
                serie: corr.serie,
                numero: corr.numero,
                idCompleto: corr.idCompleto,
                fechaEmision: fecha,
                porcentajeIgv: origen.porcentajeIgv,
                preciosIncluyenIGV: origen.preciosIncluyenIGV,
                emisor: origen.emisor,
                receptor: origen.receptor,
                items: origen.items,
                totales: origen.totales,
                leyendas: origen.leyendas || [],
                formaPago: { tipo: 'Contado', montoPendiente: 0, cuotas: [] },
                mediosPago: [],
                moneda: origen.moneda || 'PEN',
                sucursal: origen.sucursal,
                terminal: origen.terminal,
                cajero: solicitud.cajero || 'sistema',
                estado: ESTADO_COMPROBANTE.EMITIDO_LOCAL,
                envio: { fechaLimite: new Date(fecha.getTime() + 3 * 86400000) },
                referencia: {
                    tipo: origen.tipo,
                    serie: origen.serie,
                    numero: origen.numero,
                    fechaEmision: origen.fechaEmision,
                    motivoCodigo,
                    motivoTexto: solicitud.sustento,
                    comprobante: origen._id,
                },
                auditoria: [{ accion: 'NOTA_CREDITO', usuario: solicitud.cajero || 'sistema', fecha, detalle: { motivoCodigo } }],
            };
            const firma = await firmar(borrador);
            if (firma) {
                borrador.hash = firma.hash;
                borrador.xml = firma.xml;
            }
            const [creado] = await Modelo.create([borrador], { session });
            nc = creado;
            if (ANULAN_ORIGEN.has(motivoCodigo)) {
                await Modelo.updateOne({ _id: origen._id }, {
                    $set: { estado: ESTADO_COMPROBANTE.ANULADO_NC },
                }, { session });
            }
        });
    } finally {
        await session.endSession();
    }
    const cola = await encolar(nc);
    return { nc, cola, envio: origen.tipo === '01' ? 'sendBill' : 'resumen' };
}

module.exports = { emitirNotaCredito, serieDeNota, validarMotivo, ErrorNota, ANULAN_ORIGEN };
