const PDFDocument = require('pdfkit');
const moment = require('moment-timezone');

/**
 * Generar PDF profesional de Cierre de Caja
 * Inspirado en Toast POS, Square Terminal
 */
async function generarPDFCierreCaja(cierre, bouchers = []) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 }
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(buffers);
        resolve(pdfBuffer);
      });
      doc.on('error', reject);
      
      // Header profesional
      doc.fontSize(20)
         .font('Helvetica-Bold')
         .text('CIERRE DE CAJA', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica')
         .text('Las Gambusinas', { align: 'center' });
      
      doc.moveDown(1);
      
      // Línea separadora
      doc.moveTo(50, doc.y)
         .lineTo(550, doc.y)
         .stroke();
      
      doc.moveDown(1);
      
      // Datos mozo/fecha
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('INFORMACIÓN DEL CIERRE', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Cierre ID: #${cierre.cierreId || cierre._id?.slice(-6)}`, { indent: 20 });
      doc.text(`Mozo: ${cierre.nombreMozo || 'N/A'}`, { indent: 20 });
      doc.text(`Fecha: ${moment(cierre.fechaCierre).tz("America/Lima").format("DD/MM/YYYY")}`, { indent: 20 });
      doc.text(`Turno: ${cierre.turno?.toUpperCase() || 'N/A'}`, { indent: 20 });
      doc.text(`Estado: ${cierre.estado?.toUpperCase() || 'BORRADOR'}`, { indent: 20 });
      
      doc.moveDown(1);
      
      // Totales del Sistema
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('TOTALES DEL SISTEMA', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica');
      
      const totales = [
        ['Efectivo:', `S/. ${(cierre.totalEfectivoSistema || 0).toFixed(2)}`],
        ['Tarjeta:', `S/. ${(cierre.totalTarjetaSistema || 0).toFixed(2)}`],
        ['Yape:', `S/. ${(cierre.totalYapeSistema || 0).toFixed(2)}`],
        ['Plin:', `S/. ${(cierre.totalPlinSistema || 0).toFixed(2)}`],
        ['Transferencia:', `S/. ${(cierre.totalTransferenciaSistema || 0).toFixed(2)}`],
        ['Propinas:', `S/. ${(cierre.totalPropinas || 0).toFixed(2)}`],
        ['Descuentos:', `S/. ${(cierre.totalDescuentos || 0).toFixed(2)}`]
      ];
      
      totales.forEach(([label, value]) => {
        doc.text(`${label.padEnd(20)} ${value}`, { indent: 20 });
      });
      
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold')
         .text(`TOTAL SISTEMA: S/. ${(cierre.totalSistema || 0).toFixed(2)}`, { indent: 20 });
      
      doc.moveDown(1);
      
      // Validación Física
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('VALIDACIÓN FÍSICA', { underline: true });
      
      doc.moveDown(0.5);
      doc.fontSize(10)
         .font('Helvetica')
         .text(`Efectivo Sistema: S/. ${(cierre.totalEfectivoSistema || 0).toFixed(2)}`, { indent: 20 });
      doc.text(`Efectivo Físico:  S/. ${(cierre.totalEfectivoFisico || 0).toFixed(2)}`, { indent: 20 });
      
      doc.moveDown(0.5);
      
      const diferencia = cierre.diferencia || 0;
      const colorDiferencia = Math.abs(diferencia) > 5 ? 'red' : 'green';
      
      doc.font('Helvetica-Bold')
         .fillColor(colorDiferencia)
         .text(`DIFERENCIA: S/. ${diferencia.toFixed(2)}`, { indent: 20 });
      
      if (Math.abs(diferencia) > 5) {
        doc.fillColor('red')
           .fontSize(9)
           .text('⚠️ REVISAR DIFERENCIA', { indent: 20 });
      }
      
      doc.fillColor('black');
      
      if (cierre.observaciones) {
        doc.moveDown(0.5);
        doc.font('Helvetica')
           .text(`Observaciones: ${cierre.observaciones}`, { indent: 20 });
      }
      
      doc.moveDown(1);
      
      // Detalle de Bouchers (si hay)
      if (bouchers && bouchers.length > 0) {
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text('DETALLE DE BOUCHERS', { underline: true });
        
        doc.moveDown(0.5);
        doc.fontSize(8)
           .font('Helvetica');
        
        // Tabla de bouchers
        let y = doc.y;
        const tableTop = y;
        const itemHeight = 15;
        const pageHeight = 750;
        
        // Headers
        doc.font('Helvetica-Bold')
           .fontSize(8)
           .text('N°', 50, y)
           .text('Mesa', 100, y)
           .text('Total', 200, y)
           .text('Fecha', 300, y);
        
        y += itemHeight;
        doc.moveTo(50, y)
           .lineTo(550, y)
           .stroke();
        
        y += 5;
        
        // Filas
        bouchers.forEach((boucher, index) => {
          if (y > pageHeight - 50) {
            doc.addPage();
            y = 50;
          }
          
          doc.font('Helvetica')
             .fontSize(8)
             .text(`#${boucher.boucherNumber || boucher._id?.slice(-6)}`, 50, y)
             .text(`${boucher.numMesa || 'N/A'}`, 100, y)
             .text(`S/. ${(boucher.total || 0).toFixed(2)}`, 200, y)
             .text(moment(boucher.fechaPago).tz("America/Lima").format("DD/MM HH:mm"), 300, y);
          
          y += itemHeight;
        });
      }
      
      // Footer
      const pageCount = doc.bufferedPageRange();
      for (let i = 0; i < pageCount.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .font('Helvetica')
           .fillColor('gray')
           .text(
             `Página ${i + 1} de ${pageCount.count} - Generado el ${moment().tz("America/Lima").format("DD/MM/YYYY HH:mm:ss")}`,
             50,
             750,
             { align: 'center' }
           );
      }
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  generarPDFCierreCaja
};

