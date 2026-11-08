/**
 * Comunicación de baja (RA) solo para facturas aceptadas y dentro del plazo.
 * @module facturacion/services/baja
 */

const { create } = require('xmlbuilder2');
const { firmarXml } = require('./firmaService');
const { reservarEnvio } = require('./correlativoEnvio');
const { fechaLima, validarEmisor } = require('./resumenDiario');

const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const SAC = 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1';
const VOIDED = 'urn:sunat:names:specification:ubl:peru:schema:xsd:VoidedDocuments-1';

class ErrorBaja extends Error {
    constructor(mensaje, codigo, statusCode = 422) {
        super(mensaje);
        this.name = 'ErrorBaja';
        this.codigo = codigo;
        this.statusCode = statusCode;
    }
}

/** @param {string} motivo */
function validarMotivoBaja(motivo) {
    const texto = String(motivo ?? '').trim();
    if (!texto) throw new ErrorBaja('El motivo de baja está vacío', '2315');
    if (texto.length < 3 || texto.length > 100) throw new ErrorBaja('El motivo de baja debe tener de 3 a 100 caracteres', '4203');
    return texto;
}

/** @param {Object} comprobante @param {Date} ahora @param {number} plazoDias */
function puedeDarDeBaja(comprobante, ahora = new Date(), plazoDias = 3) {
    if (comprobante.tipo !== '01') throw new ErrorBaja('La comunicación de baja es solo para facturas', 'NO_ES_FACTURA');
    if (!['ACEPTADO', 'ACEPTADO_OBS'].includes(comprobante.estado)) {
        throw new ErrorBaja('Solo se da de baja un comprobante aceptado', 'NO_ACEPTADO');
    }
    const limite = new Date(new Date(comprobante.fechaEmision).getTime() + plazoDias * 86400000);
    if (ahora > limite) throw new ErrorBaja('La factura está fuera del plazo de baja', 'FUERA_DE_PLAZO');
    return true;
}

/**
 * @param {Object} comprobante
 * @param {string} motivo
 * @param {{ id: string, fechaReferencia: string, fechaGeneracion: string }} lote
 */
function xmlBaja(comprobante, motivo, lote) {
    const texto = validarMotivoBaja(motivo);
    const nombre = validarEmisor(comprobante.emisor);
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('VoidedDocuments', {
        xmlns: VOIDED,
        'xmlns:cac': CAC,
        'xmlns:cbc': CBC,
        'xmlns:ext': EXT,
        'xmlns:sac': SAC,
    });
    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent');
    root.ele('cbc:UBLVersionID').txt('2.0');
    root.ele('cbc:CustomizationID').txt('1.0');
    root.ele('cbc:ID').txt(lote.id);
    root.ele('cbc:ReferenceDate').txt(lote.fechaReferencia);
    root.ele('cbc:IssueDate').txt(lote.fechaGeneracion);
    const firma = root.ele('cac:Signature');
    firma.ele('cbc:ID').txt('SIGN');
    const party = firma.ele('cac:SignatoryParty');
    party.ele('cac:PartyIdentification').ele('cbc:ID').txt(comprobante.emisor.ruc);
    party.ele('cac:PartyName').ele('cbc:Name').txt(nombre);
    firma.ele('cac:DigitalSignatureAttachment').ele('cac:ExternalReference').ele('cbc:URI').txt('#SIGN');
    const sup = root.ele('cac:AccountingSupplierParty');
    sup.ele('cbc:CustomerAssignedAccountID').txt(comprobante.emisor.ruc);
    sup.ele('cbc:AdditionalAccountID').txt('6');
    sup.ele('cac:Party').ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(nombre);
    const linea = root.ele('sac:VoidedDocumentsLine');
    linea.ele('cbc:LineID').txt('1');
    linea.ele('cbc:DocumentTypeCode').txt('01');
    linea.ele('sac:DocumentSerialID').txt(comprobante.serie);
    linea.ele('sac:DocumentNumberID').txt(String(Number(comprobante.numero)));
    linea.ele('sac:VoidReasonDescription').txt(texto);
    return { id: lote.id, xml: root.end({ headless: false, prettyPrint: false }) };
}

/**
 * @param {{ comprobanteId: string, motivo: string }} solicitud
 * @param {Object} [deps]
 */
async function comunicarBaja(solicitud, deps = {}) {
    const motivo = validarMotivoBaja(solicitud.motivo);
    const Modelo = deps.Modelo;
    const doc = await Modelo.findById(solicitud.comprobanteId);
    if (!doc) throw new ErrorBaja('Factura no encontrada', 'NO_ENCONTRADA', 404);
    const ahora = deps.ahora ? deps.ahora() : new Date();
    puedeDarDeBaja(doc, ahora, deps.plazoDias || 3);
    const reservar = deps.reservar || reservarEnvio;
    const referencia = fechaLima(doc.fechaEmision);
    const generacion = fechaLima(ahora);
    const { id } = await reservar({ ruc: doc.ruc, tipo: 'RA', fecha: generacion });
    const built = xmlBaja(doc, motivo, { id, fechaReferencia: referencia, fechaGeneracion: generacion < referencia ? referencia : generacion });
    const firmado = deps.firmar ? deps.firmar(built.xml) : firmarSiHay(built.xml);
    const enviar = deps.enviar || enviarPorDefecto;
    const enviado = await enviar({ nombre: `${doc.ruc}-${built.id}`, xml: firmado.xml || firmado });
    const anterior = doc.estado;
    doc.estado = 'BAJA_PENDIENTE';
    doc.envio = doc.envio || {};
    doc.envio.ticket = enviado.ticket;
    doc.envio.baja = { estadoAnterior: anterior };
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
    const proveedor = new SunatDirecto();
    return proveedor.comunicarBaja({ nombre, xml });
}

module.exports = { puedeDarDeBaja, xmlBaja, comunicarBaja, validarMotivoBaja, ErrorBaja };
