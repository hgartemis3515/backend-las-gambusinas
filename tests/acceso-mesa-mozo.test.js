const { rechazoOtroMozo, comandaDuena } = require('../src/utils/accesoMesaMozo');

const MOZO_A = '6a3bdf7e1abb278cd2f2f19d';
const MOZO_B = '6a3bdf7e1abb278cd2f2f19e';

const c1227 = {
  comandaNumber: 1227,
  mozos: MOZO_A,
  mozoNombre: 'Guido',
  status: 'pendiente_aprobar',
  IsActive: true,
  createdAt: '2026-09-26T20:00:00.000Z',
};

const c1230 = {
  comandaNumber: 1230,
  mozos: MOZO_B,
  mozoNombre: 'Otro',
  status: 'en_espera',
  IsActive: true,
  createdAt: '2026-09-26T20:10:00.000Z',
};

describe('acceso mesa mozo', () => {
  test('dueño es la comanda más antigua (1227, no 1230)', () => {
    expect(comandaDuena([c1230, c1227]).comandaNumber).toBe(1227);
  });

  test('otro mozo no crea en pendiente_aprobar', () => {
    const r = rechazoOtroMozo({
      estadoMesa: 'pendiente_aprobar',
      mozoSolicitante: MOZO_B,
      comandas: [c1227],
    });
    expect(r.statusCode).toBe(403);
    expect(r.message).toMatch(/Guido/);
  });

  test('el mismo mozo sí puede agregar en pendiente_aprobar', () => {
    expect(rechazoOtroMozo({
      estadoMesa: 'pendiente_aprobar',
      mozoSolicitante: MOZO_A,
      comandas: [c1227, c1230],
    })).toBeNull();
  });

  test('pedido y pagado bloquean al otro mozo', () => {
    expect(rechazoOtroMozo({
      estadoMesa: 'pedido',
      mozoSolicitante: MOZO_B,
      comandas: [c1227],
    }).statusCode).toBe(403);
    expect(rechazoOtroMozo({
      estadoMesa: 'pagado',
      mozoSolicitante: MOZO_B,
      comandas: [{ ...c1227, status: 'pagado' }],
    }).statusCode).toBe(403);
  });

  test('mesa libre y dashboard no bloquean', () => {
    expect(rechazoOtroMozo({
      estadoMesa: 'libre',
      mozoSolicitante: MOZO_B,
      comandas: [c1227],
    })).toBeNull();
    expect(rechazoOtroMozo({
      estadoMesa: 'pendiente_aprobar',
      origenCreacion: 'dashboard',
      mozoSolicitante: MOZO_B,
      comandas: [c1227],
    })).toBeNull();
  });
});
