global.__ticketCounters = new Map();
global.__ticketStore = { pendientes: [], ya: [], writes: [] };

jest.mock('mongoose', () => ({
  connection: {
    collection() {
      return {
        findOneAndUpdate: async (filter) => {
          const id = String(filter._id);
          const counters = global.__ticketCounters;
          const seq = (counters.get(id) || 0) + 1;
          counters.set(id, seq);
          return { seq };
        },
        updateOne: async (filter, update) => {
          const id = String(filter._id);
          const counters = global.__ticketCounters;
          const n = Number(update?.$max?.seq) || 0;
          counters.set(id, Math.max(counters.get(id) || 0, n));
          return { acknowledged: true };
        },
      };
    },
  },
}));

jest.mock('../src/database/models/comanda.model', () => ({
  find: (filter) => {
    const chain = {
      select() { return chain; },
      sort() { return chain; },
      lean: async () => {
        const store = global.__ticketStore;
        if (filter?.numeroTicketCliente && filter.numeroTicketCliente.$ne === null) return store.ya;
        return store.pendientes;
      },
    };
    return chain;
  },
  bulkWrite: async (ops) => {
    global.__ticketStore.writes.push(...ops);
    return { modifiedCount: ops.length };
  },
}));

const {
  comandaRequiereTicketCliente,
  siguienteNumeroTicketCliente,
  asignarTicketClienteEnDoc,
  backfillNumeroTicketClienteHoy,
} = require('../src/utils/numeroTicketCliente');

describe('numero ticket cliente', () => {
  beforeEach(() => {
    global.__ticketCounters.clear();
    global.__ticketStore.pendientes = [];
    global.__ticketStore.ya = [];
    global.__ticketStore.writes = [];
  });

  test('solo comandas para llevar, extra llevar o sin mesa', () => {
    expect(comandaRequiereTicketCliente({ platos: [{ tipoServicio: 'mesa' }] })).toBe(false);
    expect(comandaRequiereTicketCliente({ platos: [{ tipoServicio: 'para_llevar' }] })).toBe(true);
    expect(comandaRequiereTicketCliente({ platos: [{ tipoServicio: 'extra_llevar' }] })).toBe(true);
    expect(comandaRequiereTicketCliente({ sinMesa: true, platos: [] })).toBe(true);
  });

  test('secuencia desde 1 y reinicio al cambiar de día', async () => {
    expect(await siguienteNumeroTicketCliente('2026-09-23')).toBe(1);
    expect(await siguienteNumeroTicketCliente('2026-09-23')).toBe(2);
    expect(await siguienteNumeroTicketCliente('2026-09-24')).toBe(1);
  });

  test('no numera una comanda de mesa', async () => {
    const doc = { sinMesa: false, platos: [{ tipoServicio: 'mesa' }], numeroTicketCliente: null };
    await asignarTicketClienteEnDoc(doc);
    expect(doc.numeroTicketCliente).toBeNull();
  });

  test('backfill asigna desde 1 solo a las pendientes del día', async () => {
    global.__ticketStore.ya = [{ numeroTicketCliente: 2 }];
    global.__ticketStore.pendientes = [{ _id: 'a' }, { _id: 'b' }];
    const res = await backfillNumeroTicketClienteHoy();
    expect(res.asignadas).toBe(2);
    const nums = global.__ticketStore.writes.map((op) => op.updateOne.update.$set.numeroTicketCliente);
    expect(nums).toEqual([1, 3]);
  });
});
