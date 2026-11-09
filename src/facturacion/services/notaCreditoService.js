/**
 * Nota de crédito. 01, 02 y 06 copian el documento. 04, 05, 07 y 09 recalculan el tramo.
 * El motivo 13 queda cerrado: el restaurante no ajusta cuotas.
 * @module facturacion/services/notaCredito
 */

const Comprobante = require('../models/comprobante.model');
const { reservarCorrelativo } = require('./serieService');
const { ejecutarEnTransaccion } = require('./transaccionMongo');
const { firmarLocal } = require('./emisionService');
const { encolarFirmarEnviar } = require('../jobs/queues');
const { calcular } = require('./motorTributario');
const { ESTADO_COMPROBANTE, MOTIVO_NOTA_CREDITO } = require('../constants/catalogosSunat');

const MOTIVOS = new Set(Object.values(MOTIVO_NOTA_CREDITO));
const COMPLETOS = new Set(['01', '02', '06']);
const PARCIALES = new Set(['04', '05', '07', '09']);
const ANULAN_ORIGEN = new Set(['01', '06']);
const BLOQUEADOS = new Set([
    ESTADO_COMPROBANTE.RECHAZADO,
    ESTADO_COMPROBANTE.ANULADO_NC,
    ESTADO_COMPROBANTE.DE_BAJA,
    ESTADO_COMPROBANTE.BAJA_PENDIENTE,
]);

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
    if (codigo === '13') throw new ErrorNota('El motivo 13 no está habilitado', 'MOTIVO_NO_HABILITADO');
    return codigo;
}

/** @param {Object} origen @param {string} motivo @param {Object} solicitud */
function cuerpoNota(origen, motivo, solicitud) {
    if (COMPLETOS.has(motivo)) {
        return { items: origen.items, totales: origen.totales, leyendas: origen.leyendas || [], descuentoGlobal: origen.descuentoGlobal || null };
    }
    if (!PARCIALES.has(motivo)) throw new ErrorNota(`Motivo ${motivo} no está habilitado`, 'MOTIVO_NO_HABILITADO');
    let itemsEntrada;
    if (motivo === '07' || motivo === '05') {
        const lineas = solicitud.lineas || [];
        if (!lineas.length) throw new ErrorNota('Indique las líneas que modifica la nota', 'ITEMS_REQUERIDOS');
        itemsEntrada = lineas.map((linea) => {
            const src = (origen.items || []).find((item) => item.orden === Number(linea.orden));
            if (!src) throw new ErrorNota(`La línea ${linea.orden} no está en el comprobante`, 'LINEA_NO_EXISTE');
            const cantidad = Number(linea.cantidad);
            if (!(cantidad > 0) || cantidad > Number(src.cantidad)) {
                throw new ErrorNota(`Cantidad inválida en la línea ${linea.orden}`, 'CANTIDAD_EXCEDE');
            }
            return {
                codigo: src.codigo,
                descripcion: src.descripcion,
                unidad: src.unidad,
                cantidad,
                precioUnitario: src.gratuita ? src.valorReferencialUnitario : src.precioUnitario,
                tipoAfectacionIgv: src.tipoAfectacionIgv,
                cortesia: Boolean(src.gratuita),
            };
        });
    } else {
        const monto = Number(solicitud.monto);
        if (!(monto > 0) || monto >= Number(origen.totales.importeTotal)) {
            throw new ErrorNota('El monto de la nota debe ser mayor que 0 y menor que el original', 'MONTO_NOTA');
        }
        itemsEntrada = [{ descripcion: motivo === '04' ? 'Descuento global' : 'Disminución de valor', cantidad: 1, precioUnitario: monto, unidad: 'NIU' }];
    }
    const calc = calcular({
        tipoComprobante: '07',
        items: itemsEntrada,
        config: { tasaIgv: origen.porcentajeIgv, preciosIncluyenIGV: origen.preciosIncluyenIGV !== false },
    });
    if (calc.totales.importeTotal > Number(origen.totales.importeTotal) + 0.001) {
        throw new ErrorNota('La nota no puede superar el importe del comprobante', 'MONTO_NOTA');
    }
    return { items: calc.items, totales: calc.totales, leyendas: calc.leyendas, descuentoGlobal: null };
}

