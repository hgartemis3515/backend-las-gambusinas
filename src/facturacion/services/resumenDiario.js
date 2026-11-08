/**
 * Resumen diario UBL 2.0 / Customization 1.1 (boleta, NC de boleta y contingencia).
 * El receptor va en la línea solo si el importe supera S/ 700.
 * @module facturacion/services/resumenDiario
 */

const { create } = require('xmlbuilder2');

const SUMMARY = 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const SAC = 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1';

const n2 = (n) => (Number(n) || 0).toFixed(2);

class ErrorResumen extends Error {
    constructor(mensaje, codigo) {
        super(mensaje);
        this.name = 'ErrorResumen';
        this.codigo = codigo;
        this.statusCode = 422;
    }
}

/** @param {Date|string} fecha */
function fechaLima(fecha) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date(fecha));
}

/** @param {{ razonSocial?: string, ruc?: string }} emisor */
function validarEmisor(emisor) {
    const nombre = String(emisor?.razonSocial || '').trim();
    if (!/^\d{11}$/.test(emisor?.ruc || '') || nombre.length < 3 || nombre.length > 100) {
        throw new ErrorResumen('El emisor del resumen necesita RUC y razón social de 3 a 100 caracteres', 'EMISOR_RESUMEN');
    }
    return nombre;
}

/**
 * @param {Object} comprobante
 * @returns {Object}
 */
function lineaDesdeComprobante(comprobante) {
    const t = comprobante.totales || {};
    return {
        tipo: comprobante.tipo,
        serie: comprobante.serie || comprobante.serieTalonario,
        numero: Number(comprobante.numero),
        importeTotal: t.importeTotal != null ? t.importeTotal : comprobante.total,
        gravadas: t.gravadas || 0,
        exoneradas: t.exoneradas || 0,
        inafectas: t.inafectas || 0,
        igv: t.igv || 0,
        porcentajeIgv: comprobante.porcentajeIgv,
        receptor: comprobante.receptor || comprobante.cliente,
        referencia: comprobante.referencia || null,
    };
}

/** @param {import('xmlbuilder2').XMLBuilder} tax @param {string} id @param {string} nombre @param {string} tipo @param {number} base @param {number} monto @param {number|null} percent */
function subtotal(tax, id, nombre, tipo, base, monto, percent) {
    const sub = tax.ele('cac:TaxSubtotal');
    sub.ele('cbc:TaxableAmount', { currencyID: 'PEN' }).txt(n2(base));
    sub.ele('cbc:TaxAmount', { currencyID: 'PEN' }).txt(n2(monto));
    const cat = sub.ele('cac:TaxCategory');
    if (percent != null) cat.ele('cbc:Percent').txt(n2(percent));
    const scheme = cat.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt(id);
    scheme.ele('cbc:Name').txt(nombre);
    scheme.ele('cbc:TaxTypeCode').txt(tipo);
}

/** @param {import('xmlbuilder2').XMLBuilder} linea @param {Object} item */
function tributos(linea, item) {
    const tax = linea.ele('cac:TaxTotal');
    tax.ele('cbc:TaxAmount', { currencyID: 'PEN' }).txt(n2(item.igv));
    if (Number(item.gravadas) > 0 || Number(item.igv) > 0) subtotal(tax, '1000', 'IGV', 'VAT', item.gravadas, item.igv, item.porcentajeIgv);
    if (Number(item.exoneradas) > 0) subtotal(tax, '9997', 'EXO', 'VAT', item.exoneradas, 0, 0);
    if (Number(item.inafectas) > 0) subtotal(tax, '9998', 'INA', 'FRE', item.inafectas, 0, 0);
    if (!Number(item.gravadas) && !Number(item.igv) && !Number(item.exoneradas) && !Number(item.inafectas)) {
        subtotal(tax, '1000', 'IGV', 'VAT', 0, 0, item.porcentajeIgv);
    }
}

