/**
 * Emisión síncrona de comprobantes en el POS.
 *
 * Flujo: validar cliente → calcular tributos → transacción Mongo
 * (reservar correlativo + firmar UBL en local + insertar EMITIDO_LOCAL)
 * → encolar el envío SOAP → imprimir el ticket con QR.
 *
 * @module facturacion/services/emisionService
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Comprobante = require('../models/comprobante.model');
const SerieComprobante = require('../models/serieComprobante.model');
const motorTributario = require('./motorTributario');
const { validarCliente, esRucValido } = require('./validacionCliente');
const { reservarCorrelativo } = require('./serieService');
const { obtenerConfiguracionFiscal } = require('./configuracionFiscal');
const { encolarFirmarEnviar } = require('../jobs/queues');
const { construir, nombreArchivo, partesLima } = require('./ublBuilder');
const { firmarXml, codigoQr } = require('./firmaService');
const { formatearTicket } = require('../print/escposFormatter');
const { imprimir, destinoDesdeEnv } = require('../print/imprimir');
const { autorizarSupervisor } = require('./autorizarSupervisor');
const { TIPO_DOCUMENTO, ESTADO_COMPROBANTE } = require('../constants/catalogosSunat');

class ErrorEmision extends Error {
    /** @param {string} mensaje @param {string} codigo @param {number} [statusCode=422] */
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorEmision';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/**
 * @typedef {Object} SolicitudEmision
 * @property {'01'|'03'} tipo
 * @property {string} [serie]                     Por defecto la configurada para el tipo
 * @property {import('./validacionCliente').ClienteEntrada} [cliente]
 * @property {import('./motorTributario').ItemEntrada[]} items
 * @property {{porcentaje?: number, monto?: number, motivo?: string}} [descuentoGlobal]
 * @property {import('./motorTributario').CargoEntrada[]} [cargos]
 * @property {import('./motorTributario').FormaPagoEntrada} [formaPago]
 * @property {{medio: string, monto: number, transaccion?: string}[]} [pagos]
 * @property {{pedido?: string, boucher?: string, comandas?: string[], mesa?: string, numMesa?: number, mozo?: string}} [origen]
 * @property {string} [cajero]
 * @property {string} [terminal]
 * @property {string} [sucursal]
 */

/**
 * @typedef {Object} DependenciasEmision
 * @property {import('mongoose').Model} [Modelo]
 * @property {import('mongoose').Model} [SerieModelo]
 * @property {() => Promise<import('mongoose').ClientSession>} [iniciarSesion]
 * @property {(doc: Object) => Promise<{encolado: boolean, jobId: string, motivo?: string}>} [encolar]
 * @property {() => Promise<import('./configuracionFiscal').ConfiguracionFiscal>} [obtenerConfig]
 * @property {() => Date} [ahora]
 */

/**
 * Emite un comprobante y lo deja listo para imprimir.
 * @param {SolicitudEmision} solicitud
 * @param {DependenciasEmision} [deps]
 * @returns {Promise<{comprobante: Object, cola: Object, duracionMs: number}>}
 */
