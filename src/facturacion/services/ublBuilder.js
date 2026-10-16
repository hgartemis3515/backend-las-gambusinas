/**
 * XML UBL 2.1 para SUNAT: Invoice (01/03) y CreditNote (07).
 * La firma se inserta después en el ExtensionContent vacío.
 * @module facturacion/services/ublBuilder
 */

const { create } = require('xmlbuilder2');

const INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CREDIT = 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const EXT = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const DS = 'http://www.w3.org/2000/09/xmldsig#';

const n2 = (n) => (Number(n) || 0).toFixed(2);
/** Número tal como va en el XML y en el nombre del ZIP: 8 dígitos. */
const correlativo = (numero) => String(Number(numero)).padStart(8, '0');

/** @param {Date|string} fecha */
function partesLima(fecha) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Lima',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(new Date(fecha)).map((p) => [p.type, p.value]));
    return {
        fecha: `${parts.year}-${parts.month}-${parts.day}`,
        hora: `${parts.hour}:${parts.minute}:${parts.second}`,
    };
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} comprobante */
function partesComunes(parent, comprobante) {
    const { fecha, hora } = partesLima(comprobante.fechaEmision);
    const id = `${comprobante.serie}-${correlativo(comprobante.numero)}`;
    parent.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent');
    parent.ele('cbc:UBLVersionID').txt('2.1');
    parent.ele('cbc:CustomizationID').txt('2.0');
    parent.ele('cbc:ID').txt(id);
    parent.ele('cbc:IssueDate').txt(fecha);
    parent.ele('cbc:IssueTime').txt(hora);
    return { fecha, id };
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} comprobante */
function notas(parent, comprobante) {
    for (const leyenda of comprobante.leyendas || []) {
        parent.ele('cbc:Note', { languageLocaleID: leyenda.codigo }).txt(leyenda.valor);
    }
}

function moneda(parent, comprobante) {
    parent.ele('cbc:DocumentCurrencyCode', {
        listID: 'ISO 4217 Alpha',
        listName: 'Currency',
        listAgencyName: 'European Committee for Standardization',
    }).txt(comprobante.moneda || 'PEN');
}

function firmaDeclarada(parent, comprobante) {
    const firma = parent.ele('cac:Signature');
    firma.ele('cbc:ID').txt('SIGN');
    const party = firma.ele('cac:SignatoryParty');
    party.ele('cac:PartyIdentification').ele('cbc:ID').txt(comprobante.emisor.ruc);
    party.ele('cac:PartyName').ele('cbc:Name').txt(comprobante.emisor.razonSocial);
    firma.ele('cac:DigitalSignatureAttachment')
        .ele('cac:ExternalReference')
        .ele('cbc:URI').txt('#SIGN');
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} emisor */
function emisor(parent, emisorDoc) {
    const party = parent.ele('cac:AccountingSupplierParty').ele('cac:Party');
    party.ele('cac:PartyIdentification').ele('cbc:ID', { schemeID: '6' }).txt(emisorDoc.ruc);
    if (emisorDoc.nombreComercial) party.ele('cac:PartyName').ele('cbc:Name').txt(emisorDoc.nombreComercial);
    const legal = party.ele('cac:PartyLegalEntity');
    legal.ele('cbc:RegistrationName').txt(emisorDoc.razonSocial);
    const dir = legal.ele('cac:RegistrationAddress');
    if (emisorDoc.ubigeo) dir.ele('cbc:ID').txt(emisorDoc.ubigeo);
    dir.ele('cbc:AddressTypeCode').txt(emisorDoc.codigoEstablecimiento || '0000');
    dir.ele('cbc:StreetName').txt(emisorDoc.direccion || '-');
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} receptor @param {string} rol */
function receptor(parent, receptorDoc, rol) {
    const party = parent.ele(rol).ele('cac:Party');
    const scheme = receptorDoc.tipoDoc === '0' ? '0' : receptorDoc.tipoDoc;
    const num = receptorDoc.tipoDoc === '0' ? '-' : receptorDoc.numDoc;
    party.ele('cac:PartyIdentification').ele('cbc:ID', { schemeID: scheme }).txt(num);
    const legal = party.ele('cac:PartyLegalEntity');
    legal.ele('cbc:RegistrationName').txt(receptorDoc.nombre);
    if (receptorDoc.direccion) legal.ele('cac:RegistrationAddress').ele('cbc:StreetName').txt(receptorDoc.direccion);
}

