const { reservarEnvio } = require('../../src/facturacion/services/correlativoEnvio');
const { xmlResumen, ErrorResumen } = require('../../src/facturacion/services/resumenDiario');
const { xmlBaja, validarMotivoBaja, ErrorBaja } = require('../../src/facturacion/services/bajaService');
const { construir } = require('../../src/facturacion/services/ublBuilder');
const { calcular } = require('../../src/facturacion/services/motorTributario');
const { cuerpoNota, ErrorNota } = require('../../src/facturacion/services/notaCreditoService');
const { candidatos, reconciliar } = require('../../src/facturacion/jobs/reconciliacion.worker');
const SunatDirecto = require('../../src/facturacion/providers/sunatDirecto');

const EMISOR = { ruc: '20131312955', razonSocial: 'LAS GAMBUSINAS SAC' };

function memoria() {
    const map = new Map();
    return {
        async findOneAndUpdate(filtro, update) {
            const key = `${filtro.ruc}|${filtro.tipo}|${filtro.fecha}`;
            const prev = map.get(key) || { ultimo: 0 };
            const next = { ultimo: prev.ultimo + update.$inc.ultimo };
            map.set(key, next);
            return next;
        },
    };
}

const base = {
    ruc: EMISOR.ruc,
    tipo: '03',
    serie: 'B001',
    numero: '00000008',
    fechaEmision: new Date('2026-11-07T15:00:00-05:00'),
    porcentajeIgv: 10.5,
    emisor: EMISOR,
    receptor: { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' },
    totales: { gravadas: 90.5, exoneradas: 0, inafectas: 0, igv: 9.5, importeTotal: 100 },
};

describe('correlativo RC y RA', () => {
    test('dos reservas del mismo día no repiten número y sobreviven a otra instancia', async () => {
        const Modelo = memoria();
        const a = await reservarEnvio({ ruc: EMISOR.ruc, tipo: 'RC', fecha: '2026-11-07' }, { Modelo });
        const b = await reservarEnvio({ ruc: EMISOR.ruc, tipo: 'RC', fecha: '2026-11-07' }, { Modelo });
        const paralelo = await Promise.all([
            reservarEnvio({ ruc: EMISOR.ruc, tipo: 'RA', fecha: '20261107' }, { Modelo }),
            reservarEnvio({ ruc: EMISOR.ruc, tipo: 'RA', fecha: '20261107' }, { Modelo }),
        ]);
        const despues = await reservarEnvio({ ruc: EMISOR.ruc, tipo: 'RC', fecha: '2026-11-07' }, { Modelo });
        expect([a.id, b.id, despues.id]).toEqual(['RC-20261107-1', 'RC-20261107-2', 'RC-20261107-3']);
        expect(new Set(paralelo.map((x) => x.numero)).size).toBe(2);
    });
});

describe('resumen diario', () => {
    test('gravada de 100 lleva emisor, firma, base, IGV y no lleva receptor', () => {
        const xml = xmlResumen({
            id: 'RC-20261107-1',
            fechaReferencia: '2026-11-07',
            fechaGeneracion: '2026-11-07',
            emisor: EMISOR,
            lineas: [{ ...base, tipo: '03', serie: 'B001', numero: 8, importeTotal: 100, gravadas: 90.5, igv: 9.5, porcentajeIgv: 10.5, receptor: base.receptor }],
        });
        expect(xml).toContain('<cbc:CustomizationID>1.1</cbc:CustomizationID>');
        expect(xml).toContain('>LAS GAMBUSINAS SAC<');
        expect(xml).toContain('>#SIGN<');
        expect(xml).toContain('<cbc:InstructionID>01</cbc:InstructionID>');
        expect(xml).toContain('>90.50<');
        expect(xml).toContain('>1000<');
        expect(xml).toContain('>10.50<');
        expect(xml).not.toContain('AccountingCustomerParty');
        expect(xml).toContain('>B001-8<');
    });

    test('S/ 700.01 sin documento no se arma; con DNI el receptor va en la línea', () => {
        const linea = { tipo: '03', serie: 'B001', numero: 9, importeTotal: 700.01, gravadas: 633.49, igv: 66.52, porcentajeIgv: 10.5, receptor: { tipoDoc: '0', numDoc: '-' } };
        expect(() => xmlResumen({ id: 'RC-20261107-2', fechaReferencia: '2026-11-07', fechaGeneracion: '2026-11-07', emisor: EMISOR, lineas: [linea] })).toThrow(ErrorResumen);
        const xml = xmlResumen({
            id: 'RC-20261107-2',
            fechaReferencia: '2026-11-07',
            fechaGeneracion: '2026-11-07',
            emisor: EMISOR,
            lineas: [{ ...linea, receptor: { tipoDoc: '1', numDoc: '45678912' } }],
        });
        expect(xml).toContain('>45678912<');
        expect(xml).toContain('<cbc:AdditionalAccountID>1</cbc:AdditionalAccountID>');
    });

    test('razón social de un carácter se rechaza', () => {
        expect(() => xmlResumen({
            id: 'RC-20261107-1', fechaReferencia: '2026-11-07', fechaGeneracion: '2026-11-07', emisor: { ruc: EMISOR.ruc, razonSocial: 'A' }, lineas: [],
        })).toThrow(ErrorResumen);
    });
});

describe('baja', () => {
    const factura = { ...base, tipo: '01', serie: 'F001', numero: '00000003', estado: 'ACEPTADO', emisor: EMISOR };

    test('escapa el motivo y no usa el id fijo -1', () => {
        const { xml, id } = xmlBaja(factura, 'Error & duplicado', { id: 'RA-20261107-2', fechaReferencia: '2026-11-07', fechaGeneracion: '2026-11-07' });
        expect(id).toBe('RA-20261107-2');
        expect(xml).toContain('Error &amp; duplicado');
        expect(xml).toContain('<cbc:CustomizationID>1.0</cbc:CustomizationID>');
        expect(xml).toContain('>20131312955<');
        expect(() => xmlBaja(factura, '  ', { id: 'RA-20261107-3', fechaReferencia: '2026-11-07', fechaGeneracion: '2026-11-07' })).toThrow(ErrorBaja);
        expect(() => validarMotivoBaja('ab')).toThrow(ErrorBaja);
    });
});

describe('XML de factura y nota', () => {
    test('exonerado usa 9997, la cortesía 9996 y el unitario no se recorta a dos decimales', () => {
        const xml = construir({
            ...base,
            tipo: '01',
            serie: 'F001',
            numero: '00000001',
            tipoOperacion: '0101',
            moneda: 'PEN',
            receptor: { tipoDoc: '6', numDoc: '20131312955', nombre: 'ACME SAC', direccion: 'Lima' },
            items: [
                { orden: 1, descripcion: 'Agua', unidad: 'NIU', cantidad: 1000, tipoAfectacionIgv: '20', gratuita: false, valorUnitario: 0.904977, precioUnitario: 0.9, valorReferencialUnitario: null, porcentajeIgv: 0, baseImponible: 904.98, igv: 0, valorVenta: 904.98 },
                { orden: 2, descripcion: 'Cortesía', unidad: 'NIU', cantidad: 1, tipoAfectacionIgv: '15', gratuita: true, valorUnitario: 0, precioUnitario: 0, valorReferencialUnitario: 10, porcentajeIgv: 10.5, baseImponible: 10, igv: 1.05, valorVenta: 10 },
            ],
            totales: { gravadas: 0, exoneradas: 904.98, inafectas: 0, gratuitas: 10, igvGratuitas: 1.05, igv: 0, valorVenta: 904.98, importeTotal: 904.98 },
            leyendas: [],
            formaPago: { tipo: 'Contado', montoPendiente: 0, cuotas: [] },
            mediosPago: [],
        });
        expect(xml).toContain('>9997<');
        expect(xml).toContain('>9996<');
        expect(xml).toContain('>0.904977<');
        expect(xml).toContain('>9997<');
        const nota = construir({
            ...base,
            tipo: '07',
            serie: 'BC01',
            referencia: { tipo: '03', serie: 'B001', numero: '00000001', motivoCodigo: '01', motivoTexto: 'Anulación de la operación' },
            items: [{ orden: 1, descripcion: 'Ceviche', unidad: 'NIU', cantidad: 1, tipoAfectacionIgv: '10', gratuita: false, valorUnitario: 9, precioUnitario: 10, baseImponible: 9, igv: 1, valorVenta: 9 }],
            totales: { gravadas: 9, exoneradas: 0, inafectas: 0, gratuitas: 0, igv: 1, valorVenta: 9, importeTotal: 10 },
            receptor: { tipoDoc: '1', numDoc: '45678912', nombre: 'Ana Ruiz', direccion: '' },
            leyendas: [],
        });
        expect(nota).not.toContain('FormaPago');
    });

    test('descuento de línea y global, y crédito con cuota', () => {
        const calc = calcular({
            tipoComprobante: '01',
            items: [{ descripcion: 'Lomo', cantidad: 1, precioUnitario: 100, descuento: { monto: 10 } }],
            descuentoGlobal: { monto: 5 },
            formaPago: { tipo: 'Credito', cuotas: [{ monto: 85, fechaVencimiento: '2026-12-01' }] },
            config: { tasaIgv: 10.5, preciosIncluyenIGV: true, fechaEmision: '2026-11-07' },
        });
        const xml = construir({
            ...base,
            tipo: '01',
            serie: 'F001',
            tipoOperacion: '0101',
            moneda: 'PEN',
            receptor: { tipoDoc: '6', numDoc: '20131312955', nombre: 'ACME SAC', direccion: 'Lima' },
            items: calc.items,
            totales: calc.totales,
            descuentoGlobal: calc.descuentoGlobal,
            formaPago: calc.formaPago,
            leyendas: [],
            mediosPago: [],
            porcentajeIgv: 10.5,
        });
        expect(xml).toContain('AllowanceChargeReasonCode');
        expect(xml).toContain('>00<');
        expect(xml).toContain('>02<');
        expect(xml).toContain('>Cuota001<');
        expect(xml).toContain('<cbc:PaymentMeansID>Credito</cbc:PaymentMeansID>');
        expect(calc.totales.importeTotal).toBeCloseTo(85, 2);
    });

    test('la nota de anulación no lleva forma de pago y la parcial no copia el total', () => {
        const origen = {
            porcentajeIgv: 10.5,
            preciosIncluyenIGV: true,
            totales: { importeTotal: 30 },
            items: [
                { orden: 1, descripcion: 'Ceviche', unidad: 'NIU', cantidad: 2, precioUnitario: 10, tipoAfectacionIgv: '10', gratuita: false },
                { orden: 2, descripcion: 'Chicha', unidad: 'NIU', cantidad: 1, precioUnitario: 10, tipoAfectacionIgv: '10', gratuita: false },
            ],
        };
        const parcial = cuerpoNota(origen, '07', { lineas: [{ orden: 2, cantidad: 1 }] });
        expect(parcial.totales.importeTotal).toBeLessThan(30);
        const xml = construir({
            ...base,
            tipo: '07',
            serie: 'BC01',
            referencia: { tipo: '03', serie: 'B001', numero: '00000001', motivoCodigo: '01', motivoTexto: 'Anulación de la operación' },
            items: origen.items.map((item, i) => ({ ...item, orden: i + 1, valorUnitario: 9, baseImponible: 9, igv: 1, valorVenta: 9, precioUnitario: 10 })),
            totales: { gravadas: 18, exoneradas: 0, inafectas: 0, gratuitas: 0, igv: 2, valorVenta: 18, importeTotal: 20 },
            receptor: { tipoDoc: '1', numDoc: '45678912', nombre: 'Ana Ruiz', direccion: '' },
            leyendas: [],
            formaPago: { tipo: 'Contado' },
        });
        expect(xml).not.toContain('FormaPago');
        expect(() => cuerpoNota(origen, '13', {})).toThrow(ErrorNota);
    });
});

describe('envío y reconciliación', () => {
    test('un ticket ya guardado no crea otro resumen', async () => {
        const posts = [];
        const sunat = new SunatDirecto({
            persistirLote: false,
            reservarEnvio: async () => ({ id: 'RC-20261107-9', numero: 9 }),
            firmar: (xml) => ({ xml, hash: 'abc' }),
            post: async (soap) => { posts.push(soap); return '<ticket>T-1</ticket>'; },
        });
        const primero = await sunat.emitir({ ...base, idCompleto: 'B001-00000008', envio: {} });
        expect(primero.codigo).toBe('98');
        expect(primero.ticket).toBe('T-1');
        sunat.post = async (soap) => { posts.push(soap); return '<ticket>98</ticket><cbc:statusCode>98</cbc:statusCode>'; };
        const segundo = await sunat.emitir({ ...base, envio: { ticket: 'T-1' } });
        expect(segundo.codigo).toBe('98');
        expect(posts.some((p) => p.includes('getStatus'))).toBe(true);
        expect(posts.filter((p) => p.includes('sendSummary'))).toHaveLength(1);
    });

    test('la baja pendiente se consulta y un rechazo no la deja de baja', async () => {
        const pendiente = { estado: 'BAJA_PENDIENTE', idCompleto: 'F001-1', envio: { ticket: 'T-9', baja: { estadoAnterior: 'ACEPTADO' } } };
        expect(candidatos([pendiente])).toHaveLength(1);
        const guardados = [];
        await reconciliar([pendiente], {
            proveedor: { consultarTicket: async () => ({ codigo: '2335', descripcion: 'rechazo' }) },
            guardar: async (doc) => guardados.push(doc.estado),
        });
        expect(pendiente.estado).toBe('ACEPTADO');
        expect(pendiente.envio.baja.estado).toBe('RECHAZADA');
        expect(guardados).toEqual(['ACEPTADO']);
    });
});