async function emitir(solicitud, deps = {}) {
    const inicio = Date.now();
    const {
        Modelo = Comprobante,
        SerieModelo = SerieComprobante,
        iniciarSesion = () => mongoose.startSession(),
        encolar = encolarFirmarEnviar,
        obtenerConfig = obtenerConfiguracionFiscal,
        ahora = () => new Date(),
        autorizar = autorizarSupervisor,
    } = deps;

    const { tipo } = solicitud || {};
    if (![TIPO_DOCUMENTO.FACTURA, TIPO_DOCUMENTO.BOLETA].includes(tipo)) {
        throw new ErrorEmision('Solo se emiten Facturas (01) y Boletas (03) desde el POS', 'TIPO_INVALIDO');
    }

    const cfg = await obtenerConfig();
    if (!esRucValido(cfg.emisor.ruc) || !cfg.emisor.razonSocial) {
        throw new ErrorEmision('Configure RUC y razón social del emisor antes de facturar', 'EMISOR_NO_CONFIGURADO', 500);
    }

    const fechaEmision = ahora();
    const calculo = motorTributario.calcular({
        tipoComprobante: tipo,
        items: solicitud.items,
        descuentoGlobal: solicitud.descuentoGlobal,
        cargos: solicitud.cargos,
        formaPago: solicitud.formaPago,
        pagos: solicitud.pagos,
        config: {
            tasaIgv: cfg.tasaIgv,
            preciosIncluyenIGV: cfg.preciosIncluyenIGV,
            afectacionCortesia: cfg.afectacionCortesia,
            fechaEmision,
        },
    });

    const usuario = solicitud.cajero || 'sistema';
    if (descuentoExigePin(calculo, cfg.topeDescuentoPct ?? 10)) {
        await autorizar({
            pin: solicitud.pinSupervisor,
            accion: 'descuento',
            motivo: solicitud.descuentoGlobal?.motivo || 'descuento global',
            cajeroId: usuario,
        });
    }

    const receptor = validarCliente(tipo, solicitud.cliente, calculo.totales.importeTotal, cfg);
    const serie = (solicitud.serie || cfg.series[tipo] || '').toUpperCase();
    const fechaLimite = new Date(fechaEmision.getTime() + cfg.plazoEnvioDias * 24 * 3600 * 1000);

    const mediosPago = calculo.mediosPago.map((m, i) => ({
        ...m,
        transaccion: solicitud.pagos?.[i]?.transaccion || null,
    }));

    const session = await iniciarSesion();
    let doc;
    let qr = null;
    try {
        await session.withTransaction(async () => {
            const correlativo = await reservarCorrelativo(
                { ruc: cfg.emisor.ruc, tipo, serie, session },
                { Modelo: SerieModelo }
            );
            const borrador = {
                ruc: cfg.emisor.ruc,
                tipo,
                serie: correlativo.serie,
                numero: correlativo.numero,
                idCompleto: correlativo.idCompleto,
                sucursal: solicitud.sucursal || 'principal',
                terminal: solicitud.terminal || null,
                fechaEmision,
                tipoOperacion: '0101',
                moneda: 'PEN',
                porcentajeIgv: calculo.porcentajeIgv,
                preciosIncluyenIGV: calculo.preciosIncluyenIGV,
                emisor: cfg.emisor,
                receptor,
                items: calculo.items,
                descuentoGlobal: calculo.descuentoGlobal
                    ? { ...calculo.descuentoGlobal, motivo: solicitud.descuentoGlobal?.motivo || null }
                    : null,
                cargosGlobales: calculo.cargosGlobales,
                totales: calculo.totales,
                leyendas: calculo.leyendas,
                formaPago: calculo.formaPago,
                mediosPago,
                origen: solicitud.origen || {},
                cajero: solicitud.cajero || null,
                estado: ESTADO_COMPROBANTE.EMITIDO_LOCAL,
                envio: { fechaLimite },
                auditoria: [{ accion: 'EMITIDO_LOCAL', usuario, fecha: fechaEmision, detalle: { terminal: solicitud.terminal || null } }],
            };
            const firmar = deps.firmar || firmarLocal;
            const firma = await firmar(borrador);
            if (firma) {
                borrador.hash = firma.hash;
                borrador.xml = firma.xml;
                qr = firma.qr;
            }
            const [creado] = await Modelo.create([borrador], { session });
            doc = creado;
        });
    } catch (err) {
        if (err?.code === 11000) {
            throw new ErrorEmision('Correlativo duplicado detectado; reintente el cobro', 'CORRELATIVO_DUPLICADO', 409);
        }
        throw err;
    } finally {
        await session.endSession();
    }

    const cola = await encolar(doc);
    const actualizacion = cola.encolado
        ? { 'envio.jobId': cola.jobId }
        : { 'envio.ultimoError': `No encolado: ${cola.motivo}` };
    Modelo.updateOne({ _id: doc._id }, { $set: actualizacion }).catch(() => {});

    let impresion = null;
    const destino = solicitud.imprimir === false ? null : (() => {
        try { return destinoDesdeEnv(); } catch { return null; }
    })();
    if (qr && destino) {
        try {
            impresion = await imprimir(ticketFiscal(doc, qr), destino);
        } catch (err) {
            impresion = { ok: false, error: err.message };
        }
    }

    return {
        comprobante: doc.toObject ? doc.toObject() : doc,
        qr,
        impresion,
        cola,
        duracionMs: Date.now() - inicio,
    };
}

/**
 * El descuento con IGV, medido sobre el total antes del descuento, pasa el tope.
 * @param {{ descuentoGlobal?: { montoConIgv?: number }, totales?: { importeTotal?: number } }} calculo
 * @param {number} [topePct]
 */
function descuentoExigePin(calculo, topePct = 10) {
    const conIgv = Number(calculo?.descuentoGlobal?.montoConIgv || 0);
    if (conIgv <= 0) return false;
    const antes = Number(calculo?.totales?.importeTotal || 0) + conIgv;
    if (antes <= 0) return false;
    return (conIgv / antes) * 100 > Number(topePct) + 1e-6;
}

module.exports = { emitir, ErrorEmision, firmarLocal, descuentoExigePin };

/**
 * Firma en el proceso si hay CERT_PATH. Sin certificado (tests, mock) no bloquea el cobro.
 * @param {Object} doc
 * @returns {{ hash: string, xml: { nombre: string, ruta: string }, qr: string }|null}
 */
function firmarLocal(doc) {
    if (!process.env.CERT_PATH) return null;
    const firmado = firmarXml(construir(doc));
    const nombre = nombreArchivo(doc);
    const { fecha } = partesLima(doc.fechaEmision);
    const [anio, mes] = fecha.split('-');
    const dir = path.join(process.cwd(), 'uploads', 'cpe', doc.ruc, anio, mes);
    fs.mkdirSync(dir, { recursive: true });
    const ruta = path.join(dir, `${nombre}.xml`);
    fs.writeFileSync(ruta, firmado.xml);
    return { hash: firmado.hash, xml: { nombre, ruta }, qr: codigoQr(doc, firmado.hash) };
}

/** @param {Object} doc @param {string} qr */
function ticketFiscal(doc, qr) {
    const efectivo = (doc.mediosPago || []).filter((m) => m.medio === 'efectivo').reduce((s, m) => s + Number(m.monto), 0);
    return formatearTicket({
        titulo: doc.tipo === '01' ? 'FACTURA ELECTRONICA' : 'BOLETA DE VENTA ELECTRONICA',
        lineas: [doc.emisor.razonSocial, `RUC ${doc.ruc}`, doc.idCompleto, `TOTAL ${Number(doc.totales.importeTotal).toFixed(2)}`],
        qr,
        hash: doc.hash,
        montoEfectivo: efectivo,
    });
}