/** @param {import('xmlbuilder2').XMLBuilder} tax @param {Object} sub */
function subtotalIgv(tax, sub) {
    const nodo = tax.ele('cac:TaxSubtotal');
    nodo.ele('cbc:TaxableAmount', { currencyID: 'PEN' }).txt(n2(sub.base));
    nodo.ele('cbc:TaxAmount', { currencyID: 'PEN' }).txt(n2(sub.igv));
    const cat = nodo.ele('cac:TaxCategory');
    if (sub.percent != null) cat.ele('cbc:Percent').txt(n2(sub.percent));
    cat.ele('cbc:TaxExemptionReasonCode').txt(sub.afectacion);
    const scheme = cat.ele('cac:TaxScheme');
    scheme.ele('cbc:ID', {
        schemeName: 'Codigo de tributos',
        schemeAgencyName: 'PE:SUNAT',
        schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05',
    }).txt(sub.schemeId);
    scheme.ele('cbc:Name').txt(sub.schemeName);
    scheme.ele('cbc:TaxTypeCode').txt(sub.schemeType);
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} comprobante */
function impuestosCabecera(parent, comprobante) {
    const t = comprobante.totales;
    const tax = parent.ele('cac:TaxTotal');
    tax.ele('cbc:TaxAmount', { currencyID: 'PEN' }).txt(n2(t.igv));
    if (Number(t.gravadas) > 0 || Number(t.igv) > 0) {
        subtotalIgv(tax, { base: t.gravadas, igv: t.igv, percent: comprobante.porcentajeIgv, afectacion: '10', schemeId: '1000', schemeName: 'IGV', schemeType: 'VAT' });
    }
    if (Number(t.exoneradas) > 0) {
        subtotalIgv(tax, { base: t.exoneradas, igv: 0, percent: 0, afectacion: '20', schemeId: '9997', schemeName: 'EXO', schemeType: 'VAT' });
    }
    if (Number(t.inafectas) > 0) {
        subtotalIgv(tax, { base: t.inafectas, igv: 0, percent: 0, afectacion: '30', schemeId: '9998', schemeName: 'INA', schemeType: 'FRE' });
    }
    if (Number(t.gratuitas) > 0) {
        subtotalIgv(tax, { base: t.gratuitas, igv: t.igvGratuitas || 0, percent: comprobante.porcentajeIgv, afectacion: '15', schemeId: '9996', schemeName: 'GRA', schemeType: 'FRE' });
    }
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} comprobante */
function pagos(parent, comprobante) {
    (comprobante.mediosPago || []).forEach((medio, i) => {
        const nodo = parent.ele('cac:PaymentMeans');
        nodo.ele('cbc:ID').txt(String(i + 1));
        nodo.ele('cbc:PaymentMeansCode').txt(medio.codigoSunat);
        nodo.ele('cbc:PaymentID').txt(medio.medio);
    });
    const forma = comprobante.formaPago?.tipo || 'Contado';
    const terms = parent.ele('cac:PaymentTerms');
    terms.ele('cbc:ID').txt('FormaPago');
    terms.ele('cbc:PaymentMeansID').txt(forma);
}

