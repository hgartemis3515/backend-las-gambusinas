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
const motorTributario = require('../services/motorTributario');
const { consultarPadron } = require('../services/padronService');
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
const { esRucValido } = require('../services/validacionCliente');
const Comanda = require('../../database/models/comanda.model');

const router = express.Router();

/** @param {import('express').Response} res @param {Error & {statusCode?: number, codigo?: string}} err */
function responderError(res, err) {
    const status = err.statusCode || (err.name === 'ValidationError' ? 422 : 500);
    res.status(status).json({ message: err.message, codigo: err.codigo || err.name });
}

router.post('/facturacion/cotizar', adminAuth, async (req, res) => {
    try {
        const cfg = await obtenerConfiguracionFiscal();
        const calculo = motorTributario.calcular({
            tipoComprobante: req.body.tipo,
            items: req.body.items,
            descuentoGlobal: req.body.descuentoGlobal,
            config: { tasaIgv: cfg.tasaIgv, preciosIncluyenIGV: cfg.preciosIncluyenIGV, afectacionCortesia: cfg.afectacionCortesia },
        });
        res.json({
            porcentajeIgv: calculo.porcentajeIgv,
            totales: calculo.totales,
            descuentoGlobal: calculo.descuentoGlobal,
            topeDescuentoPct: cfg.topeDescuentoPct,
            limiteBoletaAnonima: cfg.limiteBoletaAnonima,
        });
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/padron/:tipo/:numero', adminAuth, async (req, res) => {
    try {
        res.json(await consultarPadron(req.params.tipo, req.params.numero));
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/comprobantes/:id/pdf', adminAuth, async (req, res) => {
    try {
        const doc = await cargarComprobante(req.params.id);
        const { generarPdfA4 } = require('../print/pdfA4');
        const pdf = await generarPdfA4(doc);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${doc.idCompleto}.pdf"`);
        res.send(pdf);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/comprobantes/:id/xml', adminAuth, async (req, res) => {
    try {
        const doc = await cargarComprobante(req.params.id);
        if (!doc.xml?.ruta || !fs.existsSync(doc.xml.ruta)) return res.status(404).json({ message: 'XML aún no firmado', codigo: 'SIN_XML' });
        res.download(doc.xml.ruta, `${doc.idCompleto}.xml`);
    } catch (err) {
        responderError(res, err);
    }
});

router.get('/facturacion/comprobantes/:id/cdr', adminAuth, async (req, res) => {
    try {
        const doc = await cargarComprobante(req.params.id);
        if (!doc.cdr?.ruta || !fs.existsSync(doc.cdr.ruta)) return res.status(404).json({ message: 'CDR aún no recibido', codigo: 'SIN_CDR' });
        res.download(doc.cdr.ruta, `${doc.idCompleto}-cdr.xml`);
    } catch (err) {
        responderError(res, err);
    }
});

async function cargarComprobante(id) {
    if (!mongoose.isValidObjectId(id)) {
        const err = new Error('ID inválido');
        err.statusCode = 400;
        throw err;
    }
    const doc = await Comprobante.findById(id).lean();
    if (!doc) {
        const err = new Error('Comprobante no encontrado');
        err.statusCode = 404;
        throw err;
    }
    return doc;
}

/** Tickets de cocina que ya tienen boleta o factura vigente. El cobro de cocina no entra aquí. */
router.get('/facturacion/tickets-facturados', adminAuth, async (req, res) => {
    try {
        const ids = await Comprobante.distinct('origen.ticket', {
            'origen.ticket': { $ne: null },
            estado: { $nin: ['RECHAZADO', 'ANULADO_NC', 'DE_BAJA'] },
        });
        res.json({ ids: ids.filter(Boolean).map(String) });
    } catch (err) {
        responderError(res, err);
    }
});

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
        const cfg = await obtenerConfiguracionFiscal();
        const ticket = construirPreCuenta({
            ...req.body,
            emisor: req.body.emisor || cfg.emisor.nombreComercial || cfg.emisor.razonSocial,
            ruc: req.body.ruc || cfg.emisor.ruc,
            direccion: req.body.direccion || cfg.emisor.direccion,
            telefono: req.body.telefono || cfg.emisor.telefono,
        });
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
            status: { $nin: ['pagado', 'completado', 'cancelado'] },
        }).populate('platos.plato', 'nombre precio').lean();
        const items = [];
        for (const comanda of comandas) {
            (comanda.platos || []).forEach((linea, i) => {
                if (linea.estado === 'pagado') return;
                const cantidad = Number(linea.cantidad || comanda.cantidades?.[i] || 1);
                const precio = Number(linea.precio || linea.plato?.precio || 0);
                items.push({
                    descripcion: linea.nombre || linea.plato?.nombre || 'Plato',
                    cantidad,
                    precioUnitario: precio,
                    nota: linea.notaEspecial || linea.nota || '',
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
            const emisor = req.body.emisor;
            if (emisor.ruc != null) {
                const ruc = String(emisor.ruc).trim();
                if (!esRucValido(ruc)) {
                    return res.status(422).json({ message: 'RUC del restaurante inválido', codigo: 'RUC_INVALIDO' });
                }
                doc.datosFiscales.ruc = ruc;
            }
            const copiar = (destino, origen) => {
                if (emisor[origen] != null) doc.datosFiscales[destino] = String(emisor[origen]).trim();
            };
            copiar('razonSocial', 'razonSocial');
            copiar('nombreComercial', 'nombreComercial');
            copiar('direccionFiscal', 'direccion');
            copiar('telefono', 'telefono');
            copiar('email', 'email');
            copiar('ubigeo', 'ubigeo');
            if (emisor.codigoEstablecimiento != null) {
                const codigo = String(emisor.codigoEstablecimiento).replace(/\D/g, '');
                if (!/^\d{4}$/.test(codigo)) {
                    return res.status(422).json({ message: 'El código de establecimiento debe tener 4 dígitos', codigo: 'ESTABLECIMIENTO_INVALIDO' });
                }
                doc.datosFiscales.codigoEstablecimiento = codigo;
            }
            doc.markModified('datosFiscales');
        }
        await doc.save();
        res.json(await obtenerConfiguracionFiscal());
    } catch (err) {
        responderError(res, err);
    }
});

module.exports = router;
