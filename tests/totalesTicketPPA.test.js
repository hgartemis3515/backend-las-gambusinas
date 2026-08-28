const {
  sumarSubtotalesPlatosTicket,
  resolverTotalesPedidoPPA,
  aplicarTotalesPedidoPPA,
  resolverMontoCajaPPA,
} = require('../src/utils/totalesTicketPPA');

describe('totalesTicketPPA — reserva sin adelanto', () => {
  const platos = [
    { nombre: 'Plato A', precio: 552, cantidad: 1, subtotal: 552 },
    { nombre: 'Plato B', precio: 72, cantidad: 1, subtotal: 72 },
  ];

  test('suma líneas 552 + 72 = 624', () => {
    expect(sumarSubtotalesPlatosTicket(platos)).toBe(624);
  });

  test('reserva con total guardado 0 usa suma de platos', () => {
    const r = resolverTotalesPedidoPPA({
      origen: 'reserva',
      total: 0,
      subtotal: 0,
      platos,
    });
    expect(r.subtotal).toBe(624);
    expect(r.total).toBe(624);
  });

  test('reserva con seña guardada 312 sigue mostrando total de platos', () => {
    const r = resolverTotalesPedidoPPA({
      origen: 'reserva',
      total: 312,
      subtotal: 312,
      platos,
    });
    expect(r.total).toBe(624);
  });

  test('PPA clásico conserva el total cobrado si coincide con líneas', () => {
    const r = resolverTotalesPedidoPPA({
      origen: 'comanda',
      total: 40,
      subtotal: 40,
      platos: [{ subtotal: 40, precio: 40, cantidad: 1 }],
    });
    expect(r.total).toBe(40);
  });

  test('PPA clásico con total 0 y líneas usa suma (ticket inconsistente)', () => {
    const r = resolverTotalesPedidoPPA({
      origen: 'comanda',
      total: 0,
      subtotal: 0,
      platos: [{ subtotal: 20, precio: 20, cantidad: 1 }],
    });
    expect(r.total).toBe(20);
  });

  test('aplicarTotalesPedidoPPA no muta el original', () => {
    const ticket = { origen: 'reserva', total: 0, subtotal: 0, platos };
    const out = aplicarTotalesPedidoPPA(ticket);
    expect(ticket.total).toBe(0);
    expect(out.total).toBe(624);
  });

  test('caja usa montoCobrado cuando existe (sin adelanto = 0)', () => {
    expect(resolverMontoCajaPPA({ total: 624, montoCobrado: 0 })).toBe(0);
    expect(resolverMontoCajaPPA({ total: 624, montoCobrado: 312 })).toBe(312);
    expect(resolverMontoCajaPPA({ total: 40 })).toBe(40);
  });
});