/** @param {import('xmlbuilder2').XMLBuilder} parent @param {Object} item @param {string} etiqueta */
function linea(parent, item, etiqueta) {
    const row = parent.ele(etiqueta);
    row.ele('cbc:ID').txt(String(item.orden));
    const cant = etiqueta === 'cac:CreditNoteLine' ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity';
    row.ele(cant, { unitCode: item.unidad || 'NIU' }).txt(String(item.cantidad));
    row.ele('cbc:LineExtensionAmount', { currencyID: 'PEN' }).txt(n2(item.valorVenta));
    const ref = row.ele('cac:PricingReference').ele('cac:AlternativeConditionPrice');
    const precioRef = item.gratuita ? item.valorReferencialUnitario : item.precioUnitario;
    ref.ele('cbc:PriceAmount', { currencyID: 'PEN' }).txt(n2(precioRef));
    ref.ele('cbc:PriceTypeCode').txt(item.gratuita ? '02' : '01');
    const tax = row.ele('cac:TaxTotal');
    tax.ele('cbc:TaxAmount', { currencyID: 'PEN' }).txt(n2(item.igv));
    subtotalIgv(tax, {
        base: item.baseImponible,
        igv: item.igv,
        percent: item.porcentajeIgv,
        afectacion: item.tipoAfectacionIgv,
        schemeId: '1000',
        schemeName: 'IGV',
        schemeType: 'VAT',
    });
    const prod = row.ele('cac:Item');
    prod.ele('cbc:Description').txt(item.descripcion);
    prod.ele('cac:SellersItemIdentification').ele('cbc:ID').txt(item.codigo || 'PLATO');
    row.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: 'PEN' }).txt(n2(item.valorUnitario));
}

/** @param {Object} comprobante */
function raiz(comprobante) {
    const esNota = comprobante.tipo === '07';
    return create({ version: '1.0', encoding: 'UTF-8' }).ele(esNota ? 'CreditNote' : 'Invoice', {
        xmlns: esNota ? CREDIT : INVOICE,
        'xmlns:cac': CAC,
        'xmlns:cbc': CBC,
        'xmlns:ds': DS,
        'xmlns:ext': EXT,
    });
}

/**
 * @param {Object} comprobante Documento ya calculado y numerado
 * @returns {string}
 */
function construir(comprobante) {
    const root = raiz(comprobante);
    partesComunes(root, comprobante);
    if (comprobante.tipo === '07') {
        const ref = comprobante.referencia || {};
        root.ele('cbc:CreditNoteTypeCode').txt(ref.motivoCodigo || '01');
        notas(root, comprobante);
        moneda(root, comprobante);
        const disc = root.ele('cac:DiscrepancyResponse');
        disc.ele('cbc:ReferenceID').txt(`${ref.serie}-${correlativo(ref.numero)}`);
        disc.ele('cbc:ResponseCode').txt(ref.motivoCodigo || '01');
        disc.ele('cbc:Description').txt(ref.motivoTexto || 'Anulación de la operación');
        const bill = root.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
        bill.ele('cbc:ID').txt(`${ref.serie}-${correlativo(ref.numero)}`);
        bill.ele('cbc:DocumentTypeCode').txt(ref.tipo);
    } else {
        root.ele('cbc:InvoiceTypeCode', {
            listID: comprobante.tipoOperacion || '0101',
            listAgencyName: 'PE:SUNAT',
            listName: 'Tipo de Documento',
            listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01',
        }).txt(comprobante.tipo);
        notas(root, comprobante);
        moneda(root, comprobante);
    }
    firmaDeclarada(root, comprobante);
    emisor(root, comprobante.emisor);
    receptor(root, comprobante.receptor, 'cac:AccountingCustomerParty');
    pagos(root, comprobante);
    impuestosCabecera(root, comprobante);
    const t = comprobante.totales;
    const legal = root.ele('cac:LegalMonetaryTotal');
    legal.ele('cbc:LineExtensionAmount', { currencyID: 'PEN' }).txt(n2(t.valorVenta));
    legal.ele('cbc:TaxInclusiveAmount', { currencyID: 'PEN' }).txt(n2(t.importeTotal));
    legal.ele('cbc:PayableAmount', { currencyID: 'PEN' }).txt(n2(t.importeTotal));
    const etiqueta = comprobante.tipo === '07' ? 'cac:CreditNoteLine' : 'cac:InvoiceLine';
    for (const item of comprobante.items) linea(root, item, etiqueta);
    return root.end({ headless: false, prettyPrint: false });
}

/**
 * Nombre SUNAT: RUC-TIPO-SERIE-NUMERO, con el número en 8 dígitos.
 * @param {Object} comprobante
 */
function nombreArchivo(comprobante) {
    return `${comprobante.ruc}-${comprobante.tipo}-${comprobante.serie}-${correlativo(comprobante.numero)}`;
}

module.exports = { construir, nombreArchivo, partesLima, correlativo };
