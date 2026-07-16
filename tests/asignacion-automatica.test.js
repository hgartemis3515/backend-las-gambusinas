/**
 * ASIGNACIÓN AUTOMÁTICA DE PLATOS - Tests
 *
 * Cubre:
 *   1. encontrarRegla: prioridad plato > categoría.
 *   2. construirCandidatos: primario + backups ordenados.
 *   3. seleccionarCocinero: caso base → primario.
 *   4. seleccionarCocinero: overflow 5+1 → primario saturado del mismo plato va a backup.
 *   5. seleccionarCocinero: sin candidato (todos saturados) → null + modoSinCandidato.
 *   6. seleccionarCocinero: opt-out por cocinero (acepta=false).
 *   7. seleccionarCocinero: soloCocinerosConectados descarta desconectados.
 *   8. asignarPlatosNuevos: respeta feature flag habilitada=false (no asigna).
 *
 * Estrategia: mock a Comanda, Mozos, ConfigCocinero, Zona y Plato.
 */

jest.mock('mongoose', () => {
    const m = jest.requireActual('mongoose');
    const makeModel = () => {
        const fn = function () { return {}; };
        fn.findById = jest.fn();
        fn.findOne = jest.fn();
        fn.find = jest.fn();
        fn.aggregate = jest.fn();
        fn.findByIdAndUpdate = jest.fn();
        fn.findOneAndUpdate = jest.fn();
        fn.create = jest.fn();
        fn.countDocuments = jest.fn();
        fn.CONFIG_ID = 'asignacion_automatica_unica';
        fn.CONFIGURACION_DEFAULT = {};
        fn.obtenerConfiguracion = jest.fn();
        return fn;
    };
    const registry = {};
    return {
        ...m,
        model: jest.fn((name) => {
            if (!registry[name]) registry[name] = makeModel();
            return registry[name];
        }),
        Types: { ObjectId: m.Types.ObjectId }
    };
});
jest.mock('../src/database/models/asignacionAutomatica.model', () => {
    const model = {
        findById: jest.fn(),
        findOne: jest.fn(),
        find: jest.fn(),
        aggregate: jest.fn(),
        findByIdAndUpdate: jest.fn(),
        findOneAndUpdate: jest.fn(),
        create: jest.fn(),
        obtenerConfiguracion: jest.fn(),
        CONFIG_ID: 'asignacion_automatica_unica',
        CONFIGURACION_DEFAULT: {}
    };
    return model;
});
jest.mock('../src/database/models/configCocinero.model', () => {
    const chain = {
        select: jest.fn().mockResolvedValue(null)
    };
    return {
        findOne: jest.fn(() => chain)
    };
});
jest.mock('../src/database/models/zona.model', () => {
    function Zona() {}
    Zona.find = jest.fn();
    Zona.prototype.debeMostrarPlato = jest.fn(() => true);
    return Zona;
});
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mongoose = require('mongoose');
const AsignacionAutomatica = require('../src/database/models/asignacionAutomatica.model');
const ConfigCocinero = require('../src/database/models/configCocinero.model');
const Zona = require('../src/database/models/zona.model');
const service = require('../src/services/asignacionAutomaticaService');

// ComandaMock = mongoose.model('Comanda') (instancia del registry mock)
const ComandaMock = mongoose.model('Comanda');
const MozosMock = mongoose.model('mozos');

// Helper para construir config default con overrides
function buildConfig(over = {}) {
    return {
        habilitada: true,
        defaults: {
            maxMismoPlatoPorCocinero: 5,
            maxPlatosTotalesEnCurso: 10,
            modoSinCandidato: 'dejar_sin_asignar',
            soloCocinerosConectados: false, // desactivado por defecto para tests
            respetarZonas: false,
            estrategiaDefault: 'hibrido'
        },
        reglasPorPlato: [],
        reglasPorCategoria: [],
        ...over
    };
}

function buildReglaPlato(platoId, primarioId, backups = [], over = {}) {
    return { platoId, activo: true, cocineroPrimarioId: primarioId, backups, maxMismoPlato: null, estrategia: null, notas: '', ...over };
}

const PLATO = { platoId: 42, categoria: 'Parrilla', tipo: 'plato-carta normal' };
const C1 = '60a1b2c3d4e5f60001aabb01';
const C2 = '60a1b2c3d4e5f60001aabb02';
const C3 = '60a1b2c3d4e5f60001aabb03';

