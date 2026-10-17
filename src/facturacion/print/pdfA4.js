/**
 * Representación impresa A4. No usa Chromium.
 * @module facturacion/print/pdfA4
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const TITULOS = {
    '01': 'FACTURA ELECTRÓNICA',
    '03': 'BOLETA DE VENTA ELECTRÓNICA',
    '07': 'NOTA DE CRÉDITO ELECTRÓNICA',
};

/**
 * @param {Object} comprobante
 * @returns {Promise<Buffer>}
 */
async function generarPdfA4(comprobante) {
    const emisor = comprobante.emisor || {};
    const receptor = comprobante.receptor || {};
    const totales = comprobante.totales || {};
    const letras = (comprobante.leyendas || []).find((l) => l.codigo === '1000')?.valor || '';
    const qrTexto = [
        comprobante.ruc,
        comprobante.tipo,
        comprobante.serie,
        comprobante.numero,
        Number(totales.igv || 0).toFixed(2),
        Number(totales.importeTotal || 0).toFixed(2),
        comprobante.hash || '',
    ].join('|');
    const qr = await QRCode.toBuffer(qrTexto, { width: 120, margin: 0 });
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const trozos = [];
        doc.on('data', (c) => trozos.push(c));
        doc.on('end', () => resolve(Buffer.concat(trozos)));
        doc.on('error', reject);
        doc.fontSize(16).text(emisor.razonSocial || 'Las Gambusinas', { align: 'left' });
        doc.fontSize(10).fillColor('#333')
            .text(emisor.nombreComercial || '')
            .text(`RUC ${emisor.ruc || comprobante.ruc || ''}`)
            .text(emisor.direccion || '')
            .text(`Establecimiento ${emisor.codigoEstablecimiento || '0000'}`);
        doc.moveDown();
        doc.rect(340, 40, 215, 70).stroke();
        doc.fontSize(11).fillColor('#000').text(`RUC ${comprobante.ruc}`, 350, 50, { width: 195, align: 'center' });
        doc.fontSize(12).text(TITULOS[comprobante.tipo] || 'COMPROBANTE', 350, 68, { width: 195, align: 'center' });
        doc.text(comprobante.idCompleto || `${comprobante.serie}-${comprobante.numero}`, 350, 86, { width: 195, align: 'center' });
        doc.moveDown(4);
        doc.fontSize(10)
            .text(`Cliente: ${receptor.nombre || ''}`)
            .text(`Documento: ${receptor.tipoDoc || ''} ${receptor.numDoc || ''}`)
            .text(`Dirección: ${receptor.direccion || ''}`)
            .text(`Fecha: ${new Date(comprobante.fechaEmision).toISOString().slice(0, 10)}    Moneda: ${comprobante.moneda || 'PEN'}`);
        doc.moveDown();
        doc.font('Helvetica-Bold').text('Cant.  Unid.  Descripción                         V. unit.   Total');
        doc.font('Helvetica');
        for (const item of comprobante.items || []) {
            doc.text(`${item.cantidad}  ${item.unidad || 'NIU'}  ${item.descripcion}    ${Number(item.valorUnitario || 0).toFixed(2)}    ${Number(item.precioTotal || 0).toFixed(2)}`);
        }
        doc.moveDown();
        doc.text(`Op. gravadas: ${Number(totales.gravadas || 0).toFixed(2)}`);
        doc.text(`Op. gratuitas: ${Number(totales.gratuitas || 0).toFixed(2)}`);
        doc.text(`IGV ${comprobante.porcentajeIgv || 10.5}%: ${Number(totales.igv || 0).toFixed(2)}`);
        doc.font('Helvetica-Bold').text(`Total a pagar: ${Number(totales.importeTotal || 0).toFixed(2)}`);
        doc.font('Helvetica').text(letras);
        doc.image(qr, 40, 680, { width: 110 });
        doc.fontSize(8).text(`Hash: ${comprobante.hash || ''}`, 170, 700, { width: 380 });
        doc.text('Representación impresa de la Factura Electrónica. Consulte su documento en https://lasgambusinas.pe/cpe', 170, 730, { width: 380 });
        doc.end();
    });
}

module.exports = { generarPdfA4 };
