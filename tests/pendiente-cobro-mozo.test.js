const {
  mapComandaPorCobrar,
  pendienteDeComanda,
} = require('../src/utils/pendienteCobroMozo');

describe('mapComandaPorCobrar', () => {
  test('arma mesa, total, platos y cocinero', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c1',
      comandaNumber: 42,
      status: 'entregado',
      createdAt: '2026-09-02T12:00:00.000Z',
      mesaNumero: 7,
      cantidades: [2, 1],
      totalCalculado: 80,
      platos: [
        {
          nombre: 'Lomo',
          estado: 'entregado',
          procesadoPor: { alias: 'Pepe', cocineroId: 'ck1' },
        },
        {
          plato: { nombre: 'Ceviche' },
          estado: 'salio',
          procesandoPor: { nombre: 'Pepe', cocineroId: 'ck1' },
        },
      ],
    }, 80);

    expect(mapped.comandaNumber).toBe(42);
    expect(mapped.mesaNumero).toBe(7);
    expect(mapped.total).toBe(80);
    expect(mapped.pendienteCobro).toBe(80);
    expect(mapped.platosResumen).toBe('Lomo x2, Ceviche');
    expect(mapped.cocineros).toEqual([{ nombre: 'Pepe', cocineroId: 'ck1' }]);
  });

  test('pendienteDeComanda es 0 si todos los platos están pagados', () => {
    const c = {
      status: 'entregado',
      IsActive: true,
      platos: [{ estado: 'pagado', precioUnitario: 10 }],
      cantidades: [1],
    };
    expect(pendienteDeComanda(c)).toBe(0);
  });
});