describe('asignacionAutomaticaService', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        // Por defecto: sin contadores (cero en curso)
        ComandaMock.aggregate.mockResolvedValue([]);
        // opt-out: todos aceptan (select devuelve null → acepta=true por defecto)
        ConfigCocinero.findOne().select.mockResolvedValue({ autoAsignacion: { acepta: true, maxPlatosTotales: null, pausadoHasta: null } });
        // zonas: sin asignar (devuelve true)
        Zona.find.mockReturnValue({ lean: () => Promise.resolve([]) });
    });

    describe('encontrarRegla (vía seleccionarCocinero)', () => {
        it('prioriza regla por plato sobre regla por categoría', async () => {
            const config = buildConfig({
                reglasPorPlato: [buildReglaPlato(42, C1)],
                reglasPorCategoria: [{ categoria: 'Parrilla', activo: true, cocineroPrimarioId: C2, backups: [] }]
            });
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r).not.toBeNull();
            expect(r.cocineroId).toBe(C1);
            expect(r.regla).toBe('plato');
        });

        it('cae a regla por categoría si no hay regla por plato', async () => {
            const config = buildConfig({
                reglasPorCategoria: [{ categoria: 'Parrilla', activo: true, cocineroPrimarioId: C2, backups: [] }]
            });
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C2);
            expect(r.regla).toBe('categoria');
        });

        it('retorna null si no hay regla aplicable', async () => {
            const config = buildConfig();
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r).toBeNull();
        });
    });

    describe('overflow 5+1', () => {
        it('asigna al primario si tiene < 5 del mismo plato', async () => {
            const config = buildConfig({ reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])] });
            ComandaMock.aggregate
                .mockResolvedValueOnce([{ _id: null, total: 1 }])  // total en curso C1
                .mockResolvedValueOnce([{ _id: null, total: 4 }]); // mismo plato C1 = 4 (< 5)
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C1);
            expect(r.origen).toBe('auto');
        });

        it('hace overflow al backup si primario tiene >= 5 del mismo plato', async () => {
            const config = buildConfig({ reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])] });
            ComandaMock.aggregate
                .mockResolvedValueOnce([{ _id: null, total: 6 }])  // total en curso C1
                .mockResolvedValueOnce([{ _id: null, total: 5 }])  // mismo plato C1 = 5 (saturado)
                .mockResolvedValueOnce([{ _id: null, total: 2 }])  // total en curso C2 (backup)
                .mockResolvedValueOnce([{ _id: null, total: 0 }]); // mismo plato C2 = 0
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C2);
            expect(r.origen).toBe('overflow');
        });

        it('retorna null si primario y backups están saturados', async () => {
            const config = buildConfig({ reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])] });
            ComandaMock.aggregate
                .mockResolvedValue([{ _id: null, total: 5 }]); // todos saturados del mismo plato
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r).toBeNull();
            // El modoSinCandidato se respeta fuera de esta función (no asigna)
        });

        it('respeta límite total en curso (no solo mismo plato)', async () => {
            const config = buildConfig({
                defaults: { ...buildConfig().defaults, maxPlatosTotalesEnCurso: 3 },
                reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])]
            });
            ComandaMock.aggregate
                .mockResolvedValueOnce([{ _id: null, total: 3 }])  // C1 ya en su límite total
                .mockResolvedValueOnce([{ _id: null, total: 0 }])  // C2 total
                .mockResolvedValueOnce([{ _id: null, total: 0 }]); // C2 mismo plato
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C2);
            expect(r.origen).toBe('overflow');
        });
    });

    describe('opt-out por cocinero', () => {
        it('descarta primario si autoAsignacion.acepta=false y usa backup', async () => {
            const config = buildConfig({ reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])] });
            ConfigCocinero.findOne().select
                .mockResolvedValueOnce({ autoAsignacion: { acepta: false, maxPlatosTotales: null, pausadoHasta: null } }) // C1 no acepta
                .mockResolvedValue({ autoAsignacion: { acepta: true, maxPlatosTotales: null, pausadoHasta: null } });
            ComandaMock.aggregate.mockResolvedValue([{ _id: null, total: 0 }]);
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C2);
        });
    });

    describe('soloCocinerosConectados', () => {
        it('descarta cocinero inactivo (activo=false) cuando soloCocinerosConectados=true', async () => {
            const config = buildConfig({
                defaults: { ...buildConfig().defaults, soloCocinerosConectados: true },
                reglasPorPlato: [buildReglaPlato(42, C1, [{ cocineroId: C2, orden: 1 }])]
            });
            // Mock findById: C1 inactivo (activo=false), C2 activo
            const findByIdChain = (resolved) => ({ select: jest.fn().mockResolvedValue(resolved) });
            MozosMock.findById = jest.fn((id) => {
                if (id === C1) return findByIdChain({ _id: C1, activo: false, enTurno: false, zonaIds: [] });
                return findByIdChain({ _id: C2, activo: true, enTurno: false, zonaIds: [] });
            });
            ComandaMock.aggregate.mockResolvedValue([{ _id: null, total: 0 }]);
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C2);
        });

        it('tolera enTurno=false porque hoy no hay heartbeat KDS que lo setee', async () => {
            const config = buildConfig({
                defaults: { ...buildConfig().defaults, soloCocinerosConectados: true },
                reglasPorPlato: [buildReglaPlato(42, C1, [])]
            });
            const findByIdChain = (resolved) => ({ select: jest.fn().mockResolvedValue(resolved) });
            MozosMock.findById = jest.fn(() => findByIdChain({ activo: true, enTurno: false, zonaIds: [] }));
            ComandaMock.aggregate.mockResolvedValue([{ _id: null, total: 0 }]);
            const r = await service.seleccionarCocinero(config, PLATO);
            expect(r.cocineroId).toBe(C1);
        });
    });

    describe('asignarPlatosNuevos (flag global)', () => {
        it('no asigna nada si habilitada=false', async () => {
            AsignacionAutomatica.obtenerConfiguracion.mockResolvedValue(buildConfig({ habilitada: false }));
            const res = await service.asignarPlatosNuevos({ _id: 'cmd1', platos: [{ platoId: 42, estado: 'pedido' }] });
            expect(res.asignados).toBe(0);
            expect(res.noAsignados).toBe(0);
        });

        it('no asigna si no hay platos asignables (todos ya con procesandoPor)', async () => {
            AsignacionAutomatica.obtenerConfiguracion.mockResolvedValue(buildConfig());
            const res = await service.asignarPlatosNuevos({
                _id: 'cmd1',
                platos: [{ platoId: 42, estado: 'pedido', procesandoPor: { cocineroId: C1 } }]
            });
            expect(res.asignados).toBe(0);
        });
    });

    describe('simularAsignacion', () => {
        it('devuelve mensaje cuando feature flag apagado', async () => {
            AsignacionAutomatica.obtenerConfiguracion.mockResolvedValue(buildConfig({ habilitada: false }));
            const r = await service.simularAsignacion(42);
            expect(r.habilitada).toBe(false);
            expect(r.cocineroId).toBeNull();
        });
    });
});
