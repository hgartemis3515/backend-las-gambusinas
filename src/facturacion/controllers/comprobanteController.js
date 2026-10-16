/**
 * Endpoints de facturación electrónica (Fase 1).
 *   POST /api/facturacion/comprobantes      Emite boleta/factura
 *   GET  /api/facturacion/comprobantes/:id  Consulta un comprobante
 *   POST /api/facturacion/series            Crea (idempotente) una serie
 * @module facturacion/controllers/comprobanteController
 */

const express = require('express');
const mongoose = require('mongoose');
const { adminAuth } = require('../../middleware/adminAuth');
const Comprobante = require('../models/comprobante.model');
const { emitir } = require('../services/emisionService');
const { asegurarSerie } = require('../services/serieService');
const { obtenerConfiguracionFiscal } = require('../services/configuracionFiscal');
const { construirPreCuenta } = require('../services/precuentaService');
const { imprimir, destinoDesdeEnv } = require('../print/imprimir');
const { generarRvie } = require('../services/sireRvie');
const { auditarSeries } = require('../services/auditoriaGaps');
const { canjearBoletaPorFactura } = require('../services/canjeService');
const { registrarContingencia } = require('../services/contingenciaService');
const SerieComprobante = require('../models/serieComprobante.model');
const fs = require('fs');
const forge = require('node-forge');
const { autorizarSupervisor } = require('../services/autorizarSupervisor');
const Comanda = require('../../database/models/comanda.model');

const router = express.Router();

/** @param {import('express').Response} res @param {Error & {statusCode?: number, codigo?: string}} err */
function responderError(res, err) {
    const status = err.statusCode || (err.name === 'ValidationError' ? 422 : 500);
    res.status(status).json({ message: err.message, codigo: err.codigo || err.name });
}

