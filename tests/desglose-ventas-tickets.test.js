const {
  ultimoTicketPorComanda,
  acumularTicketsUnicos,
  acumularDesgloseDesdeFilas,
} = require('../src/utils/desgloseVentasTickets');

describe('ultimoTicketPorComanda', () => {
  test('deja el ticket más reciente de la misma comanda', () => {
    const t1 = {
      _id: 't1',
      comandas: ['c1'],
      total: 80,
      estado: 'aprobado',
      createdAt: '2026-09-02T10:00:00.000Z',
      ticketNumber: 1,
    };
    const t2 = {
      _id: 't2',
      comandas: ['c1'],
      total: 80,
      estado: 'aprobado',
      createdAt: '2026-09-02T11:00:00.000Z',
      ticketNumber: 2,
    };
    const unicos = ultimoTicketPorComanda([t1, t2]);
    expect(unicos).toHaveLength(1);
    expect(unicos[0]._id).toBe('t2');
  });

  test('un ticket que cubre dos comandas se cuenta una sola vez', () => {
    const t = {
      _id: 't-multi',
      comandas: ['c1', 'c2'],
      total: 150,
      estado: 'aprobado',
      createdAt: '2026-09-02T12:00:00.000Z',
      ticketNumber: 9,
    };
    expect(ultimoTicketPorComanda([t])).toHaveLength(1);
  });
});

describe('acumularTicketsUnicos', () => {
  test('dos tickets aprobados de la misma comanda no duplican pagadas', () => {
    const out = acumularTicketsUnicos([
      {
        _id: 't1',
        comandas: ['c1'],
        total: 80,
        estado: 'aprobado',
        createdAt: '2026-09-02T10:00:00.000Z',
        ticketNumber: 1,
      },
      {
        _id: 't2',
        comandas: ['c1'],
        total: 80,
        estado: 'aprobado',
        createdAt: '2026-09-02T11:00:00.000Z',
        ticketNumber: 2,
      },
    ]);
    expect(out.ventasAprobadas).toBe(80);
    expect(out.ventasPendientes).toBe(0);
  });

  test('PPA 40 y ticket de comanda 80 cuenta solo 80', () => {
    const out = acumularTicketsUnicos([
      {
        _id: 'ppa',
        comandas: ['c1'],
        total: 40,
        estado: 'aprobado',
        createdAt: '2026-09-02T10:00:00.000Z',
        ticketNumber: 1,
      },
      {
        _id: 'cmd',
        comandas: ['c1'],
        total: 80,
        estado: 'aprobado',
        createdAt: '2026-09-02T12:00:00.000Z',
        ticketNumber: 4,
      },
    ]);
    expect(out.ventasAprobadas).toBe(80);
  });

  test('comandas pobladas como objetos y desglose por mozo', () => {
    const out = acumularTicketsUnicos([
      {
        _id: 't1',
        comandas: [{ _id: 'c1' }],
        total: 50,
        estado: 'aprobado',
        mozo: 'mozo-a',
        createdAt: '2026-09-02T10:00:00.000Z',
        ticketNumber: 1,
      },
      {
        _id: 't2',
        comandas: [{ _id: 'c1' }],
        total: 50,
        estado: 'aprobado',
        mozo: 'mozo-a',
        createdAt: '2026-09-02T11:00:00.000Z',
        ticketNumber: 2,
      },
      {
        _id: 't3',
        comandas: ['c2'],
        total: 30,
        estado: 'pendiente_aprobacion',
        mozo: 'mozo-b',
        createdAt: '2026-09-02T11:30:00.000Z',
        ticketNumber: 3,
      },
    ]);
    expect(out.ventasAprobadas).toBe(50);
    expect(out.ventasPendientes).toBe(30);
    expect(out.porMozo.get('mozo-a')).toEqual({ ventasPendientes: 0, ventasAprobadas: 50 });
    expect(out.porMozo.get('mozo-b')).toEqual({ ventasPendientes: 30, ventasAprobadas: 0 });
  });
});

