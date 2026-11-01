const { generarPdfA4 } = require('../../src/facturacion/print/pdfA4');
const { datosTicket } = require('../../src/facturacion/print/vistaComprobante');

test('el PDF del comprobante es un ticket de 80 mm', async () => {
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
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 226');
});

test('la vista del ticket sigue el orden del comprobante de referencia', () => {
    const vista = datosTicket({
        ruc: '20000000001',
        tipo: '03',
        serie: 'B001',
        numero: '00000010',
        fechaEmision: new Date('2026-10-26T23:05:30Z'),
        porcentajeIgv: 10.5,
        hash: 'abc',
        cajero: 'Caja4',
        emisor: { razonSocial: 'ANA PATRICIA', nombreComercial: 'San Benito', ruc: '20000000001', direccion: 'Av. 1', telefono: '111', email: 'a@b.pe' },
        receptor: { tipoDoc: '1', numDoc: '00000000', nombre: '-', direccion: '-' },
        formaPago: { tipo: 'Contado' },
        items: [{ cantidad: 1, descripcion: 'Consumo', precioUnitario: 56, precioTotal: 56 }],
        totales: { gravadas: 50.68, igv: 5.32, importeTotal: 56, descuentosItem: 0, descuentoGlobal: 0 },
        leyendas: [{ codigo: '1000', valor: 'SON CINCUENTA Y SEIS CON 00/100 SOLES' }],
    });
    expect(vista.titulo).toBe('BOLETA DE VENTA ELECTRÓNICA');
    expect(vista.serie).toBe('B001 - 00000010');
    expect(vista.cabecera.map((l) => l.texto)).toEqual([
        'San Benito', 'ANA PATRICIA', 'R.U.C.: 20000000001', 'Av. 1', 'Telf.: 111', 'Email: a@b.pe', 'Restaurante',
    ]);
    expect(vista.filas.map((f) => f.k)).toEqual(['Fecha de Emisión:', 'Nombre:', 'D.N.I.', 'Dirección:', 'Forma de pago:']);
    expect(vista.items[0]).toMatchObject({ cant: '1', desc: 'Consumo', precio: '56', importe: '56.00' });
    expect(vista.totalesFilas.map((t) => t.label)).toEqual(['Gravada:', 'IGV (10.50%):', 'Descuento Total:', 'Total:']);
    expect(vista.pie[0]).toBe('Representación Impresa de la Boleta de Venta Electrónica');
    expect(vista.pie.some((l) => l.startsWith('HASH:'))).toBe(true);
});
