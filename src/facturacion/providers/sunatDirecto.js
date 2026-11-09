/**
 * SEE del contribuyente: SOAP billService (sendBill / sendSummary / getStatus).
 * La firma ya está en el XML. Este adaptador solo empaqueta y envía.
 * @module facturacion/providers/sunatDirecto
 */

const fs = require('fs');
const https = require('https');
const ProveedorFiscal = require('./ProveedorFiscal');
const { comprimir, descomprimir } = require('./zipSunat');
const { nombreArchivo } = require('../services/ublBuilder');
const { firmarXml } = require('../services/firmaService');
const { reservarEnvio } = require('../services/correlativoEnvio');
const { xmlResumen, lineaDesdeComprobante, fechaLima } = require('../services/resumenDiario');

const BETA = 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService';
const PRODUCCION = 'https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService';

function urlPorAmbiente() {
    if (process.env.SUNAT_BILL_SERVICE_URL) return process.env.SUNAT_BILL_SERVICE_URL;
    return process.env.SUNAT_AMBIENTE === 'produccion' ? PRODUCCION : BETA;
}

/** @param {string} xml */
function escapar(xml) {
    return xml.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * @param {'sendBill'|'sendSummary'|'getStatus'} operacion
 * @param {string} cuerpo
 */
function envelope(operacion, cuerpo) {
    const usuario = `${process.env.SUNAT_RUC || ''}${process.env.SUNAT_SOL_USUARIO || ''}`;
    const clave = escapar(process.env.SUNAT_SOL_CLAVE || '');
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${usuario}</wsse:Username>
        <wsse:Password>${clave}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:${operacion}>${cuerpo}</ser:${operacion}>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** @param {string} url @param {string} xml @param {string} action */
function postSoap(url, xml, action) {
    const destino = new URL(url);
    const body = Buffer.from(xml);
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: destino.hostname,
            path: destino.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                SOAPAction: `urn:${action}`,
                'Content-Length': body.length,
            },
            timeout: 20000,
        }, (res) => {
            const trozos = [];
            res.on('data', (c) => trozos.push(c));
            res.on('end', () => resolve(Buffer.concat(trozos).toString('utf8')));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Timeout SOAP SUNAT')));
        req.end(body);
    });
}

/** @param {string} soap */
function extraerAplicacion(soap) {
    const falla = soap.match(/<faultstring[^>]*>([^<]+)/i);
    if (falla) {
        const error = new Error(falla[1]);
        error.codigo = 'SOAP';
        throw error;
    }
    const app = soap.match(/<(?:\w+:)?applicationResponse[^>]*>([^<]+)/i);
    if (!app) throw new Error('SUNAT no devolvió applicationResponse');
    return Buffer.from(app[1], 'base64');
}

/** @param {string} xmlCdr */
function leerCdr(xmlCdr) {
    const codigo = (xmlCdr.match(/<(?:\w+:)?ResponseCode[^>]*>([^<]+)/) || [])[1] || '';
    const descripcion = (xmlCdr.match(/<(?:\w+:)?Description[^>]*>([^<]+)/) || [])[1] || '';
    const observaciones = [...xmlCdr.matchAll(/<(?:\w+:)?Note[^>]*>([^<]+)/g)].map((m) => m[1]);
    return {
        aceptado: codigo === '0',
        codigo,
        descripcion,
        observaciones,
        hash: null,
        xmlNombre: null,
        xmlBase64: null,
        cdrBase64: null,
    };
}

class SunatDirecto extends ProveedorFiscal {
    constructor(opciones = {}) {
        super(opciones);
        this.url = opciones.url || urlPorAmbiente();
        this.post = opciones.post || ((xml, action) => postSoap(this.url, xml, action));
        this.firmar = opciones.firmar || firmarXml;
        this.reservarEnvio = opciones.reservarEnvio || reservarEnvio;
        this.persistirLote = opciones.persistirLote !== false;
    }

    get nombre() {
        return 'sunat';
    }

    /** @param {Object} comprobante XML ya firmado en comprobante.xml.ruta */
    async emitir(comprobante) {
        const porResumen = comprobante.tipo === '03' || (comprobante.tipo === '07' && comprobante.referencia?.tipo === '03');
        if (porResumen) {
            if (comprobante.envio?.ticket) return this.consultarTicket(comprobante.envio.ticket);
            return this.enviarBoleta(comprobante);
        }
        if (!(comprobante.xml?.ruta && fs.existsSync(comprobante.xml.ruta))) {
            const error = new Error('XML firmado no disponible. No se reconstruye el comprobante.');
            error.codigo = 'XML_NO_DISPONIBLE';
            throw error;
        }
        return this.sendBill(nombreArchivo(comprobante), fs.readFileSync(comprobante.xml.ruta, 'utf8'));
    }

