/**
 * Comunicación de baja (RA) solo para facturas dentro del plazo.
 * @module facturacion/services/baja
 */

const { firmarXml } = require('./firmaService');

class ErrorBaja extends Error {
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorBaja';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/** @param {Object} comprobante @param {Date} ahora @param {number} plazoDias */
function puedeDarDeBaja(comprobante, ahora = new Date(), plazoDias = 3) {
    if (comprobante.tipo !== '01') throw new ErrorBaja('La comunicación de baja es solo para facturas', 'NO_ES_FACTURA');
    const limite = new Date(new Date(comprobante.fechaEmision).getTime() + plazoDias * 86400000);
    if (ahora > limite) throw new ErrorBaja('La factura está fuera del plazo de baja', 'FUERA_DE_PLAZO');
    return true;
}

/** @param {Object} comprobante @param {string} motivo @param {Date} [ahora] */
function xmlBaja(comprobante, motivo, ahora = new Date()) {
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
    const ref = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(comprobante.fechaEmision));
    const id = `RA-${fecha.replace(/-/g, '')}-1`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VoidedDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.0</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:ReferenceDate>${ref}</cbc:ReferenceDate>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  <sac:VoidedDocumentsLine>
    <cbc:LineID>1</cbc:LineID>
    <cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>
    <sac:DocumentSerialID>${comprobante.serie}</sac:DocumentSerialID>
    <sac:DocumentNumberID>${Number(comprobante.numero)}</sac:DocumentNumberID>
    <sac:VoidReasonDescription>${motivo}</sac:VoidReasonDescription>
  </sac:VoidedDocumentsLine>
</VoidedDocuments>`;
    return { id, xml };
}

/**
 * @param {{ comprobanteId: string, motivo: string }} solicitud
 * @param {Object} [deps]
 */
async function comunicarBaja(solicitud, deps = {}) {
    if (!solicitud.motivo) throw new ErrorBaja('El motivo es obligatorio', 'MOTIVO_REQUERIDO');
    const Modelo = deps.Modelo;
    const doc = await Modelo.findById(solicitud.comprobanteId);
    if (!doc) throw new ErrorBaja('Factura no encontrada', 'NO_ENCONTRADA', 404);
    puedeDarDeBaja(doc, deps.ahora ? deps.ahora() : new Date(), deps.plazoDias || 3);
    const built = xmlBaja(doc, solicitud.motivo, deps.ahora ? deps.ahora() : new Date());
    const firmado = deps.firmar ? deps.firmar(built.xml) : firmarSiHay(built.xml);
    const enviar = deps.enviar || enviarPorDefecto;
    const enviado = await enviar({ nombre: `${doc.ruc}-${built.id}`, xml: firmado.xml });
    doc.estado = 'BAJA_PENDIENTE';
    doc.envio.ticket = enviado.ticket;
    if (typeof doc.save === 'function') await doc.save();
    return { id: built.id, ticket: enviado.ticket, estado: doc.estado };
}

function firmarSiHay(xml) {
    if (!process.env.CERT_PATH) return { xml, hash: null };
    return firmarXml(xml);
}

async function enviarPorDefecto({ nombre, xml }) {
    if ((process.env.FACTURACION_PROVEEDOR || 'mock') !== 'sunat') return { ticket: `LOCAL-${nombre}` };
    const SunatDirecto = require('../providers/sunatDirecto');
    const { comprimir } = require('../providers/zipSunat');
    const proveedor = new SunatDirecto();
    const zip = comprimir(`${nombre}.xml`, xml).toString('base64');
    const { envelope } = SunatDirecto;
    const soap = envelope('sendSummary', `<fileName>${nombre}.zip</fileName><contentFile>${zip}</contentFile>`);
    const respuesta = await proveedor.post(soap, 'sendSummary');
    const ticket = (respuesta.match(/<(?:\w+:)?ticket[^>]*>([^<]+)/i) || [])[1];
    if (!ticket) throw new ErrorBaja('SUNAT no devolvió ticket de baja', 'SIN_TICKET', 502);
    return { ticket };
}

module.exports = { puedeDarDeBaja, xmlBaja, comunicarBaja, ErrorBaja };
