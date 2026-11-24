const path = require('path');
const express = require('express');
const request = require('supertest');
const {
    corteAntiguedad,
    validarPaquete,
    resumenPaquete,
    nombreSeguro,
    enRango,
    TZ,
    FORMATO,
    VERSION,
    NUNCA_BORRA,
    COLECCIONES,
    ARCHIVOS_JSON_PURGA,
    conservarRegistroJson,
    recortarListaJson,
} = require('../src/utils/archivoCaja');

describe('archivoCaja', () => {
    test('el corte es 7 días atrás en Lima', () => {
        const ahora = new Date('2026-09-24T23:30:00-05:00');
        expect(TZ).toBe('America/Lima');
        expect(corteAntiguedad(ahora)).toEqual(new Date('2026-09-17T23:30:00-05:00'));
    });

    test('rechaza archivos que no son de caja y claves ajenas', () => {
        expect(validarPaquete({ formato: 'otro', version: 1, colecciones: {} }).ok).toBe(false);
        const malo = validarPaquete({
            formato: FORMATO,
            version: VERSION,
            colecciones: { platos: [] },
        });
        expect(malo.ok).toBe(false);
        expect(malo.error).toMatch(/platos/);
    });

    test('verifica el rango de fechas de un exportado', () => {
        const paquete = {
            formato: FORMATO,
            version: VERSION,
            colecciones: {
                comandas: [
                    { _id: 'a', createdAt: '2026-09-01T12:00:00.000Z' },
                    { _id: 'b', createdAt: '2026-09-10T12:00:00.000Z' },
                ],
            },
        };
        expect(validarPaquete(paquete).ok).toBe(true);
        const filas = resumenPaquete(paquete, '2026-09-01', '2026-09-02');
        const comandas = filas.find((f) => f.clave === 'comandas');
        expect(comandas.total).toBe(2);
        expect(comandas.enRango).toBe(1);
        expect(enRango(paquete.colecciones.comandas[1], 'createdAt', '2026-09-09', '2026-09-11')).toBe(true);
    });

    test('el nombre de archivo no sale de EXPORTADOS', () => {
        expect(nombreSeguro('../.env')).toBeNull();
        expect(nombreSeguro('caja-20260924-040000.json')).toBe('caja-20260924-040000.json');
        expect(NUNCA_BORRA.some((s) => /platos|usuarios|configuraci/i.test(s))).toBe(true);
        expect(COLECCIONES.some((c) => c.clave === 'platos')).toBe(false);
        expect(COLECCIONES.some((c) => c.clave === 'comandas')).toBe(true);
    });

    test('el JSON de data suelta lo de más de 7 días y no toca catálogo', () => {
        const corte = new Date('2026-09-17T05:00:00.000Z');
        const lista = [
            { _id: 'vieja', createdAt: '2026-09-01T12:00:00.000Z' },
            { _id: 'nueva', createdAt: '2026-09-20T12:00:00.000Z' },
            { _id: 'sindato' },
        ];
        const recorte = recortarListaJson(lista, { corte, fecha: 'createdAt', idsBorrar: new Set() });
        expect(recorte.antes).toBe(3);
        expect(recorte.lista.map((d) => d._id)).toEqual(['nueva', 'sindato']);
        expect(conservarRegistroJson(
            { _id: 'c1', updatedAt: '2026-01-01T00:00:00.000Z' },
            { corte, fecha: 'updatedAt', idsBorrar: new Set(['c1']), soloIds: true }
        )).toBe(false);
        expect(conservarRegistroJson(
            { _id: 'c2', updatedAt: '2026-01-01T00:00:00.000Z' },
            { corte, fecha: 'updatedAt', idsBorrar: new Set(), soloIds: true }
        )).toBe(true);
        const archivos = ARCHIVOS_JSON_PURGA.map((a) => a.archivo);
        expect(archivos).toEqual(['boucher.json', 'auditoria.json', 'clientes.json']);
        expect(archivos.some((n) => /platos|mesas|mozos|areas/.test(n))).toBe(false);
    });
});

