const { armarConfiguracionFiscal } = require('../../src/facturacion/services/configuracionFiscal');

const RUC_LOCAL = '20131312955';
const ENV_BETA = {
    SUNAT_AMBIENTE: 'beta',
    SUNAT_RUC: '20000000001',
    SUNAT_RAZON_SOCIAL: 'EMPRESA DEMO',
    FACTURACION_UBIGEO: '150101',
    FACTURACION_COD_ESTABLECIMIENTO: '0000',
};

test('el RUC y el nombre del restaurante ganan al emisor de pruebas', () => {
    const fiscal = armarConfiguracionFiscal({
        igvPorcentaje: 10.5,
        preciosIncluyenIGV: true,
        datosFiscales: {
            nombreComercial: 'SAN BENITO',
            razonSocial: '',
            ruc: RUC_LOCAL,
            direccionFiscal: 'AV SAN MARTIN 2124',
            telefono: '999888777',
            email: 'caja@sanbenito.pe',
        },
        numeracion: { serieBoleta: 'B001', serieFactura: 'F001' },
    }, ENV_BETA);

    expect(fiscal.emisor.ruc).toBe(RUC_LOCAL);
    expect(fiscal.emisor.razonSocial).toBe('SAN BENITO');
    expect(fiscal.emisor.nombreComercial).toBe('SAN BENITO');
    expect(fiscal.emisor.direccion).toBe('AV SAN MARTIN 2124');
    expect(fiscal.emisor.telefono).toBe('999888777');
    expect(fiscal.emisor.ubigeo).toBe('150101');
    expect(fiscal.listoParaEmitir).toBe(true);
    expect(fiscal.tasaIgv).toBe(10.5);
});

test('sin datos del local usa el RUC de entorno', () => {
    const fiscal = armarConfiguracionFiscal({ datosFiscales: { ruc: '123' } }, ENV_BETA);
    expect(fiscal.emisor.ruc).toBe('20000000001');
    expect(fiscal.emisor.razonSocial).toBe('EMPRESA DEMO');
});

test('sin RUC válido no queda listo para emitir', () => {
    const fiscal = armarConfiguracionFiscal({ datosFiscales: { nombreComercial: 'SAN BENITO' } }, {});
    expect(fiscal.listoParaEmitir).toBe(false);
});
