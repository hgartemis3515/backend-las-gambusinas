/**
 * Tests del módulo de exportación / vista de platos asignados.
 *
 * Cubre:
 *   1. isReglaAsignada: casos canónicos.
 *   2. construirPlatosAsignadosDTO: enriquecimiento + orden + filtro.
 *   3. filtrarPerfilesPorAlcance: 'calendario' vs 'todos' + fallback.
 *
 * No toca IO: solo funciones puras del service.
 */

// Mocks de mongoose y modelos para poder importar el service sin levantar esquemas.
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
jest.mock('../src/database/models/asignacionAutomatica.model', () => ({
    findById: jest.fn(), findOne: jest.fn(), find: jest.fn(), aggregate: jest.fn(),
    findByIdAndUpdate: jest.fn(), findOneAndUpdate: jest.fn(), create: jest.fn(),
    obtenerConfiguracion: jest.fn(), CONFIG_ID: 'asignacion_automatica_unica', CONFIGURACION_DEFAULT: {}
}));
jest.mock('../src/database/models/configCocinero.model', () => ({ findOne: jest.fn(() => ({ select: jest.fn().mockResolvedValue(null) })) }));
jest.mock('../src/database/models/zona.model', () => { function Zona() {} Zona.find = jest.fn(); Zona.prototype.debeMostrarPlato = jest.fn(() => true); return Zona; });
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const service = require('../src/services/asignacionAutomaticaService');
const { isReglaAsignada, construirPlatosAsignadosDTO, filtrarPerfilesPorAlcance } = service;

const C1 = '60a1b2c3d4e5f60001aabb01';
const C2 = '60a1b2c3d4e5f60001aabb02';
const C3 = '60a1b2c3d4e5f60001aabb03';

function regla(over = {}) {
    return {
        platoId: 1, activo: true, cocineroPrimarioId: null, backups: [],
        maxMismoPlato: null, estrategia: null, notas: '', ...over
    };
}

function perfil(id, nombre, reglasPlato, over = {}) {
    return { id, nombre, descripcion: '', color: '#D4AF37', activo: true, reglasPorPlato: reglasPlato, reglasPorCategoria: [], ...over };
}

describe('isReglaAsignada', () => {
    test('false si no hay primario ni backups', () => {
        expect(isReglaAsignada(regla())).toBe(false);
    });
    test('true con solo primario', () => {
        expect(isReglaAsignada(regla({ cocineroPrimarioId: C1 }))).toBe(true);
    });
    test('true con solo backups', () => {
        expect(isReglaAsignada(regla({ backups: [{ cocineroId: C2, orden: 0 }] }))).toBe(true);
    });
    test('false si está inactiva aunque tenga primario', () => {
        expect(isReglaAsignada(regla({ activo: false, cocineroPrimarioId: C1 }))).toBe(false);
    });
    test('false si backups vacío y sin primario', () => {
        expect(isReglaAsignada(regla({ backups: [] }))).toBe(false);
    });
    test('true con ambos (primario + backups)', () => {
        expect(isReglaAsignada(regla({ cocineroPrimarioId: C1, backups: [{ cocineroId: C2, orden: 0 }] }))).toBe(true);
    });
    test('false para null/undefined', () => {
        expect(isReglaAsignada(null)).toBe(false);
        expect(isReglaAsignada(undefined)).toBe(false);
    });
});

