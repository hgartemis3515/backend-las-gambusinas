const { construirPreCuenta, TITULO } = require('../../src/facturacion/services/precuentaService');
const { detectarSaltos } = require('../../src/facturacion/services/auditoriaGaps');
const { generarRvie, nombreArchivoRvie, COLUMNAS_EXCEL } = require('../../src/facturacion/services/sireRvie');
const { canjearBoletaPorFactura } = require('../../src/facturacion/services/canjeService');
const { registrarContingencia } = require('../../src/facturacion/services/contingenciaService');
const { destinoDesdeEnv } = require('../../src/facturacion/print/imprimir');

const BOLETA = {
    _id: 'b1',
    tipo: '03',
    ruc: '20131312955',
    serie: 'B001',
    numero: '00000010',
    idCompleto: 'B001-00000010',
    fechaEmision: new Date('2026-10-10T15:00:00-05:00'),
    porcentajeIgv: 18,
    preciosIncluyenIGV: true,
    emisor: { ruc: '20131312955', razonSocial: 'LAS GAMBUSINAS SAC' },
    receptor: { tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' },
    items: [{ orden: 1, descripcion: 'Ceviche', cantidad: 1 }],
    totales: { gravadas: 25.42, exoneradas: 0, inafectas: 0, igv: 4.58, cargos: 0, importeTotal: 30 },
    leyendas: [{ codigo: '1000', valor: 'TREINTA CON 00/100 SOLES' }],
    mediosPago: [{ medio: 'efectivo', codigoSunat: '001', monto: 30 }],
    canje: {},
};

function sesion() {
    return {
        withTransaction: async (fn) => fn(),
        endSession: async () => {},
        inTransaction: () => true,
    };
}

describe('pre-cuenta', () => {
    test('es control interno y no parece un comprobante', () => {
        const ticket = construirPreCuenta({
            mesa: 4,
            mozo: 'Ana',
            items: [{ cantidad: 2, descripcion: 'Ceviche', importe: 35 }],
        });
        expect(ticket.fiscal).toBe(false);
        expect(ticket.texto).toContain(TITULO);
        expect(ticket.texto).not.toContain('BOLETA DE VENTA');
        expect(ticket.texto).not.toMatch(/[BF]\d{3}-\d{8}/);
        expect(ticket.texto).toContain('S/ 35.00');
    });
});

describe('correlativos', () => {
    test('marca el número que falta entre dos emitidos', () => {
        const { faltantes, rangos } = detectarSaltos(['00000010', 12, 13]);
        expect(faltantes).toEqual([11]);
        expect(rangos).toEqual([{ desde: 11, hasta: 11, cantidad: 1 }]);
    });

    test('un anulado que existe no es hueco', () => {
        expect(detectarSaltos([1, 2, 3]).rangos).toEqual([]);
    });
});

describe('SIRE RVIE', () => {
    test('nombre oficial y columnas del contador', () => {
        const archivo = generarRvie([BOLETA], { ruc: '20131312955', anio: 2026, mes: 10 });
        expect(archivo.filename).toBe(nombreArchivoRvie({ ruc: '20131312955', anio: 2026, mes: 10 }));
        expect(archivo.filename).toBe('LE2013131295520261000140100001111.txt');
        expect(archivo.txt.split('|')).toHaveLength(36);
        expect(archivo.txt).toContain('|03|B001|00000010|');
        expect(archivo.csv.split('\n')[0]).toBe(COLUMNAS_EXCEL.join(';'));
        expect(archivo.csv).toContain('25.42');
    });
});

describe('canje boleta por factura', () => {
    test('crea NC y factura en la misma transacción y mueve el pago, sin un cobro nuevo', async () => {
        const creados = [];
        const pagos = [];
        let updates = 0;
        const resultado = await canjearBoletaPorFactura({
            boletaId: 'b1',
            cliente: { numDoc: '20131312955', nombre: 'ACME SAC', direccion: 'Lima' },
            cajero: 'caja1',
        }, {
            Modelo: {
                findById: async () => BOLETA,
                create: async (docs) => {
                    const copias = docs.map((d, i) => ({ ...d, _id: `n${creados.length + i}` }));
                    creados.push(...copias);
                    return copias;
                },
                updateOne: async (_f, op) => { updates += 1; expect(op.$set.estado).toBe('ANULADO_NC'); },
            },
            Pagos: { updateMany: async (filtro, op) => pagos.push({ filtro, op }) },
            iniciarSesion: async () => sesion(),
            reservar: async ({ tipo }) => (tipo === '07'
                ? { serie: 'BC01', numero: '00000001', idCompleto: 'BC01-00000001' }
                : { serie: 'F001', numero: '00000008', idCompleto: 'F001-00000008' }),
            encolar: async (doc) => ({ encolado: true, jobId: doc.idCompleto }),
            obtenerConfig: async () => ({ plazoEnvioDias: 3, series: { '01': 'F001' } }),
        });

        expect(creados.map((d) => d.tipo)).toEqual(['07', '01']);
        expect(creados[0].referencia.motivoCodigo).toBe('01');
        expect(creados[0].totales).toBe(BOLETA.totales);
        expect(creados[1].receptor.numDoc).toBe('20131312955');
        expect(creados[1].observacion).toContain('B001-00000010');
        expect(updates).toBe(1);
        expect(pagos).toEqual([{ filtro: { comprobante: 'b1' }, op: { $set: { comprobante: 'n1' } } }]);
        expect(resultado.factura.idCompleto).toBe('F001-00000008');
    });
});

describe('contingencia física', () => {
    test('guarda el talonario y no pide serie electrónica', async () => {
        let guardado;
        const doc = await registrarContingencia({
            ruc: '20131312955',
            serieTalonario: '0001',
            numero: '15',
            fechaEmision: '2026-10-15',
            motivo: 'corte_energia',
            items: [{ descripcion: 'Menú', cantidad: 1, importe: 25 }],
        }, {
            Modelo: { create: async (d) => { guardado = d; return d; } },
        });
        expect(doc.numero).toBe('00000015');
        expect(doc.total).toBe(25);
        expect(guardado.serieTalonario).toBe('0001');
    });
});

describe('destino de impresión', () => {
    test('lee tcp y agente desde la variable', () => {
        expect(destinoDesdeEnv('tcp://192.168.1.50:9100')).toEqual({ modo: 'tcp', host: '192.168.1.50', puerto: 9100 });
        expect(destinoDesdeEnv('agente://127.0.0.1:9101').modo).toBe('agente');
    });
});
