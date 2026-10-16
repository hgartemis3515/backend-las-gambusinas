const { emitir, ErrorEmision } = require('../../src/facturacion/services/emisionService');
const { validarCliente, esRucValido } = require('../../src/facturacion/services/validacionCliente');
const { procesarFirmarEnviar, interpretarCdr } = require('../../src/facturacion/jobs/firmarEnviar.worker');
const MockFiscalAdapter = require('../../src/facturacion/providers/mockFiscal.adapter');
const ProveedorFiscal = require('../../src/facturacion/providers/ProveedorFiscal');

const RUC_EMISOR = '20131312955';
const CFG = {
    emisor: { ruc: RUC_EMISOR, razonSocial: 'LAS GAMBUSINAS SAC', nombreComercial: 'Las Gambusinas', direccion: 'Av. Lima 123', ubigeo: '150101', codigoEstablecimiento: '0000' },
    tasaIgv: 18,
    preciosIncluyenIGV: true,
    series: { '01': 'F001', '03': 'B001' },
    limiteBoletaAnonima: 700,
    plazoEnvioDias: 3,
    afectacionCortesia: '15',
};

describe('validacionCliente', () => {
    test('RUC módulo 11', () => {
        expect(esRucValido(RUC_EMISOR)).toBe(true);
        expect(esRucValido('20131312954')).toBe(false);
        expect(esRucValido('3013131295')).toBe(false);
    });

    test('factura exige RUC válido, razón social y dirección', () => {
        expect(() => validarCliente('01', { numDoc: '12345678', nombre: 'X', direccion: 'Y' }, 10)).toThrow(/RUC/);
        expect(() => validarCliente('01', { numDoc: RUC_EMISOR, nombre: 'ACME' }, 10)).toThrow(/dirección/);
        expect(validarCliente('01', { numDoc: RUC_EMISOR, nombre: 'ACME', direccion: 'Lima' }, 10).tipoDoc).toBe('6');
    });

    test('boleta anónima hasta S/ 700; por encima exige documento', () => {
        expect(validarCliente('03', null, 700)).toMatchObject({ tipoDoc: '0', numDoc: '-', nombre: 'CLIENTES VARIOS' });
        expect(() => validarCliente('03', null, 700.01)).toThrow(/documento/);
        expect(validarCliente('03', { numDoc: '45678912', nombre: 'Ana' }, 900)).toMatchObject({ tipoDoc: '1' });
        expect(() => validarCliente('03', { numDoc: '4567891', nombre: 'Ana' }, 900)).toThrow(/DNI/);
    });
});

/** Dependencias falsas para emitir sin Mongo/Redis. */
function crearDeps({ encolar } = {}) {
    let ultimo = 0;
    const creados = [];
    return {
        creados,
        deps: {
            obtenerConfig: async () => CFG,
            iniciarSesion: async () => ({
                withTransaction: async (fn) => fn(),
                inTransaction: () => true,
                endSession: async () => {},
            }),
            SerieModelo: {
                findOneAndUpdate: async () => { ultimo += 1; return { ultimoNumero: ultimo }; },
            },
            Modelo: {
                create: async ([datos]) => {
                    const doc = { _id: `id${creados.length + 1}`, ...datos, toObject() { return { ...this }; } };
                    creados.push(doc);
                    return [doc];
                },
                updateOne: async () => ({}),
            },
            encolar: encolar || (async (doc) => ({ encolado: true, jobId: doc.idCompleto })),
        },
    };
}

describe('emisionService.emitir', () => {
    const solicitud = {
        tipo: '03',
        items: [{ descripcion: 'Ceviche', cantidad: 2, precioUnitario: 35.5 }],
        pagos: [{ medio: 'tarjeta_credito', monto: 71 }],
        cajero: 'caja1',
    };

    test('emite EMITIDO_LOCAL, encola con jobId = SERIE-NUMERO y responde < 250 ms', async () => {
        const { deps, creados } = crearDeps();
        const r = await emitir(solicitud, deps);
        expect(r.comprobante).toMatchObject({ serie: 'B001', numero: '00000001', idCompleto: 'B001-00000001', estado: 'EMITIDO_LOCAL' });
        expect(r.comprobante.totales.importeTotal).toBe(71);
        expect(r.comprobante.mediosPago[0].codigoSunat).toBe('006');
        expect(r.cola).toEqual({ encolado: true, jobId: 'B001-00000001' });
        expect(r.duracionMs).toBeLessThan(250);
        expect(creados[0].envio.fechaLimite.getTime() - creados[0].fechaEmision.getTime()).toBe(3 * 24 * 3600 * 1000);
    });

    test('si Redis falla, el cobro sigue y el comprobante queda para reconciliación', async () => {
        const { deps } = crearDeps({ encolar: async (d) => ({ encolado: false, jobId: d.idCompleto, motivo: 'TIMEOUT_REDIS' }) });
        const r = await emitir(solicitud, deps);
        expect(r.comprobante.estado).toBe('EMITIDO_LOCAL');
        expect(r.cola.encolado).toBe(false);
    });

    test('rechaza tipos no emitibles desde POS y boletas > 700 anónimas', async () => {
        const { deps } = crearDeps();
        await expect(emitir({ ...solicitud, tipo: '07' }, deps)).rejects.toBeInstanceOf(ErrorEmision);
        await expect(emitir({
            tipo: '03',
            items: [{ descripcion: 'Banquete', cantidad: 1, precioUnitario: 800 }],
        }, deps)).rejects.toMatchObject({ codigo: 'BOLETA_REQUIERE_DOCUMENTO' });
    });
});

