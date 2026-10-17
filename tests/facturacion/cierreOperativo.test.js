const { formatearTicket, GAVETA } = require('../../src/facturacion/print/escposFormatter');
const { generarRvie } = require('../../src/facturacion/services/sireRvie');

describe('ESC/POS', () => {
    const base = { titulo: 'BOLETA', lineas: ['Ceviche 35.50'], qr: '20131312955|03|B001|1|3.37|35.50|2026-10-15|0|-|abc|', hash: 'abcdefghijklmnopqrstuvwxyz012345' };

    test('abre la gaveta solo si hay efectivo e incluye el QR', () => {
        const conEfectivo = formatearTicket({ ...base, montoEfectivo: 20 });
        const sinEfectivo = formatearTicket({ ...base, montoEfectivo: 0 });
        const precuenta = formatearTicket({ precuenta: true, lineas: ['Mesa 4'], montoEfectivo: 50, qr: base.qr });
        expect(conEfectivo.includes(GAVETA)).toBe(true);
        expect(sinEfectivo.includes(GAVETA)).toBe(false);
        expect(conEfectivo.includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(true);
        expect(precuenta.includes(GAVETA)).toBe(false);
        expect(precuenta.includes(Buffer.from([0x1d, 0x28, 0x6b]))).toBe(false);
        expect(precuenta.toString('latin1')).toContain('NO VALIDO COMO COMPROBANTE');
        expect(formatearTicket({ ...base, copia: 2 }).toString('latin1')).toContain('REIMPRESION #02');
    });
});

describe('RVIE con boleta canjeada', () => {
    test('la boleta anulada queda en el archivo y su monto no suma', () => {
        const boleta = {
            fechaEmision: new Date('2026-10-15T15:00:00Z'), tipo: '03', serie: 'B001', numero: '00000001',
            receptor: { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' },
            totales: { gravadas: 90, igv: 9.45, importeTotal: 99.45, exoneradas: 0, inafectas: 0, cargos: 0, icbper: 0 },
            estado: 'ANULADO_NC', hash: 'abc',
        };
        const factura = { ...boleta, tipo: '01', serie: 'F001', estado: 'ACEPTADO', totales: { ...boleta.totales } };
        const rvie = generarRvie([boleta, factura], { ruc: '20131312955', anio: 2026, mes: 10 });
        expect(rvie.filename).toBe('LE2013131295520261000140100001111.txt');
        const lineas = rvie.txt.split('\n');
        expect(lineas[0]).toContain('|0.00|');
        expect(lineas[0].split('|').includes('2')).toBe(true);
        expect(lineas[1]).toContain('99.45');
    });
});
