/**
 * Aviso al cliente después de un CDR aceptado. Sin SMTP devuelve el enlace de WhatsApp.
 * @module facturacion/jobs/notificacion
 */

const { Queue } = require('bullmq');
const { generarPdfA4 } = require('../print/pdfA4');
const Comprobante = require('../models/comprobante.model');
const { obtenerConexion, redisHabilitado } = require('./queues');

const NOMBRE = 'notificacion';
let cola = null;

function enlaceWhatsapp({ telefono, tipo, serie, numero, total, url }) {
    const etiqueta = tipo === '01' ? 'factura' : tipo === '07' ? 'nota de crédito' : 'boleta';
    const texto = `Hola! Aquí tienes tu ${etiqueta} ${serie}-${numero} por S/ ${Number(total).toFixed(2)}: ${url}`;
    return `https://wa.me/51${String(telefono).replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
}

async function enviarEmail({ para, asunto, texto, pdf, nombrePdf }) {
    if (!process.env.SMTP_HOST || !para) return { enviado: false, motivo: 'SIN_SMTP' };
    const nodemailer = require('nodemailer');
    const transporte = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    await transporte.sendMail({
        from: process.env.SMTP_FROM,
        to: para,
        subject: asunto,
        text: texto,
        attachments: pdf ? [{ filename: nombrePdf || 'comprobante.pdf', content: pdf, contentType: 'application/pdf' }] : [],
    });
    return { enviado: true };
}

async function procesarNotificacion(job) {
    const datos = { ...job.data };
    let pdf = null;
    if (datos.comprobanteId) {
        const doc = await Comprobante.findById(datos.comprobanteId).lean();
        if (doc) {
            pdf = await generarPdfA4(doc);
            datos.tipo = datos.tipo || doc.tipo;
            datos.serie = datos.serie || doc.serie;
            datos.numero = datos.numero || doc.numero;
            datos.total = datos.total || doc.totales?.importeTotal;
        }
    }
    const whatsapp = datos.telefono ? enlaceWhatsapp(datos) : null;
    const correo = await enviarEmail({
        para: datos.email,
        asunto: `Comprobante ${datos.serie}-${datos.numero}`,
        texto: `Tu comprobante está en ${datos.url}`,
        pdf,
        nombrePdf: `${datos.serie}-${datos.numero}.pdf`,
    });
    return { correo, whatsapp };
}

async function encolarNotificacion(datos) {
    const payload = { ...datos, url: datos.url || `${process.env.PUBLIC_URL || 'http://localhost:5174'}/cpe` };
    if (!redisHabilitado()) return { encolado: false, ...await procesarNotificacion({ data: payload }) };
    if (!cola) cola = new Queue(NOMBRE, { connection: obtenerConexion() });
    await cola.add(NOMBRE, payload, { attempts: 3, removeOnComplete: true });
    return { encolado: true };
}

module.exports = { enlaceWhatsapp, procesarNotificacion, encolarNotificacion, NOMBRE };
