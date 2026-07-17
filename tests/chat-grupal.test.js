/**
 * Tests: Chat grupal (tipo "grupo") — creación, membresía y acceso.
 *
 * Mockea los modelos de Mongoose para no tocar la BD.
 */

jest.mock('../src/database/models/conversacion.model', () => {
  const store = [];
  const model = {
    create: jest.fn(async (doc) => {
      const _doc = {
        _id: `conv-${store.length + 1}`,
        ...doc,
        participantes: doc.participantes || [],
        save: jest.fn(async function () { return this; })
      };
      store.push(_doc);
      return _doc;
    }),
    findById: jest.fn(async (id) => store.find(c => c._id === id) || null),
    findOne: jest.fn(async () => null),
    updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
    find: jest.fn(async () => []),
    _store: store,
    _reset: () => { store.length = 0; }
  };
  return model;
});

jest.mock('../src/database/models/mensaje.model', () => ({
  create: jest.fn(async (d) => ({ ...d, _id: 'msg-1' })),
  updateOne: jest.fn(async () => ({ modifiedCount: 1 })),
  updateMany: jest.fn(async () => ({ modifiedCount: 0 })),
  findById: jest.fn(async () => null),
  findOne: jest.fn(async () => null),
  countDocuments: jest.fn(async () => 0),
  find: jest.fn(async () => [])
}));

jest.mock('../src/database/models/notificacion.model', () => ({
  insertMany: jest.fn(async () => [])
}));

jest.mock('../src/database/models/mozos.model', () => ({
  find: jest.fn(async (q) => {
    // Simula usuarios por rol
    const rol = q?.rol?.$in;
    if (Array.isArray(rol)) {
      return rol.map((r, i) => ({ _id: `user-${r}-${i}`, rol: r }));
    }
    return [];
  })
}));

const Conversacion = require('../src/database/models/conversacion.model');
const mensajeria = require('../src/services/mensajeriaService');

beforeEach(() => {
  jest.clearAllMocks();
  Conversacion._reset();
});

describe('Chat grupal — mensajeriaService', () => {
  test('crearGrupo crea conversacion tipo grupo con creador + miembros', async () => {
    const conv = await mensajeria.crearGrupo({
      creadorId: 'admin-1',
      nombreGrupo: 'Turno noche',
      descripcionGrupo: 'Cierre coordinado',
      participanteIds: ['mozos-1', 'cocinero-1']
    });

    expect(conv.tipo).toBe('grupo');
    expect(conv.nombreGrupo).toBe('Turno noche');
    expect(conv.titulo).toBe('Turno noche');
    expect(conv.creadoPor).toBe('admin-1');
    // Creador + 2 miembros = 3 participantes
    const ids = conv.participantes.map(p => String(p.usuario));
    expect(ids).toEqual(expect.arrayContaining(['admin-1', 'mozos-1', 'cocinero-1']));
    expect(ids.length).toBe(3);
  });

  test('crearGrupo rechaza menos de 2 miembros', async () => {
    await expect(mensajeria.crearGrupo({
      creadorId: 'admin-1',
      nombreGrupo: 'Solo yo',
      participanteIds: []
    })).rejects.toThrow(/al menos 2/i);
  });

  test('agregarMiembrosGrupo añade nuevos sin duplicar', async () => {
    const conv = await mensajeria.crearGrupo({
      creadorId: 'admin-1',
      nombreGrupo: 'Grupo A',
      participanteIds: ['u-1']
    });
    Conversacion.findById.mockResolvedValueOnce(conv);

    const r = await mensajeria.agregarMiembrosGrupo(conv._id, ['u-1', 'u-2', 'u-3'], 'admin-1');
    expect(r.modificados).toBe(2); // u-1 ya existía
    const ids = conv.participantes.map(p => String(p.usuario));
    expect(ids).toEqual(expect.arrayContaining(['admin-1', 'u-1', 'u-2', 'u-3']));
  });

  test('quitarMiembroGrupo llama updateOne con pull', async () => {
    const r = await mensajeria.quitarMiembroGrupo('conv-1', 'u-2');
    expect(Conversacion.updateOne).toHaveBeenCalled();
    expect(r.modifiedCount).toBe(1);
  });

  test('actualizarGrupo sincroniza titulo con nombreGrupo', async () => {
    await mensajeria.actualizarGrupo('conv-1', { nombreGrupo: 'Nuevo nombre' });
    const args = Conversacion.updateOne.mock.calls.find(c => c[0]?._id === 'conv-1');
    expect(args[1].$set.nombreGrupo).toBe('Nuevo nombre');
    expect(args[1].$set.titulo).toBe('Nuevo nombre');
  });

  test('usuarioPuedeAccederConversacion permite a participantes de grupo', () => {
    const conv = {
      tipo: 'grupo',
      participantes: [{ usuario: 'u-1' }, { usuario: 'u-2' }],
      rolesPermitidos: []
    };
    expect(mensajeria.usuarioPuedeAccederConversacion('u-1', 'mozos', conv)).toBe(true);
    expect(mensajeria.usuarioPuedeAccederConversacion('u-3', 'mozos', conv)).toBe(false);
  });
});