/** @param {import('xmlbuilder2').XMLBuilder} linea @param {Object} item */
function pagos(linea, item) {
    const partes = [
        ['01', item.gravadas],
        ['02', item.exoneradas],
        ['03', item.inafectas],
    ];
    const usados = partes.filter(([, monto]) => Number(monto) > 0);
    const lista = usados.length ? usados : [['01', 0]];
    for (const [codigo, monto] of lista) {
        const pago = linea.ele('sac:BillingPayment');
        pago.ele('cbc:PaidAmount', { currencyID: 'PEN' }).txt(n2(monto));
        pago.ele('cbc:InstructionID').txt(codigo);
    }
}

/**
 * @param {{ id: string, fechaReferencia: string, fechaGeneracion: string, emisor: Object, lineas: Object[] }} datos
 * @returns {string}
 */
function xmlResumen(datos) {
    const nombre = validarEmisor(datos.emisor);
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('SummaryDocuments', {
        xmlns: SUMMARY,
        'xmlns:cac': CAC,
        'xmlns:cbc': CBC,
        'xmlns:ext': EXT,
        'xmlns:sac': SAC,
    });
    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent');
    root.ele('cbc:UBLVersionID').txt('2.0');
    root.ele('cbc:CustomizationID').txt('1.1');
    root.ele('cbc:ID').txt(datos.id);
    root.ele('cbc:ReferenceDate').txt(datos.fechaReferencia);
    root.ele('cbc:IssueDate').txt(datos.fechaGeneracion);
    const firma = root.ele('cac:Signature');
    firma.ele('cbc:ID').txt('SIGN');
    const party = firma.ele('cac:SignatoryParty');
    party.ele('cac:PartyIdentification').ele('cbc:ID').txt(datos.emisor.ruc);
    party.ele('cac:PartyName').ele('cbc:Name').txt(nombre);
    firma.ele('cac:DigitalSignatureAttachment').ele('cac:ExternalReference').ele('cbc:URI').txt('#SIGN');
    const sup = root.ele('cac:AccountingSupplierParty');
    sup.ele('cbc:CustomerAssignedAccountID').txt(datos.emisor.ruc);
    sup.ele('cbc:AdditionalAccountID').txt('6');
    sup.ele('cac:Party').ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(nombre);

    datos.lineas.forEach((item, i) => {
        const total = Number(item.importeTotal) || 0;
        const receptor = item.receptor || {};
        const identifica = receptor.tipoDoc && receptor.tipoDoc !== '0' && receptor.numDoc && receptor.numDoc !== '-';
        if (total > 700 && !identifica) {
            throw new ErrorResumen('El resumen de una venta mayor a S/ 700 requiere receptor', 'RESUMEN_REQUIERE_RECEPTOR');
        }
        const linea = root.ele('sac:SummaryDocumentsLine');
        linea.ele('cbc:LineID').txt(String(i + 1));
        linea.ele('cbc:DocumentTypeCode').txt(item.tipo || '03');
        linea.ele('cbc:ID').txt(`${item.serie}-${Number(item.numero)}`);
        if (identifica && total > 700) {
            const cliente = linea.ele('cac:AccountingCustomerParty');
            cliente.ele('cbc:CustomerAssignedAccountID').txt(receptor.numDoc);
            cliente.ele('cbc:AdditionalAccountID').txt(receptor.tipoDoc);
        }
        if (item.referencia?.serie) {
            const ref = linea.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
            ref.ele('cbc:ID').txt(`${item.referencia.serie}-${Number(item.referencia.numero)}`);
            ref.ele('cbc:DocumentTypeCode').txt(item.referencia.tipo);
        }
        linea.ele('cac:Status').ele('cbc:ConditionCode').txt('1');
        linea.ele('sac:TotalAmount', { currencyID: 'PEN' }).txt(n2(total));
        pagos(linea, item);
        tributos(linea, item);
    });
    return root.end({ headless: false, prettyPrint: false });
}

module.exports = { xmlResumen, lineaDesdeComprobante, fechaLima, validarEmisor, ErrorResumen };
