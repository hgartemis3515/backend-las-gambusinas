/**
 * Resumen SUNAT de boletas de talonario. No toca las series electrónicas.
 * @module facturacion/services/contingenciaSunat
 */

const Contingencia = require('../models/contingencia.model');
const { firmarXml } = require('./firmaService');
const SunatDirecto = require('../providers/sunatDirecto');

function xmlResumen(comprobantes, ruc, fecha) {
    const id = `RC-${fecha.replace(/-/g, '')}-9`;
    const lineas = comprobantes.map((c, i) => `<sac:SummaryDocumentsLine>
      <cbc:LineID>${i + 1}</cbc:LineID>
      <cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>
      <cbc:ID>${c.serieTalonario}-${Number(c.numero)}</cbc:ID>
      <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${c.cliente?.tipoDoc || '0'}">${c.cliente?.numDoc || '-'}</cbc:ID></cac:PartyIdentification></cac:Party></cac:AccountingCustomerParty>
      <cac:Status><cbc:ConditionCode>1</cbc:ConditionCode></cac:Status>
      <sac:TotalAmount currencyID="PEN">${Number(c.total).toFixed(2)}</sac:TotalAmount>
    </sac:SummaryDocumentsLine>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SummaryDocuments xmlns="urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2" xmlns:sac="urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:UBLVersionID>2.0</cbc:UBLVersionID>
  <cbc:CustomizationID>1.1</cbc:CustomizationID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:ReferenceDate>${fecha}</cbc:ReferenceDate>
  <cbc:IssueDate>${fecha}</cbc:IssueDate>
  ${lineas}
</SummaryDocuments>`;
    return { id, nombre: `${ruc}-${id}`, xml };
}

/**
 * @param {{ ruc: string }} solicitud
 * @param {{ Modelo?: import('mongoose').Model, enviar?: Function, firmar?: Function }} [deps]
 */
async function declararContingencia(solicitud, deps = {}) {
    const Modelo = deps.Modelo || Contingencia;
    const pendientes = await Modelo.find({ ruc: solicitud.ruc, estado: 'REGISTRADO' });
    if (!pendientes.length) return { enviados: 0, ticket: null };
    const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const resumen = xmlResumen(pendientes, solicitud.ruc, fecha);
    const firmado = (deps.firmar || firmarXml)(resumen.xml);
    const enviar = deps.enviar || (async (nombre, xml) => new SunatDirecto().enviarResumenFirmado(nombre, xml));
    const { ticket } = await enviar(resumen.nombre, firmado.xml);
    await Modelo.updateMany({ _id: { $in: pendientes.map((d) => d._id) } }, { $set: { estado: 'ENVIADO', ticketSunat: ticket } });
    return { enviados: pendientes.length, ticket, id: resumen.id };
}

module.exports = { declararContingencia, xmlResumen };