    /** @param {string} nombreSinExtension @param {string} xml */
    async sendBill(nombreSinExtension, xml) {
        const zip = comprimir(`${nombreSinExtension}.xml`, xml).toString('base64');
        const soap = envelope('sendBill', `<fileName>${nombreSinExtension}.zip</fileName><contentFile>${zip}</contentFile>`);
        const respuesta = await this.post(soap, 'sendBill');
        const cdrZip = extraerAplicacion(respuesta);
        const cdr = descomprimir(cdrZip);
        const leido = leerCdr(cdr.contenido.toString('utf8'));
        leido.xmlNombre = nombreSinExtension;
        leido.cdrBase64 = cdrZip.toString('base64');
        return leido;
    }

    /** Boleta o NC de boleta: un resumen, guarda el ticket y no lo consulta en el mismo paso. */
    async enviarBoleta(comprobante) {
        const referencia = fechaLima(comprobante.fechaEmision || new Date());
        const hoy = fechaLima(new Date());
        const generacion = hoy < referencia ? referencia : hoy;
        const ruc = comprobante.ruc || comprobante.emisor?.ruc;
        const { id } = await this.reservarEnvio({ ruc, tipo: 'RC', fecha: referencia });
        const xml = xmlResumen({
            id,
            fechaReferencia: referencia,
            fechaGeneracion: generacion,
            emisor: comprobante.emisor,
            lineas: [lineaDesdeComprobante(comprobante)],
        });
        const firmado = this.firmar(xml);
        const nombre = `${ruc}-${id}`;
        const enviado = await this.enviarResumenFirmado(nombre, firmado.xml);
        if (this.persistirLote) await this.guardarLote({ ruc, tipo: 'RC', codigo: id, fechaReferencia: referencia, comprobantes: [comprobante.idCompleto], ticket: enviado.ticket });
        return {
            aceptado: false,
            codigo: '98',
            descripcion: 'Ticket en proceso',
            observaciones: [],
            hash: firmado.hash,
            xmlNombre: nombre,
            xmlBase64: null,
            cdrBase64: null,
            ticket: enviado.ticket,
            loteId: id,
        };
    }

    /** @param {Object} datos */
    async guardarLote(datos) {
        const Lote = require('../models/loteSunat.model');
        await Lote.findOneAndUpdate({ ruc: datos.ruc, codigo: datos.codigo }, { $set: { ...datos, estado: 'EN_PROCESO', intentos: 1 } }, { upsert: true });
    }

    /** Envía un resumen ya firmado y devuelve el ticket, sin esperar el CDR. */
    async enviarResumenFirmado(nombre, xmlFirmado) {
        const zip = comprimir(`${nombre}.xml`, xmlFirmado).toString('base64');
        const soap = envelope('sendSummary', `<fileName>${nombre}.zip</fileName><contentFile>${zip}</contentFile>`);
        const respuesta = await this.post(soap, 'sendSummary');
        const ticket = (respuesta.match(/<(?:\w+:)?ticket[^>]*>([^<]+)/i) || [])[1];
        if (!ticket) throw new Error('SUNAT no devolvió ticket de resumen');
        return { ticket };
    }

    async enviarResumen(resumen) {
        return { ticket: resumen.ticket || '' };
    }

    /** @param {{ nombre: string, xml: string }} lote */
    async comunicarBaja(lote) {
        return this.enviarResumenFirmado(lote.nombre, lote.xml);
    }

    async consultarTicket(ticket) {
        const soap = envelope('getStatus', `<ticket>${ticket}</ticket>`);
        const respuesta = await this.post(soap, 'getStatus');
        if (/0127/.test(respuesta) && !/applicationResponse/.test(respuesta)) {
            return { aceptado: false, codigo: '0127', descripcion: 'Ticket inexistente', observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null, ticket };
        }
        if (/En proceso|98/.test(respuesta) && !/applicationResponse/.test(respuesta)) {
            return { aceptado: false, codigo: '98', descripcion: 'Ticket en proceso', observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null, ticket };
        }
        const cdrZip = extraerAplicacion(respuesta);
        const cdr = descomprimir(cdrZip);
        const leido = leerCdr(cdr.contenido.toString('utf8'));
        leido.ticket = ticket;
        leido.cdrBase64 = cdrZip.toString('base64');
        return leido;
    }

    async consultarEstado() {
        return { aceptado: false, codigo: '0100', descripcion: 'Consulta CDR solo en producción', observaciones: [], hash: null, xmlNombre: null, xmlBase64: null, cdrBase64: null };
    }
}

module.exports = SunatDirecto;
module.exports.envelope = envelope;
module.exports.leerCdr = leerCdr;
module.exports.BETA = BETA;
module.exports.PRODUCCION = PRODUCCION;
