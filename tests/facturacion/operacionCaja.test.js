const { totalesDesdeMovimientos, cuadrarCierre } = require('../../src/facturacion/services/turnoCajaService');
const { serieDeNota, validarMotivo, ErrorNota } = require('../../src/facturacion/services/notaCreditoService');
const { coincideConsulta, firmarDescarga, leerDescarga } = require('../../src/facturacion/services/portalCpe');

describe('cuadre de turno', () => {
    const pagos = [
        { proveedor: 'efectivo', estado: 'aprobada', monto: 40, propina: 5 },
        { proveedor: 'niubiz', estado: 'aprobada', monto: 80, propina: 0 },
        { proveedor: 'culqi', estado: 'aprobada', monto: 20, propina: 2 },
        { proveedor: 'izipay', estado: 'rechazada', monto: 15, propina: 0 },
    ];
    const comprobantes = [
        { tipo: '03', estado: 'ACEPTADO' },
        { tipo: '01', estado: 'PENDIENTE_ENVIO' },
        { tipo: '07', estado: 'EMITIDO_LOCAL' },
    ];

    test('el esperado sale de pagos aprobados y la propina no se mezcla con el consumo', () => {
        const t = totalesDesdeMovimientos(pagos, comprobantes);
        expect(t).toMatchObject({
            totalEfectivoEsperado: 40,
            totalNiubizEsperado: 80,
            totalIzipayEsperado: 0,
            totalCulqiEsperado: 20,
            totalPropinas: 7,
        });
        expect(t.conteo).toEqual({ boletas: 1, facturas: 1, notasCredito: 1, pendientesEnvio: 2, rechazados: 0 });
    });

    test('un descuadre pide PIN y un cierre exacto no', () => {
        const exacto = cuadrarCierre({ efectivo: 40, niubiz: 80, izipay: 0 }, { efectivo: 40, niubiz: 80, izipay: 0 });
        expect(exacto.requierePin).toBe(false);
        const mal = cuadrarCierre({ efectivo: 40, niubiz: 80, izipay: 0 }, { efectivo: 35, niubiz: 80, izipay: 10 });
        expect(mal.requierePin).toBe(true);
        expect(mal.diferencias).toEqual({ efectivo: -5, niubiz: 0, izipay: 10 });
    });
});

describe('nota de crédito', () => {
    test('factura usa FC01, boleta usa BC01, y el motivo tiene que estar en el catálogo 09', () => {
        expect(serieDeNota('01')).toBe('FC01');
        expect(serieDeNota('03')).toBe('BC01');
        expect(validarMotivo('01')).toBe('01');
        expect(validarMotivo('06')).toBe('06');
        expect(() => validarMotivo('99')).toThrow(ErrorNota);
        expect(() => serieDeNota('07')).toThrow(ErrorNota);
    });
});

describe('consulta pública', () => {
    const doc = {
        ruc: '20131312955',
        tipo: '03',
        serie: 'B001',
        numero: '00000001',
        fechaEmision: new Date('2026-10-15T15:00:00Z'),
        totales: { importeTotal: 71 },
    };

    test('exige RUC, tipo, serie, número, fecha y total', () => {
        const ok = { rucEmisor: '20131312955', tipo: '03', serie: 'b001', numero: '1', fechaEmision: '2026-10-15', montoTotal: 71 };
        expect(coincideConsulta(doc, ok)).toBe(true);
        expect(coincideConsulta(doc, { ...ok, montoTotal: 70 })).toBe(false);
    });

    test('el enlace HMAC vence a los 15 minutos', () => {
        const ahora = Date.parse('2026-10-15T12:00:00Z');
        const token = firmarDescarga({ id: 'abc', tipo: 'xml' }, 'secreto', ahora);
        expect(leerDescarga(token, 'secreto', ahora + 1000).id).toBe('abc');
        expect(() => leerDescarga(token, 'otro', ahora)).toThrow(/inválido/);
        expect(() => leerDescarga(token, 'secreto', ahora + 16 * 60 * 1000)).toThrow(/vencido/);
    });
});
