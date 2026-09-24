'use strict';

const {
  pendienteCobroDeComandaPopulada,
  adjuntarPendienteCobroTickets,
  saldoPendienteDeTicket,
} = require('../src/utils/saldoPendienteComanda');

describe('saldoPendienteComanda', () => {
  const plato = (estado, precioUnitario, cantidad) => ({
    estado,
    precioUnitario,
    cantidad,
    _id: `p${Math.random().toString(36).slice(2, 8)}`,
  });

  test('comanda 2087 tipo: 5 pollos x33 pagados 2 → pendiente 3 pollos + tamal = 111', () => {
    // Tras dos cobros parciales de 1 pollo (33 c/u), cantidades[] queda en 3.
    const comanda = {
      platos: [plato('entregado', 33, 5), plato('entregado', 12, 1)],
      cantidades: [3, 1],
      totalCalculado: 177,
      montoDescuento: 0,
    };
    expect(pendienteCobroDeComandaPopulada(comanda)).toBe(111);
  });

  test('comanda sin pagos: pendiente = suma de platos entregados', () => {
    const comanda = {
      platos: [plato('entregado', 12), plato('entregado', 16)],
      cantidades: [1, 1],
    };
    expect(pendienteCobroDeComandaPopulada(comanda)).toBe(28);
  });

  test('comanda con descuento prorratea según lo entregado', () => {
    // Línea 1: queda 1 unidad entregada por cobrar (100).
    // Línea 2: ya cobrada ('pendiente'), sigue con su cantidad (100) en subTotal.
    const comanda = {
      platos: [plato('entregado', 100), plato('pendiente', 100)],
      cantidades: [1, 1],
      totalCalculado: 300,
      montoDescuento: 40,
    };
    // subTotal 200, pagable 100 → 300 * (100/200) = 150
    expect(pendienteCobroDeComandaPopulada(comanda)).toBe(150);
  });

  test('PPA parcial: 1 cobrado y 3 en espera → pendiente 99', () => {
    const comanda = {
      platos: [
        { estado: 'en_espera', precioUnitario: 33, pagoAdelantado: { cobrado: false, estadoTicket: null } },
        { estado: 'en_espera', precioUnitario: 33, pagoAdelantado: { cobrado: true, estadoTicket: 'aprobado' } },
      ],
      cantidades: [3, 1],
    };
    expect(pendienteCobroDeComandaPopulada(comanda, { modo: 'ppa' })).toBe(99);
  });

  test('todo cobrado → 0', () => {
    const comanda = {
      platos: [plato('pendiente', 33), plato('pendiente', 12)],
      cantidades: [1, 1],
    };
    expect(pendienteCobroDeComandaPopulada(comanda)).toBe(0);
  });

  test('sin precio confiable → null (no adjunta saldo)', () => {
    const comanda = {
      platos: [{ estado: 'entregado', precioUnitario: null, precio: null, cantidad: 1 }],
      cantidades: [1],
    };
    expect(pendienteCobroDeComandaPopulada(comanda)).toBeNull();
  });

  test('adjuntarPendienteCobroTickets suma saldo por comanda en cada ticket', () => {
    const tickets = [
      {
        _id: 't1',
        comandas: [
          { _id: 'c2084', platos: [plato('pendiente', 33)], cantidades: [1] },
          { _id: 'c2087', platos: [plato('entregado', 33, 3), plato('entregado', 12)], cantidades: [3, 1] },
        ],
      },
    ];
    adjuntarPendienteCobroTickets(tickets);
    expect(tickets[0].comandas[0].pendienteCobro).toBe(0);
    expect(tickets[0].comandas[1].pendienteCobro).toBe(111);
    expect(saldoPendienteDeTicket(tickets[0])).toBe(111);
  });

  test('fallback cantidad de subdoc cuando falta cantidades[i]', () => {
    const comanda = {
      platos: [plato('entregado', 33, 4)],
      cantidades: [],
    };
    expect(pendienteCobroDeComandaPopulada(comanda)).toBe(132);
  });
});