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
    expect(mapped.mesaId).toBe(null);
    expect(mapped.total).toBe(80);
    expect(mapped.pendienteCobro).toBe(80);
    expect(mapped.platosResumen).toBe('Lomo x2, Ceviche');
    expect(mapped.cocineros).toEqual([{ nombre: 'Pepe', cocineroId: 'ck1' }]);
    expect(mapped.pedidoId).toBe(null);
    expect(mapped.clienteId).toBe(null);
  });

  test('expone pedido y cliente para agrupar como comandas.html', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c3',
      comandaNumber: 81,
      pedido: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      cliente: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', nombre: 'Luis' },
      clienteNombre: 'Luis',
      origenCreacion: 'mozos',
      createdByDashboard: null,
      totalCalculado: 10,
      platos: [{ nombre: 'Ají', estado: 'entregado' }],
    }, 10);
    expect(mapped.pedidoId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(mapped.clienteId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(mapped.clienteNombre).toBe('Luis');
    expect(mapped.origenCreacion).toBe('mozos');
    expect(mapped.createdByDashboard).toBe(null);
  });

  test('incluye mesaId y estado cuando mesas viene poblada', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c2',
      comandaNumber: 9,
      mesas: { _id: 'm1', nummesa: 3, estado: 'pedido', nombreCombinado: '3+4' },
      totalCalculado: 25,
      platos: [{ nombre: 'Ají', estado: 'entregado' }],
    }, 25);
    expect(mapped.mesaId).toBe('m1');
    expect(mapped.mesaEstado).toBe('pedido');
    expect(mapped.mesaNombre).toBe('3+4');
    expect(mapped.mesaNumero).toBe(3);
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

  test('pendienteDeComanda es 0 si todos los platos tienen PPA cobrado (forzar pago)', () => {
    const c = {
      status: 'entregado',
      IsActive: true,
      totalCalculado: 40,
      platos: [{
        estado: 'entregado',
        precioUnitario: 40,
        pagoAdelantado: { cobrado: true, estadoTicket: 'aprobado' },
      }],
      cantidades: [1],
    };
    expect(pendienteDeComanda(c)).toBe(0);
    expect(pendienteDeComanda(c, { cobradoBouchers: 40 })).toBe(0);
  });
});