/**
 * @param {{ comprobanteOrigenId: string, motivoCodigo: string, sustento: string, cajero?: string, lineas?: Object[], monto?: number }} solicitud
 * @param {Object} [deps]
 */
async function emitirNotaCredito(solicitud, deps = {}) {
    const motivoCodigo = validarMotivo(solicitud.motivoCodigo);
    if (!solicitud.sustento || String(solicitud.sustento).trim().length < 3) {
        throw new ErrorNota('El sustento es obligatorio', 'SUSTENTO_REQUERIDO');
    }
    const Modelo = deps.Modelo || Comprobante;
    const reservar = deps.reservar || reservarCorrelativo;
    const firmar = deps.firmar || firmarLocal;
    const encolar = deps.encolar || encolarFirmarEnviar;
    const iniciarSesion = deps.iniciarSesion;
    const origen = await Modelo.findById(solicitud.comprobanteOrigenId);
    if (!origen) throw new ErrorNota('Comprobante origen no encontrado', 'NO_ENCONTRADO', 404);
    if (BLOQUEADOS.has(origen.estado)) throw new ErrorNota('El comprobante no admite una nota de crédito', 'ORIGEN_NO_ADMISIBLE', 409);
    const serie = serieDeNota(origen.tipo);
    const fecha = deps.ahora ? deps.ahora() : new Date();
    const cuerpo = cuerpoNota(origen, motivoCodigo, solicitud);
    const aceptado = origen.estado === ESTADO_COMPROBANTE.ACEPTADO || origen.estado === ESTADO_COMPROBANTE.ACEPTADO_OBS;
    let nc;
    await ejecutarEnTransaccion(async (session) => {
        const corr = await reservar({ ruc: origen.ruc, tipo: '07', serie, session, sinTransaccion: !session });
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
            items: cuerpo.items,
            totales: cuerpo.totales,
            leyendas: cuerpo.leyendas,
            descuentoGlobal: cuerpo.descuentoGlobal,
            formaPago: { tipo: 'Contado', montoPendiente: 0, cuotas: [] },
            mediosPago: [],
            moneda: origen.moneda || 'PEN',
            sucursal: origen.sucursal,
            terminal: origen.terminal,
            cajero: solicitud.cajero || 'sistema',
            estado: ESTADO_COMPROBANTE.EMITIDO_LOCAL,
            envio: { fechaLimite: new Date(fecha.getTime() + 3 * 86400000), dependeDe: origen._id },
            referencia: {
                tipo: origen.tipo,
                serie: origen.serie,
                numero: origen.numero,
                fechaEmision: origen.fechaEmision,
                motivoCodigo,
                motivoTexto: String(solicitud.sustento).trim(),
                comprobante: origen._id,
            },
            auditoria: [{ accion: 'NOTA_CREDITO', usuario: solicitud.cajero || 'sistema', fecha, detalle: { motivoCodigo } }],
        };
        const firma = await firmar(borrador);
        if (firma) {
            borrador.hash = firma.hash;
            borrador.xml = firma.xml;
        }
        const opts = session ? { session } : {};
        const [creado] = await Modelo.create([borrador], opts);
        nc = creado;
        if (ANULAN_ORIGEN.has(motivoCodigo)) {
            await Modelo.updateOne({ _id: origen._id }, {
                $set: aceptado
                    ? { estado: ESTADO_COMPROBANTE.ANULADO_NC, anulacion: { nc: nc._id, estado: 'APLICADA' } }
                    : { anulacion: { nc: nc._id, estado: 'PENDIENTE' } },
            }, opts);
        }
    }, { iniciarSesion });
    if (!aceptado) await encolar(origen);
    const cola = await encolar(nc);
    return { nc, cola, envio: origen.tipo === '01' ? 'sendBill' : 'resumen' };
}

module.exports = { emitirNotaCredito, serieDeNota, validarMotivo, cuerpoNota, ErrorNota, ANULAN_ORIGEN };
