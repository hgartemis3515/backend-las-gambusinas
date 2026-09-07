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
    expect(out.ventasAprobadas).toBe(216);
    expect(out.ventasPendientes).toBe(0);
  });

  test('suma 7776.50 si las filas vigentes suman eso', () => {
    const out = acumularDesgloseDesdeFilas(
      [
        { _id: 'a', total: 7711.5, status: 'pagado', mozo: 'x' },
        { _id: 'b', total: 65, status: 'pendiente_aprobar', tiempoPagado: new Date(), mozo: 'x' },
      ],
      [{ _id: 'orphan', comandas: ['dead'], total: 151, estado: 'aprobado', createdAt: '2026-09-06T10:00:00.000Z' }]
    );
    expect(out.ventasAprobadas).toBe(7776.5);
    expect(out.porMozo.get('x').ventasAprobadas).toBe(7776.5);
  });
});
