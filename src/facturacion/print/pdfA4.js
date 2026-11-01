/**
 * Representación impresa en ticket de 80 mm. No usa Chromium.
 * @module facturacion/print/pdfA4
 */

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { datosTicket } = require('./vistaComprobante');

const ANCHO = 226;
const MARGEN = 10;
const CUERPO = ANCHO - MARGEN * 2;

/**
 * @param {Object} comprobante
 * @returns {Promise<Buffer>}
 */
async function generarPdfA4(comprobante) {
    const vista = datosTicket(comprobante);
    const qr = await QRCode.toBuffer(vista.qrTexto || vista.serie || 'cpe', { width: 180, margin: 0 });
    const alto = 640 + (vista.items.length * 16);
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: [ANCHO, alto], margin: 0 });
        const trozos = [];
        doc.on('data', (c) => trozos.push(c));
        doc.on('end', () => resolve(Buffer.concat(trozos)));
        doc.on('error', reject);
        let y = 12;

        const centro = (texto, size, bold) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
            const h = doc.heightOfString(texto, { width: CUERPO, align: 'center' });
            doc.text(texto, MARGEN, y, { width: CUERPO, align: 'center' });
            y += h + 1;
        };
        const raya = () => {
            y += 3;
            doc.save();
            doc.dash(1, { space: 2 }).strokeColor('#000').lineWidth(0.6)
                .moveTo(MARGEN, y).lineTo(ANCHO - MARGEN, y).stroke();
            doc.restore();
            y += 6;
        };
        const izquierda = (texto, size, bold) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
            const h = doc.heightOfString(texto, { width: CUERPO });
            doc.text(texto, MARGEN, y, { width: CUERPO });
            y += h + 1;
        };
        const derecha = (texto, size, bold) => {
            doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#000');
            doc.text(texto, MARGEN, y, { width: CUERPO, align: 'right' });
            y += size + 3;
        };

        for (const linea of vista.cabecera) {
            const font = linea.bold ? 'Helvetica-Bold' : (linea.italic ? 'Helvetica-Oblique' : 'Helvetica');
            doc.font(font).fontSize(linea.bold ? 10 : 8).fillColor('#000');
            const h = doc.heightOfString(linea.texto, { width: CUERPO, align: 'center' });
            doc.text(linea.texto, MARGEN, y, { width: CUERPO, align: 'center' });
            y += h + 1;
        }
        raya();
        izquierda(vista.titulo, 9, true);
        izquierda(vista.serie, 10, true);
        for (const f of vista.filas) izquierda(`${f.k} ${f.v}`, 8, false);
        raya();
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('Cant.', MARGEN, y, { width: 28, lineBreak: false });
        doc.text('Descripción', MARGEN + 30, y, { width: 78, lineBreak: false });
        doc.text('Precio', MARGEN + 108, y, { width: 42, align: 'right', lineBreak: false });
        doc.text('Importe', MARGEN + 150, y, { width: CUERPO - 150, align: 'right' });
        y += 12;
        doc.font('Helvetica').fontSize(8);
        for (const it of vista.items) {
            const h = doc.heightOfString(it.desc, { width: 78 });
            doc.text(it.cant, MARGEN, y, { width: 28, lineBreak: false });
            doc.text(it.desc, MARGEN + 30, y, { width: 78 });
            doc.text(it.precio, MARGEN + 108, y, { width: 42, align: 'right', lineBreak: false });
            doc.text(it.importe, MARGEN + 150, y, { width: CUERPO - 150, align: 'right', lineBreak: false });
            y += Math.max(12, h + 2);
        }
        raya();
        for (const t of vista.totalesFilas) derecha(`${t.label} ${t.monto}`, t.fuerte ? 10 : 8, Boolean(t.fuerte));
        if (vista.letras) {
            y += 2;
            izquierda(vista.letras, 7, false);
        }
        y += 6;
        const qw = 88;
        doc.image(qr, (ANCHO - qw) / 2, y, { width: qw });
        y += qw + 6;
        for (const linea of vista.pie) centro(linea, 7, false);
        doc.end();
    });
}

module.exports = { generarPdfA4 };
