const { aplicarPreciosEnLineasTicket, round2 } = require('../src/utils/editarPreciosTicket');

describe('aplicarPreciosEnLineasTicket', () => {
  test('actualiza precio, subtotal y totales', () => {
    const ticket = {
      platos: [
        { platoLineaId: 'a1', comandaId: 'c1', nombre: 'Lomo', precio: 20, cantidad: 2, subtotal: 40 },
        { platoLineaId: 'a2', comandaId: 'c1', nombre: 'Chicha', precio: 5, cantidad: 1, subtotal: 5 },
      ],
      subtotal: 45,
      total: 45,
      totalSinDescuento: 45,
      montoDescuento: 0,
      descuentos: [],
    };
    const out = aplicarPreciosEnLineasTicket(ticket, [
      { platoLineaId: 'a1', precio: 25 },
      { platoLineaId: 'a2', precio: 6 },
    ]);
    expect(out.changed).toBe(true);
    expect(ticket.platos[0].precio).toBe(25);
    expect(ticket.platos[0].subtotal).toBe(50);
    expect(ticket.platos[1].subtotal).toBe(6);
    expect(ticket.subtotal).toBe(56);
    expect(ticket.total).toBe(56);
    expect(ticket.totalSinDescuento).toBe(56);
    expect(out.cambiosComanda).toHaveLength(2);
  });

  test('recalcula descuento porcentual', () => {
    const ticket = {
      platos: [
        { platoLineaId: 'a1', comandaId: 'c1', precio: 100, cantidad: 1, subtotal: 100 },
      ],
      subtotal: 100,
      total: 90,
      totalSinDescuento: 100,
      montoDescuento: 10,
      descuentos: [{ porcentaje: 10, monto: 10 }],
    };
    aplicarPreciosEnLineasTicket(ticket, [{ platoLineaId: 'a1', precio: 80 }]);
    expect(ticket.subtotal).toBe(80);
    expect(ticket.montoDescuento).toBe(8);
    expect(ticket.total).toBe(72);
    expect(round2(ticket.descuentos[0].monto)).toBe(8);
  });
});