describe('ProveedorFiscal y mock', () => {
    test('la interfaz es abstracta', () => {
        expect(() => new ProveedorFiscal()).toThrow(/abstracta/);
    });

    test('mock simula ~150 ms y devuelve CDR 0 con hash SHA-256 base64', async () => {
        const mock = new MockFiscalAdapter();
        const t0 = Date.now();
        const r = await mock.emitir({ ruc: RUC_EMISOR, tipo: '03', serie: 'B001', numero: '00000001', totales: {}, items: [] });
        expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
        expect(r.codigo).toBe('0');
        expect(r.aceptado).toBe(true);
        expect(Buffer.from(r.hash, 'base64')).toHaveLength(32);
    });
});

describe('worker firmar-enviar', () => {
    /** Documento falso con la API mínima de Mongoose usada por el worker. */
    function crearDoc(estado = 'EMITIDO_LOCAL') {
        return {
            _id: 'c1', idCompleto: 'B001-00000001', ruc: RUC_EMISOR, tipo: '03', serie: 'B001', numero: '00000001',
            estado, hash: null, xml: {}, cdr: {}, envio: { intentos: 0 }, auditoria: [],
            totales: {}, items: [],
            toObject() { return this; },
            auditar(accion) { this.auditoria.push(accion); },
            save: jest.fn(async function save() { return this; }),
        };
    }
    const job = { data: { comprobanteId: 'c1', idCompleto: 'B001-00000001' } };

    test('acepta y guarda hash + CDR', async () => {
        const doc = crearDoc();
        const r = await procesarFirmarEnviar(job, {
            Modelo: { findById: async () => doc },
            proveedor: new MockFiscalAdapter({ latenciaMs: 0 }),
            notificar: jest.fn(),
        });
        expect(r.estado).toBe('ACEPTADO');
        expect(doc.hash).toBeTruthy();
        expect(doc.cdr.codigo).toBe('0');
        expect(doc.envio.intentos).toBe(1);
    });

    test('error de red: PENDIENTE_ENVIO, registra error y relanza para reintento', async () => {
        const doc = crearDoc();
        await expect(procesarFirmarEnviar(job, {
            Modelo: { findById: async () => doc },
            proveedor: new MockFiscalAdapter({ latenciaMs: 0, fallarCon: new Error('ECONNRESET') }),
            notificar: jest.fn(),
        })).rejects.toThrow('ECONNRESET');
        expect(doc.estado).toBe('PENDIENTE_ENVIO');
        expect(doc.envio.ultimoError).toBe('ECONNRESET');
        expect(doc.save).toHaveBeenCalled();
    });

    test('idempotente: no reenvía comprobantes ya aceptados', async () => {
        const doc = crearDoc('ACEPTADO');
        const proveedor = { emitir: jest.fn(), nombre: 'x' };
        const r = await procesarFirmarEnviar(job, { Modelo: { findById: async () => doc }, proveedor });
        expect(r.omitido).toBe(true);
        expect(proveedor.emitir).not.toHaveBeenCalled();
    });

    test('interpretación de códigos CDR', () => {
        expect(interpretarCdr({ codigo: '0' }).estado).toBe('ACEPTADO');
        expect(interpretarCdr({ codigo: '0', observaciones: ['4287'] }).estado).toBe('ACEPTADO_OBS');
        expect(interpretarCdr({ codigo: '2017' })).toEqual({ estado: 'RECHAZADO', reintentar: false });
        expect(interpretarCdr({ codigo: '0109' })).toEqual({ estado: 'PENDIENTE_ENVIO', reintentar: true });
        expect(interpretarCdr({ codigo: '4252' }).estado).toBe('ACEPTADO_OBS');
    });
});
