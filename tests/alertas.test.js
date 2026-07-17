/**
 * Tests: Sistema de Alertas — targeting y creación.
 *
 * Cubre el escenario clave: una alerta dirigida a una cocinera (Martha) debe
 * resolver solo SU(S) pantalla(s) y no emitir a otras.
 */

jest.mock('../src/database/models/alerta.model', () => {
  const created = [];
  return {
    create: jest.fn(async (doc) => {
      const _doc = {
        _id: `alerta-${created.length + 1}`,
        ...doc,
        acks: [],
        save: jest.fn(async function () { return this; })
      };
      created.push(_doc);
      return _doc;
    }),
    findById: jest.fn(async (id) => created.find(a => a._id === id) || null),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
    find: jest.fn(async () => []),
    _created: created,
    _reset: () => { created.length = 0; }
  };
});

jest.mock('../src/database/models/pantallaCocina.model', () => {
  const todas = [
    { numeroPantalla: 1, cocineroId: 'coc-ana' },
    { numeroPantalla: 2, cocineroId: 'coc-luis' },
    { numeroPantalla: 3, cocineroId: 'coc-martha' },
    { numeroPantalla: 4, cocineroId: 'coc-juana' },
    { numeroPantalla: 5, cocineroId: 'coc-pedro' },
    { numeroPantalla: 6, cocineroId: 'coc-rosa' },
    { numeroPantalla: 7, cocineroId: 'coc-tom' },
    { numeroPantalla: 8, cocineroId: 'coc-eva' }
  ];
  const chainable = (rows) => ({
    select: jest.fn(() => ({ lean: jest.fn(async () => rows) })),
    lean: jest.fn(async () => rows)
  });
  return {
    find: jest.fn((q) => {
      let rows;
      if (q?.cocineroId?.$in) {
        const wanted = q.cocineroId.$in.map(String);
        rows = todas.filter(p => wanted.includes(String(p.cocineroId)));
      } else if (q?.numeroPantalla?.$in) {
        rows = todas.filter(p => q.numeroPantalla.$in.includes(p.numeroPantalla));
      } else if (q?.$or) {
        rows = todas.filter(p =>
          q.$or.some(cl => cl.cocineroId?.$in?.includes(p.cocineroId) || cl.numeroPantalla?.$in?.includes(p.numeroPantalla))
        );
      } else {
        rows = todas;
      }
      return chainable(rows);
    })
  };
});

jest.mock('../src/database/models/mozos.model', () => {
  const chainable = (rows) => ({
    select: jest.fn(() => ({ lean: jest.fn(async () => rows) })),
    lean: jest.fn(async () => rows)
  });
  return {
    find: jest.fn((q) => {
      if (q?.rol?.$in) {
        return chainable(q.rol.$in.map((r, i) => ({ _id: `user-${r}-${i}`, rol: r })));
      }
      return chainable(Array.from({ length: 10 }, (_, i) => ({ _id: `user-${i}`, rol: 'mozos' })));
    })
  };
});

const Alerta = require('../src/database/models/alerta.model');
const alertaService = require('../src/services/alertaService');

beforeEach(() => {
  jest.clearAllMocks();
  Alerta._reset();
  global.io = {
    of: () => ({
      to: () => ({ emit: jest.fn() }),
      emit: jest.fn()
    })
  };
});

describe('Alertas — resolverTargeting', () => {
  test('Targeting por cocinera resuelve SOLO su pantalla', async () => {
    const r = await alertaService.resolverTargeting({
      modo: 'seleccion',
      cocineras: ['coc-martha']
    });

    expect(r.todos).toBe(false);
    expect(r.numerosPantalla).toEqual([3]); // Martha = pantalla 3
    expect(r.usuarioIds).toContain('coc-martha');
    // No debe incluir a otras cocineras
    expect(r.usuarioIds).not.toContain('coc-ana');
    expect(r.numerosPantalla).not.toContain(1);
    expect(r.numerosPantalla).not.toContain(2);
  });

  test('Targeting por número de pantalla directo', async () => {
    const r = await alertaService.resolverTargeting({
      modo: 'seleccion',
      numerosPantalla: [5, 7]
    });
    expect(r.numerosPantalla).toEqual(expect.arrayContaining([5, 7]));
    expect(r.numerosPantalla.length).toBe(2);
  });

  test('Targeting "todos" resuelve todas las pantallas y usuarios', async () => {
    const r = await alertaService.resolverTargeting({ modo: 'todos', todos: true });
    expect(r.todos).toBe(true);
    expect(r.numerosPantalla.length).toBe(8);
    expect(r.usuarioIds.length).toBeGreaterThan(0);
  });

  test('Targeting por rol resuelve usuarios con ese rol', async () => {
    const r = await alertaService.resolverTargeting({
      modo: 'seleccion',
      roles: ['cocinero', 'mozos']
    });
    expect(r.usuarioIds.length).toBe(2); // un user por rol (mock)
  });

  test('Sin destinatarios válidos lanza error al crear', async () => {
    await expect(alertaService.crearAlerta({
      remitenteId: 'admin-1',
      remitenteNombre: 'Admin',
      texto: 'Hola',
      targeting: { modo: 'seleccion' } // sin nada
    })).rejects.toThrow(/destinatarios/i);
  });
});

