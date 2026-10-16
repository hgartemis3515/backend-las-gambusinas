/**
 * Turnos, notas de crédito, bajas, reimpresión y consulta pública.
 * @module facturacion/controllers/operacionController
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const { adminAuth } = require('../../middleware/adminAuth');
const Comprobante = require('../models/comprobante.model');
const TransaccionPago = require('../models/transaccionPago.model');
const TurnoCaja = require('../models/turnoCaja.model');
const { totalesDesdeMovimientos, efectivoEnGaveta, cuadrarCierre } = require('../services/turnoCajaService');
const { emitirNotaCredito } = require('../services/notaCreditoService');
const { comunicarBaja } = require('../services/bajaService');
const { autorizarSupervisor } = require('../services/autorizarSupervisor');
const { coincideConsulta, firmarDescarga, leerDescarga } = require('../services/portalCpe');
const { compilar } = require('../print/escpos');
const { imprimir, destinoDesdeEnv } = require('../print/imprimir');
const { encolarNotificacion } = require('../jobs/notificacion.worker');

const router = express.Router();
const secretoCpe = () => process.env.FACTURACION_CPE_SECRETO || process.env.JWT_SECRET || 'cpe-dev';

function responderError(res, err) {
    const status = err.statusCode || 500;
    res.status(status).json({ message: err.message, codigo: err.codigo || err.name });
}

async function movimientosDelTurno(turno) {
    const filtro = { recibidoEn: { $gte: turno.fechaApertura }, cajero: turno.cajero };
    const pagos = await TransaccionPago.find(filtro).lean();
    const comprobantes = await Comprobante.find({
        fechaEmision: { $gte: turno.fechaApertura },
        cajero: turno.cajero,
    }).lean();
    return totalesDesdeMovimientos(pagos, comprobantes);
}

router.post('/facturacion/turnos/abrir', adminAuth, async (req, res) => {
    try {
        const cajero = req.admin?.name || req.admin?.id || 'caja';
        const terminal = req.body.terminal || 'CAJA1';
        const abierto = await TurnoCaja.findOne({ estado: 'ABIERTO', $or: [{ cajero }, { terminal }] });
        if (abierto) return res.status(409).json({ message: 'Ya hay un turno abierto en esta caja', codigo: 'TURNO_ABIERTO' });
        const turno = await TurnoCaja.create({
            cajero,
            cajeroId: mongoose.isValidObjectId(req.admin?.id) ? req.admin.id : null,
            terminal,
            fondoInicial: Number(req.body.fondoInicial || 0),
        });
        res.status(201).json(turno);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/turnos/activo', adminAuth, async (req, res) => {
    try {
        const cajero = req.admin?.name || req.admin?.id || 'caja';
        const terminal = 'CAJA1';
        const turno = await TurnoCaja.findOne({ estado: 'ABIERTO', $or: [{ cajero }, { terminal }] }).sort({ fechaApertura: -1 }).lean();
        if (!turno) return res.json(null);
        const vivos = await movimientosDelTurno(turno);
        const gaveta = efectivoEnGaveta({
            fondoInicial: turno.fondoInicial,
            ventasEfectivo: vivos.totalEfectivoEsperado,
            movimientos: turno.movimientosCaja,
        });
        res.json({ ...turno, ...vivos, ...gaveta });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/turnos/movimiento', adminAuth, async (req, res) => {
    try {
        const cajero = req.admin?.name || req.admin?.id || 'caja';
        const turno = await TurnoCaja.findOne({ estado: 'ABIERTO', $or: [{ cajero }, { terminal: 'CAJA1' }] });
        if (!turno) return res.status(404).json({ message: 'No hay turno abierto' });
        const tipo = req.body.tipo;
        const monto = Number(req.body.monto);
        const motivo = String(req.body.motivo || '').trim();
        if (!['INGRESO', 'EGRESO'].includes(tipo)) return res.status(422).json({ message: 'El tipo es INGRESO o EGRESO', codigo: 'TIPO_MOVIMIENTO' });
        if (!(monto > 0)) return res.status(422).json({ message: 'El monto debe ser mayor a 0', codigo: 'MONTO' });
        if (!motivo) return res.status(422).json({ message: 'Indique el motivo', codigo: 'MOTIVO' });
        turno.movimientosCaja.push({
            tipo,
            monto,
            motivo,
            medio: 'efectivo',
            proveedorDoc: String(req.body.proveedorDoc || '').trim(),
            registradoPor: cajero,
            fecha: new Date(),
        });
        await turno.save();
        const vivos = await movimientosDelTurno(turno);
        const gaveta = efectivoEnGaveta({
            fondoInicial: turno.fondoInicial,
            ventasEfectivo: vivos.totalEfectivoEsperado,
            movimientos: turno.movimientosCaja,
        });
        res.status(201).json({ ...turno.toObject(), ...vivos, ...gaveta });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/turnos/cerrar', adminAuth, async (req, res) => {
    try {
        const cajero = req.admin?.name || req.admin?.id || 'caja';
        const turno = await TurnoCaja.findOne({ estado: 'ABIERTO', cajero });
        if (!turno) return res.status(404).json({ message: 'No hay turno abierto' });
        const vivos = await movimientosDelTurno(turno);
        const gaveta = efectivoEnGaveta({
            fondoInicial: turno.fondoInicial,
            ventasEfectivo: vivos.totalEfectivoEsperado,
            movimientos: turno.movimientosCaja,
        });
        const declarado = {
            efectivo: Number(req.body.efectivoReal || 0),
            niubiz: Number(req.body.loteNiubiz?.montoVoucher || 0),
            izipay: Number(req.body.loteIzipay?.montoVoucher || 0),
        };
        const cuadre = cuadrarCierre({
            efectivo: gaveta.efectivoEnGaveta,
            niubiz: vivos.totalNiubizEsperado,
            izipay: vivos.totalIzipayEsperado,
        }, declarado);
        if (cuadre.requierePin) {
            if (!req.body.justificacionDiferencia) return res.status(422).json({ message: 'La diferencia exige un motivo', codigo: 'MOTIVO_REQUERIDO' });
            const pin = await autorizarSupervisor({ pin: req.body.pinSupervisor, accion: 'cierre-turno', motivo: req.body.justificacionDiferencia, cajeroId: cajero });
            turno.autorizadoPor = pin.supervisorId;
        }
        Object.assign(turno, vivos, {
            estado: 'CERRADO',
            fechaCierre: new Date(),
            efectivoReal: declarado.efectivo,
            loteNiubiz: req.body.loteNiubiz || {},
            loteIzipay: req.body.loteIzipay || {},
            diferencias: cuadre.diferencias,
            justificacionDiferencia: req.body.justificacionDiferencia || '',
        });
        await turno.save();
        if (global.io) global.io.emit('turno:cerrado', { id: String(turno._id), terminal: turno.terminal, diferencias: cuadre.diferencias });
        const lineas = [
            'CIERRE DE TURNO',
            turno.terminal,
            `Efectivo en gaveta ${gaveta.efectivoEnGaveta.toFixed(2)}`,
            `Ingresos caja ${gaveta.totalIngresosCaja.toFixed(2)}`,
            `Egresos caja ${gaveta.totalEgresosCaja.toFixed(2)}`,
            `Efectivo contado ${declarado.efectivo.toFixed(2)}`,
            `Propinas ${vivos.totalPropinas.toFixed(2)}`,
            `Dif. efectivo ${cuadre.diferencias.efectivo.toFixed(2)}`,
        ];
        let impresion = null;
        try {
            const destino = destinoDesdeEnv();
            if (destino) impresion = await imprimir(compilar(lineas), destino);
        } catch (err) {
            impresion = { ok: false, error: err.message };
        }
        res.json({ turno, cuadre, impresion });
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/comprobantes', adminAuth, async (req, res) => {
    try {
        const filtro = {};
        if (req.query.tipo) filtro.tipo = req.query.tipo;
        if (req.query.estado) filtro.estado = req.query.estado;
        if (req.query.desde || req.query.hasta) {
            filtro.fechaEmision = {};
            if (req.query.desde) filtro.fechaEmision.$gte = new Date(req.query.desde);
            if (req.query.hasta) filtro.fechaEmision.$lt = new Date(req.query.hasta);
        }
        const docs = await Comprobante.find(filtro).sort({ fechaEmision: -1 }).limit(200).lean();
        res.json(docs);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/notas-credito', adminAuth, async (req, res) => {
    try {
        await autorizarSupervisor({
            pin: req.body.pinSupervisor,
            accion: 'nota-credito',
            motivo: req.body.sustento,
            cajeroId: req.admin?.id || req.admin?.name,
        });
        const resultado = await emitirNotaCredito({
            comprobanteOrigenId: req.body.comprobanteOrigenId,
            motivoCodigo: req.body.motivoCodigo,
            sustento: req.body.sustento,
            cajero: req.admin?.name || null,
        });
        res.status(201).json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/bajas', adminAuth, async (req, res) => {
    try {
        await autorizarSupervisor({
            pin: req.body.pinSupervisor,
            accion: 'baja',
            motivo: req.body.motivo,
            cajeroId: req.admin?.id || req.admin?.name,
        });
        const resultado = await comunicarBaja({
            comprobanteId: req.body.comprobanteId,
            motivo: req.body.motivo,
        }, { Modelo: Comprobante });
        res.status(202).json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/comprobantes/:id/reimprimir', adminAuth, async (req, res) => {
    try {
        const doc = await Comprobante.findById(req.params.id);
        if (!doc) return res.status(404).json({ message: 'Comprobante no encontrado' });
        if (doc.estado === 'RECHAZADO') return res.status(422).json({ message: 'Un rechazado no se reimprime como válido', codigo: 'RECHAZADO' });
        if (doc.numeroImpresiones >= 2) {
            await autorizarSupervisor({
                pin: req.body.pinSupervisor,
                accion: 'reimpresion',
                motivo: doc.idCompleto,
                cajeroId: req.admin?.id || req.admin?.name,
            });
        }
        const copia = doc.numeroImpresiones >= 1;
        doc.numeroImpresiones += 1;
        doc.auditoria.push({ accion: 'REIMPRESION', usuario: req.admin?.name || 'caja', fecha: new Date(), detalle: { n: doc.numeroImpresiones } });
        await doc.save();
        const leyenda = copia ? `*** COPIA / REIMPRESION #${String(doc.numeroImpresiones).padStart(2, '0')} ***` : null;
        res.json({ idCompleto: doc.idCompleto, numeroImpresiones: doc.numeroImpresiones, leyenda, hash: doc.hash });
    } catch (err) {
        responderError(res, err);
    }
});

const limitarCpe = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.post('/public/cpe/consultar', limitarCpe, async (req, res) => {
    try {
        const { rucEmisor, tipo, serie, numero, fechaEmision, montoTotal } = req.body || {};
        const doc = await Comprobante.findOne({
            ruc: rucEmisor,
            tipo,
            serie: String(serie || '').toUpperCase(),
            numero: String(numero || '').padStart(8, '0'),
        }).lean();
        if (!doc || !coincideConsulta(doc, { rucEmisor, tipo, serie, numero, fechaEmision, montoTotal })) {
            return res.status(404).json({ message: 'No hay un comprobante con esos datos' });
        }
        const token = firmarDescarga({ id: String(doc._id), tipo: doc.tipo }, secretoCpe());
        res.json({
            idCompleto: doc.idCompleto,
            estado: doc.estado,
            cdr: doc.cdr,
            hash: doc.hash,
            descargas: {
                xml: `/api/public/cpe/descarga/${token}/xml`,
                pdf: `/api/public/cpe/descarga/${token}/pdf`,
                cdr: `/api/public/cpe/descarga/${token}/cdr`,
            },
        });
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/public/cpe/descarga/:token/:archivo', async (req, res) => {
    try {
        const datos = leerDescarga(req.params.token, secretoCpe());
        if (!['xml', 'pdf', 'cdr'].includes(req.params.archivo)) return res.status(404).json({ message: 'Archivo no disponible' });
        const doc = await Comprobante.findById(datos.id).lean();
        if (!doc) return res.status(404).json({ message: 'Comprobante no encontrado' });
        if (req.params.archivo === 'xml' && doc.xml?.ruta) return res.download(doc.xml.ruta);
        if (req.params.archivo === 'pdf') {
            const { generarPdfA4 } = require('../print/pdfA4');
            const pdf = await generarPdfA4(doc);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${doc.idCompleto}.pdf"`);
            return res.send(pdf);
        }
        res.json({ idCompleto: doc.idCompleto, archivo: req.params.archivo, hash: doc.hash, cdr: doc.cdr });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/comprobantes/:id/notificar', adminAuth, async (req, res) => {
    try {
        const doc = await Comprobante.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ message: 'Comprobante no encontrado' });
        const job = await encolarNotificacion({ comprobanteId: String(doc._id), email: req.body.email, telefono: req.body.telefono });
        res.status(202).json(job);
    } catch (err) {
        responderError(res, err);
    }
});

module.exports = router;