describe('acumularDesgloseDesdeFilas', () => {
  test('pagadas usan el total de la comanda vigente, no el ticket de la eliminada', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: '912', total: 151, status: 'pagado', mozo: 'melina' },
        { _id: '938', total: 65, status: 'pendiente_aprobar', tiempoPagado: '2026-09-06T19:02:00.000Z', mozo: 'carlos' },
      ],
      [
        { _id: 't911', comandas: ['911'], total: 151, estado: 'aprobado', createdAt: '2026-09-06T15:55:00.000Z' },
        { _id: 't912', comandas: ['912'], total: 151, estado: 'aprobado', createdAt: '2026-09-06T16:00:00.000Z' },
      ]
    );
    expect(out.ventasAprobadas).toBe(151);
    expect(out.ventasPendientes).toBe(65);
  });

  test('suma 7776.50 si las filas vigentes suman eso', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: 'a', total: 7711.5, status: 'pagado', mozo: 'x' },
        { _id: 'b', total: 65, status: 'pendiente_aprobar', tiempoPagado: new Date(), mozo: 'x' },
      ],
      [{ _id: 'orphan', comandas: ['dead'], total: 151, estado: 'aprobado', createdAt: '2026-09-06T10:00:00.000Z' }]
    );
    expect(out.ventasAprobadas).toBe(7711.5);
    expect(out.ventasPendientes).toBe(65);
    expect(out.porMozo.get('x').ventasAprobadas).toBe(7711.5);
    expect(out.porMozo.get('x').ventasPendientes).toBe(65);
  });

  test('adelanto aprobado va a pagadas; entregado y por aprobar siguen pendientes', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: 'caja', total: 179, status: 'pagado', mozo: 'a' },
        { _id: 'adelanto', total: 70, status: 'pagado', soloPagoAdelantado: true, mozo: 'a' },
        { _id: 'entregada', total: 171, status: 'entregado', mozo: 'b' },
        { _id: 'porAprobar', total: 326, status: 'pendiente_aprobar', tiempoPagado: '2026-10-05T18:00:00.000Z', mozo: 'b' },
      ],
      [
        { _id: 't1', comandas: ['caja'], estado: 'aprobado', total: 179, createdAt: '2026-10-05T18:00:00.000Z' },
        { _id: 't2', comandas: ['adelanto'], estado: 'aprobado', total: 70, createdAt: '2026-10-05T18:00:00.000Z' },
        { _id: 't3', comandas: ['entregada'], estado: 'pendiente_aprobacion', total: 171, createdAt: '2026-10-05T18:00:00.000Z' },
        { _id: 't4', comandas: ['porAprobar'], estado: 'pendiente_aprobacion', total: 326, createdAt: '2026-10-05T18:00:00.000Z' },
      ]
    );
    expect(out.ventasAprobadas).toBe(249);
    expect(out.ventasPendientes).toBe(497);
    expect(out.porMozo.get('a')).toEqual({ ventasPendientes: 0, ventasAprobadas: 249 });
    expect(out.porMozo.get('b')).toEqual({ ventasPendientes: 497, ventasAprobadas: 0 });
  });

  test('adelanto parcial reparte el total de la fila', () => {
    const out = acumularDesgloseDesdeFilas(
      [{
        _id: 'p',
        total: 100,
        status: 'en_espera',
        mozo: 'a',
        platos: [
          { lineaId: 'l1', subtotal: 30 },
          { lineaId: 'l2', subtotal: 70 },
        ],
      }],
      [{
        _id: 't',
        comandas: ['p'],
        estado: 'aprobado',
        tipo: 'pago_adelantado',
        total: 30,
        platos: [{ platoLineaId: 'l1', comandaId: 'p', subtotal: 30 }],
      }]
    );
    expect(out.ventasAprobadas).toBe(30);
    expect(out.ventasPendientes).toBe(70);
  });

  test('abono aprobado cuenta su monto y el resto queda pendiente', () => {
    const out = acumularDesgloseDesdeFilas(
      [{ _id: 'ab', total: 80, status: 'en_espera', mozo: 'a' }],
      [{
        _id: 't',
        comandas: ['ab'],
        estado: 'aprobado',
        tipo: 'pago_parcial',
        cobroPorCantidad: true,
        total: 20,
      }]
    );
    expect(out.ventasAprobadas).toBe(20);
    expect(out.ventasPendientes).toBe(60);
  });

  test('reserva y para llevar aprobados van a pagadas aunque no estén pagado', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: 'res', total: 90, status: 'en_espera', programadaPorReserva: true, mozo: 'a' },
        { _id: 'llevar', total: 33, status: 'pedido', mozo: 'a' },
        { _id: 'llevarPend', total: 12, status: 'pedido', mozo: 'b' },
        { _id: 'extra', total: 40, status: 'en_espera', programadaPorReserva: true, mozo: 'b' },
      ],
      [
        { _id: 'tr', comandas: ['res'], estado: 'aprobado', total: 90, origen: 'reserva' },
        { _id: 'tl', comandas: ['llevar'], estado: 'aprobado', total: 33, tipo: 'pago_adelantado' },
        { _id: 'tp', comandas: ['llevarPend'], estado: 'pendiente_aprobacion', total: 12, tipo: 'pago_adelantado' },
      ]
    );
    expect(out.ventasAprobadas).toBe(123);
    expect(out.ventasPendientes).toBe(52);
  });

  test('ticket rechazado o inactivo no suma; la comanda cerrada sin ticket activo queda pagada', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: 'rej', total: 40, status: 'en_espera', mozo: 'a' },
        { _id: 'vieja', total: 104, status: 'pagado', mozo: 'a' },
      ],
      [
        { _id: 'tr', comandas: ['rej'], estado: 'rechazado', total: 40 },
        { _id: 'ti', comandas: ['vieja'], estado: 'pendiente_aprobacion', total: 104, isActive: false },
      ]
    );
    expect(out.ventasAprobadas).toBe(104);
    expect(out.ventasPendientes).toBe(40);
  });

  test('adelanto y comanda completa aprobados no duplican el total', () => {
    const out = acumularDesgloseDesdeFilas(
      [{
        _id: 'c',
        total: 80,
        status: 'en_espera',
        mozo: 'a',
        platos: [
          { lineaId: 'l1', subtotal: 30 },
          { lineaId: 'l2', subtotal: 50 },
        ],
      }],
      [
        {
          _id: 'ppa',
          comandas: ['c'],
          estado: 'aprobado',
          total: 30,
          platos: [{ platoLineaId: 'l1', subtotal: 30 }],
        },
        {
          _id: 'full',
          comandas: ['c'],
          estado: 'aprobado',
          total: 80,
          platos: [
            { platoLineaId: 'l1', subtotal: 30 },
            { platoLineaId: 'l2', subtotal: 50 },
          ],
        },
      ]
    );
    expect(out.ventasAprobadas).toBe(80);
    expect(out.ventasPendientes).toBe(0);
  });
});