describe('Alertas — crearAlerta', () => {
  test('Crea alerta a Martha con estilo por defecto', async () => {
    const { alerta, resolucion } = await alertaService.crearAlerta({
      remitenteId: 'admin-1',
      remitenteNombre: 'Admin',
      texto: 'Martha: priorizar mesa 12',
      prioridadCodigo: 'urgente',
      targeting: { modo: 'seleccion', cocineras: ['coc-martha'] }
    });

    expect(alerta.texto).toBe('Martha: priorizar mesa 12');
    expect(alerta.prioridadCodigo).toBe('urgente');
    expect(alerta.prioridad).toBe(9);
    expect(alerta.estado).toBe('activa');
    expect(alerta.estilo.colorHex).toBe('#e74c3c');
    expect(alerta.estilo.sonidoClave).toBe('sirena');
    expect(resolucion.numerosPantalla).toEqual([3]);
  });

  test('Normaliza duración fuera de rango', async () => {
    const { alerta } = await alertaService.crearAlerta({
      remitenteId: 'admin-1',
      remitenteNombre: 'Admin',
      texto: 'Test',
      targeting: { modo: 'seleccion', cocineras: ['coc-martha'] },
      estilo: { duracionMs: 999999 }
    });
    expect(alerta.estilo.duracionMs).toBeLessThanOrEqual(120000);
    expect(alerta.expiraAt.getTime() - alerta.emitidaAt.getTime()).toBeLessThanOrEqual(120000);
  });

  test('RequiereAck no auto-cierra (flag persistido)', async () => {
    const { alerta } = await alertaService.crearAlerta({
      remitenteId: 'admin-1',
      remitenteNombre: 'Admin',
      texto: 'Ack requerido',
      targeting: { modo: 'seleccion', cocineras: ['coc-martha'] },
      estilo: { requiereAck: true }
    });
    expect(alerta.estilo.requiereAck).toBe(true);
  });
});

describe('Alertas — cancelar y ack', () => {
  test('Cancelar marca estado cancelada', async () => {
    const { alerta } = await alertaService.crearAlerta({
      remitenteId: 'admin-1', remitenteNombre: 'Admin',
      texto: 'Cancelar', targeting: { modo: 'seleccion', cocineras: ['coc-martha'] }
    });
    Alerta.findById.mockResolvedValueOnce(alerta);
    const r = await alertaService.cancelarAlerta(alerta._id, 'admin-1');
    expect(r.alerta.estado).toBe('cancelada');
    expect(r.alerta.canceladaAt).toBeTruthy();
  });

  test('Cancelar una ya cancelada no cambia', async () => {
    const { alerta } = await alertaService.crearAlerta({
      remitenteId: 'admin-1', remitenteNombre: 'Admin',
      texto: 'X', targeting: { modo: 'seleccion', cocineras: ['coc-martha'] }
    });
    alerta.estado = 'cancelada';
    Alerta.findById.mockResolvedValueOnce(alerta);
    const r = await alertaService.cancelarAlerta(alerta._id);
    expect(r.yaCancelada).toBe(true);
  });

  test('ackAlerta registra el ack', async () => {
    await alertaService.ackAlerta('alerta-1', { usuarioId: 'coc-martha' });
    expect(Alerta.updateOne).toHaveBeenCalled();
  });
});

describe('Alertas — escenario 8 monitores', () => {
  test('Alerta a Martha NO resuelve pantallas de otras cocineras', async () => {
    const r = await alertaService.resolverTargeting({
      modo: 'seleccion',
      cocineras: ['coc-martha']
    });
    // Solo pantalla 3 (Martha)
    expect(r.numerosPantalla).toEqual([3]);
    // Las otras 7 pantallas no están
    [1, 2, 4, 5, 6, 7, 8].forEach(n => {
      expect(r.numerosPantalla).not.toContain(n);
    });
  });

  test('Alerta a todos SÍ resuelve las 8 pantallas', async () => {
    const r = await alertaService.resolverTargeting({ modo: 'todos', todos: true });
    expect(r.numerosPantalla.length).toBe(8);
  });
});