describe('exportación y purga manual de caja', () => {
    const ruta = '/api/archivo-caja/exportar';
    const dataDir = path.join(__dirname, '..', 'data');
    let archivos;
    let modelos;
    let fs;

    beforeEach(() => {
        jest.resetModules();
        archivos = new Map();
        fs = {
            ...jest.requireActual('fs'),
            existsSync: jest.fn((nombre) => archivos.has(nombre)),
            mkdirSync: jest.fn(),
            readFileSync: jest.fn((nombre) => {
                if (!archivos.has(nombre)) throw new Error(`Archivo de prueba ausente: ${nombre}`);
                return archivos.get(nombre);
            }),
            writeFileSync: jest.fn((nombre, datos) => archivos.set(nombre, datos)),
            renameSync: jest.fn((origen, destino) => {
                archivos.set(destino, archivos.get(origen));
                archivos.delete(origen);
            }),
        };
        jest.doMock('fs', () => fs);
        jest.doMock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
        jest.doMock('../src/middleware/adminAuth', () => ({
            adminAuthSiRuta: () => (_req, _res, next) => next(),
        }));

        modelos = {};
        for (const nombre of [
            'comanda', 'historialComandas', 'pedido', 'ticketAprobacion', 'ticketPagoAdelantado',
            'boucher', 'propina', 'cierreCaja', 'cierreCajaRestaurante', 'reserva', 'auditoriaAcciones', 'cliente',
        ]) {
            const modelo = {
                find: jest.fn(() => ({ lean: async () => [] })),
                distinct: jest.fn(async () => []),
                deleteMany: jest.fn(async ({ _id }) => ({ deletedCount: _id.$in.length })),
            };
            jest.doMock(`../src/database/models/${nombre}.model`, () => modelo);
            modelos[nombre] = modelo;
        }
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('el arranque y el paso del lunes a las 04:00 no disparan una purga', async () => {
        const inicio = jest.requireActual('fs').readFileSync(require.resolve('../index'), 'utf8');
        expect(inicio).not.toMatch(/\biniciarArchivoCajaSemanal\s*\(/);

        jest.useFakeTimers({ now: new Date('2026-09-21T03:59:00-05:00') });
        const archivo = require('../src/services/archivoCaja.service');
        archivo.iniciarArchivoCajaSemanal?.();
        await jest.advanceTimersByTimeAsync(20 * 60 * 1000);
        await archivo.revisarLunes?.();

        expect(jest.getTimerCount()).toBe(0);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        for (const modelo of Object.values(modelos)) {
            expect(modelo.find).not.toHaveBeenCalled();
            expect(modelo.deleteMany).not.toHaveBeenCalled();
        }
    });

    test('el POST confirmado archiva las comandas y purga los registros antiguos permitidos', async () => {
        const vieja = '2020-09-01T12:00:00.000Z';
        const reciente = new Date().toISOString();
        const comandaVieja = { _id: 'c1', createdAt: vieja };
        const comandaReciente = { _id: 'c2', createdAt: reciente };
        const historialViejo = { _id: 'h1', comandaId: 'c1', createdAt: vieja };
        const historialReciente = { _id: 'h2', comandaId: 'c1', createdAt: reciente };
        const voucherViejo = { _id: 'v1', createdAt: vieja };
        const voucherReciente = { _id: 'v2', createdAt: reciente };

        const findPorFecha = (docs) => ({ createdAt, comandaId }) => ({
            lean: async () => docs.filter((doc) => (
                createdAt ? new Date(doc.createdAt) < createdAt.$lt : comandaId.$in.includes(doc.comandaId)
            )),
        });
        modelos.comanda.find.mockImplementation(findPorFecha([comandaVieja, comandaReciente]));
        modelos.historialComandas.find.mockImplementation(findPorFecha([historialViejo, historialReciente]));
        modelos.boucher.find.mockImplementation(findPorFecha([voucherViejo, voucherReciente]));

        const comandasJson = path.join(dataDir, 'comandas.json');
        const comandasAntes = JSON.stringify([comandaVieja, comandaReciente], null, 2);
        archivos.set(comandasJson, comandasAntes);
        archivos.set(path.join(dataDir, 'boucher.json'), JSON.stringify([voucherViejo, voucherReciente]));

        const app = express();
        app.use('/api', express.json(), require('../src/controllers/archivoCajaController'));

        await request(app).post(ruta).expect(400);
        await request(app).post(ruta).send({ confirmar: 'true' }).expect(400);
        expect(fs.writeFileSync).not.toHaveBeenCalled();

        const { body } = await request(app).post(ruta).send({ confirmar: true }).expect(200);
        const { DIR } = require('../src/services/archivoCaja.service');
        const paquete = JSON.parse(archivos.get(path.join(DIR, body.data.archivo)));
        expect(paquete.motivo).toBe('manual');
        expect(paquete.corte).toBe(corteAntiguedad(new Date(paquete.exportadoEn)).toISOString());
        expect(paquete.colecciones.comandas).toEqual([comandaVieja]);
        expect(paquete.colecciones.historialComandas).toEqual([historialViejo]);
        expect(body.data.borrados.comandas).toBe(0);
        expect(modelos.comanda.deleteMany).not.toHaveBeenCalled();
        expect(modelos.historialComandas.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['h1'] } });
        expect(modelos.boucher.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['v1'] } });
        expect(archivos.get(comandasJson)).toBe(comandasAntes);
        expect(JSON.parse(archivos.get(path.join(dataDir, 'boucher.json')))).toEqual([voucherReciente]);
    });
});
