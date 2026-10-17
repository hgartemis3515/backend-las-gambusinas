const { generarPdfA4 } = require('../../src/facturacion/print/pdfA4');

test('el PDF A4 es un buffer con cabecera PDF', async () => {
    const pdf = await generarPdfA4({
        ruc: '20000000001',
        tipo: '01',
        serie: 'F001',
        numero: '00000001',
        idCompleto: 'F001-00000001',
        fechaEmision: new Date('2026-10-15T15:00:00Z'),
        moneda: 'PEN',
        porcentajeIgv: 10.5,
        hash: 'abc',
        emisor: { razonSocial: 'EMPRESA DEMO', ruc: '20000000001', direccion: 'Lima', codigoEstablecimiento: '0000' },
        receptor: { tipoDoc: '6', numDoc: '20100066603', nombre: 'CLIENTE', direccion: 'Lima' },
        items: [{ cantidad: 1, unidad: 'NIU', descripcion: 'Lomo', valorUnitario: 40.72, precioTotal: 45 }],
        totales: { gravadas: 55.2, gratuitas: 0, igv: 5.8, importeTotal: 61 },
        leyendas: [{ codigo: '1000', valor: 'SON SESENTA Y UNO CON 00/100 SOLES' }],
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 8).toString().startsWith('%PDF-1.')).toBe(true);
});