describe('construirPlatosAsignadosDTO', () => {
    const platosMap = new Map([
        ['1', { nombre: 'Lomo saltado', categoria: 'Parrilla' }],
        ['2', { nombre: 'Ají de gallina', categoria: 'Criolla' }],
        ['3', { nombre: 'Causa limeña', categoria: 'Criolla' }]
    ]);
    const cocinerosMap = new Map([
        [C1, { nombre: 'Martha', alias: 'Mar' }],
        [C2, { nombre: 'Ana', alias: 'Ani' }],
        [C3, { nombre: 'José', alias: 'Pepe' }]
    ]);

    test('filtra reglas no asignadas (sin cocinero)', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({ platoId: 1, cocineroPrimarioId: C1 }),
            regla({ platoId: 2 }) // sin cocinero → fuera
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out).toHaveLength(1);
        expect(out[0].platoId).toBe(1);
    });

    test('filtra reglas inactivas', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({ platoId: 1, activo: false, cocineroPrimarioId: C1 })
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out).toHaveLength(0);
    });

    test('enriquece primario y backups con nombres/alias', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({
                platoId: 1,
                cocineroPrimarioId: C1,
                backups: [{ cocineroId: C2, orden: 1 }, { cocineroId: C3, orden: 0 }]
            })
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out[0].cocineroPrimarioNombre).toBe('Mar');
        expect(out[0].backups).toHaveLength(2);
        // ordenados por orden: Pepe(0) antes que Ani(1)
        expect(out[0].backups[0].nombre).toBe('Pepe');
        expect(out[0].backups[1].nombre).toBe('Ani');
        expect(out[0].backupsNombres).toBe('Pepe; Ani');
    });

    test('ordena por categoría y luego nombre de plato', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({ platoId: 1, cocineroPrimarioId: C1 }), // Parrilla, Lomo
            regla({ platoId: 3, cocineroPrimarioId: C1 }), // Criolla, Causa
            regla({ platoId: 2, cocineroPrimarioId: C1 })  // Criolla, Ají
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out.map(f => f.platoId)).toEqual([2, 3, 1]); // Ají, Causa, Lomo
    });

    test('plato sin catálogo muestra Plato #id y no se omite', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({ platoId: 999, cocineroPrimarioId: C1 })
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out).toHaveLength(1);
        expect(out[0].nombrePlato).toBe('Plato #999');
        expect(out[0].categoria).toBe('');
    });

    test('cocinero borrado muestra texto explicativo', () => {
        const p = perfil('p1', 'Almuerzo', [
            regla({ platoId: 1, cocineroPrimarioId: '000000000000000000000099' })
        ]);
        const out = construirPlatosAsignadosDTO(p, platosMap, cocinerosMap);
        expect(out[0].cocineroPrimarioNombre).toMatch(/Cocinero eliminado/);
    });

    test('perfil vacío o sin reglas → []', () => {
        expect(construirPlatosAsignadosDTO(null, platosMap, cocinerosMap)).toEqual([]);
        expect(construirPlatosAsignadosDTO(perfil('p1', 'X', []), platosMap, cocinerosMap)).toEqual([]);
    });
});

describe('filtrarPerfilesPorAlcance', () => {
    const config = {
        perfiles: [
            perfil('p1', 'Almuerzo', []),
            perfil('p2', 'Cena', []),
            perfil('p3', 'Fin de semana', [])
        ],
        calendario: {
            bloques: [
                { perfilId: 'p1', diasSemana: [1, 2, 3, 4, 5], horaInicio: '08:00', horaFin: '12:00', activo: true },
                { perfilId: 'p3', diasSemana: [0, 6], horaInicio: '12:00', horaFin: '22:00', activo: true },
                { perfilId: 'p2', diasSemana: [1, 2, 3, 4, 5], horaInicio: '17:00', horaFin: '22:00', activo: false } // inactivo
            ]
        }
    };

    test('alcance "calendario": solo perfiles en bloques activos', () => {
        const out = filtrarPerfilesPorAlcance(config, 'calendario');
        const ids = out.map(p => p.id).sort();
        expect(ids).toEqual(['p1', 'p3']);
    });

    test('alcance "todos": devuelve todos', () => {
        const out = filtrarPerfilesPorAlcance(config, 'todos');
        expect(out).toHaveLength(3);
    });

    test('fallback a todos si calendario sin bloques', () => {
        const cfg = { ...config, calendario: { bloques: [] } };
        const out = filtrarPerfilesPorAlcance(cfg, 'calendario');
        expect(out).toHaveLength(3);
    });

    test('fallback a todos si no hay bloques activos', () => {
        const cfg = {
            perfiles: config.perfiles,
            calendario: {
                bloques: [{ perfilId: 'p1', diasSemana: [1], horaInicio: '08:00', horaFin: '12:00', activo: false }]
            }
        };
        const out = filtrarPerfilesPorAlcance(cfg, 'calendario');
        expect(out).toHaveLength(3);
    });
});