router.post('/facturacion/comprobantes', adminAuth, async (req, res) => {
    try {
        const cajero = req.admin?.name || req.admin?.nombre || req.admin?.id || null;
        const resultado = await emitir({ ...req.body, cajero: cajero || req.body.cajero || null });
        res.status(201).json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/comprobantes/:id', adminAuth, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const doc = await Comprobante.findById(req.params.id).lean();
        if (!doc) return res.status(404).json({ message: 'Comprobante no encontrado' });
        res.json(doc);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/precuenta', adminAuth, async (req, res) => {
    try {
        const ticket = construirPreCuenta(req.body);
        const destino = req.body.destino || (process.env.FACTURACION_IMPRESORA ? destinoDesdeEnv() : null);
        const impresion = req.body.imprimir === true && destino ? await imprimir(ticket.buffer, destino) : null;
        res.json({ fiscal: false, titulo: ticket.titulo, texto: ticket.texto, impresion });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/comprobantes/:id/canjear', adminAuth, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'ID inválido' });
        const cajero = req.admin?.name || req.admin?.id || null;
        const resultado = await canjearBoletaPorFactura({ ...req.body, boletaId: req.params.id, cajero });
        res.status(201).json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/sire/rvie', adminAuth, async (req, res) => {
    try {
        const anio = Number(req.query.anio);
        const mes = Number(req.query.mes);
        if (!anio || mes < 1 || mes > 12) return res.status(400).json({ message: 'Indique anio y mes' });
        const cfg = await obtenerConfiguracionFiscal();
        const inicio = new Date(`${anio}-${String(mes).padStart(2, '0')}-01T00:00:00-05:00`);
        const finMes = mes === 12 ? 1 : mes + 1;
        const finAnio = mes === 12 ? anio + 1 : anio;
        const fin = new Date(`${finAnio}-${String(finMes).padStart(2, '0')}-01T00:00:00-05:00`);
        const docs = await Comprobante.find({ ruc: cfg.emisor.ruc, fechaEmision: { $gte: inicio, $lt: fin } }).lean();
        res.json(generarRvie(docs, { ruc: cfg.emisor.ruc, anio, mes }));
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/auditoria/correlativos', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        const series = await auditarSeries(Comprobante, { ruc: cfg.emisor.ruc });
        if (series.length > 0 && global.io) global.io.emit('comprobante:gap', { series });
        res.json({ series, alerta: series.length > 0 });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/contingencia', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        const doc = await registrarContingencia({
            ...req.body,
            ruc: req.body.ruc || cfg.emisor.ruc,
            registradoPor: req.admin?.name || null,
        });
        res.status(201).json(doc);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/contingencia/resumen', adminAuth, async (req, res) => {
    try {
        const { declararContingencia } = require('../services/contingenciaSunat');
        const cfg = await obtenerConfiguracionFiscal();
        const resultado = await declararContingencia({ ruc: req.body.ruc || cfg.emisor.ruc });
        res.status(202).json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/series', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        const serie = await asegurarSerie({ ...req.body, ruc: req.body.ruc || cfg.emisor.ruc });
        res.status(201).json(serie);
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/autorizar-supervisor', adminAuth, async (req, res) => {
    try {
        const resultado = await autorizarSupervisor({
            pin: req.body.pin,
            accion: req.body.accion,
            motivo: req.body.motivo,
            cajeroId: req.admin?.id || req.ip,
        });
        res.json(resultado);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/mesas/:id/consumo', adminAuth, async (req, res) => {
    try {
        const comandas = await Comanda.find({
            mesas: req.params.id,
            IsActive: true,
            status: { $nin: ['pagado', 'cancelado'] },
        }).populate('platos.plato', 'nombre precio').lean();
        const items = [];
        for (const comanda of comandas) {
            (comanda.platos || []).forEach((linea, i) => {
                if (linea.estado === 'pagado') return;
                const cantidad = Number(comanda.cantidades?.[i] || 1);
                const precio = Number(linea.plato?.precio || 0);
                items.push({
                    descripcion: linea.plato?.nombre || 'Plato',
                    cantidad,
                    precioUnitario: precio,
                    tipoAfectacionIgv: '10',
                });
            });
        }
        res.json({ mesaId: req.params.id, items });
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/series', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        const series = await SerieComprobante.find({ ruc: cfg.emisor.ruc }).sort({ serie: 1 }).lean();
        res.json(series);
    } catch (err) {
        responderError(res, err);
    }
});

function leerCertificado() {
    const ruta = process.env.CERT_PATH;
    if (!ruta || !fs.existsSync(ruta)) return { presente: false };
    const pem = fs.readFileSync(ruta, 'utf8');
    const bloque = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/);
    if (!bloque) return { presente: true, legible: false };
    const cert = forge.pki.certificateFromPem(bloque[0]);
    const vence = cert.validity.notAfter;
    return { presente: true, legible: true, vence, dias: Math.floor((vence.getTime() - Date.now()) / 86400000) };
}

router.get('/facturacion/configuracion', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        res.json({ ...cfg, ambiente: process.env.SUNAT_AMBIENTE || 'beta', certificado: leerCertificado() });
    } catch (err) {
        responderError(res, err);
    }
});

router.post('/facturacion/configuracion', adminAuth, async (req, res) => {
    try {
        await autorizarSupervisor({
            pin: req.body.pin,
            accion: 'configuracion',
            motivo: 'cambio de datos fiscales',
            cajeroId: req.admin?.id || req.ip,
        });
        const ConfiguracionSistema = require('../../database/models/configuracionSistema.model');
        const doc = await ConfiguracionSistema.obtenerConfiguracion();
        if (req.body.tasaIgv != null) doc.igvPorcentaje = Number(req.body.tasaIgv);
        if (req.body.limiteBoletaAnonima != null) process.env.FACTURACION_LIMITE_BOLETA_ANONIMA = String(req.body.limiteBoletaAnonima);
        if (req.body.emisor) {
            doc.datosFiscales = doc.datosFiscales || {};
            if (req.body.emisor.razonSocial) doc.datosFiscales.razonSocial = req.body.emisor.razonSocial;
            if (req.body.emisor.nombreComercial) doc.datosFiscales.nombreComercial = req.body.emisor.nombreComercial;
            if (req.body.emisor.direccion) doc.datosFiscales.direccionFiscal = req.body.emisor.direccion;
        }
        await doc.save();
        res.json(await obtenerConfiguracionFiscal());
    } catch (err) {
        responderError(res, err);
    }
});

module.exports = router;
