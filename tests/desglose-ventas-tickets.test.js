const {
  ultimoTicketPorComanda,
  acumularTicketsUnicos,
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
