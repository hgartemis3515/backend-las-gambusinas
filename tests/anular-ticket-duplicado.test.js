const { aplicarAnulacionDuplicado, armarDetalleTicketAnulado, motivoDuplicadoValido } = require('../src/utils/anularTicketDuplicado');

describe('anularTicketDuplicado', () => {
  test('motivo corto falla', () => {
    expect(() => motivoDuplicadoValido('no')).toThrow(/mínimo 3/);
  });

  test('marca isActive false y deja nota, sin tocar estado', () => {
    const t = { isActive: true, estado: 'aprobado', observaciones: 'Pago' };
    aplicarAnulacionDuplicado(t, 'Ticket duplicado');
    expect(t.isActive).toBe(false);
    expect(t.estado).toBe('aprobado');
    expect(t.observaciones).toMatch(/Duplicado anulado: Ticket duplicado/);
  });

  test('el detalle de auditoría dice ticket, comanda, mesa, cliente y platos', () => {
    const detalle = armarDetalleTicketAnulado({
      tipo: 'ADELANTADO',
      ticket: {
        ticketNumber: 1149,
        numMesa: 10,
        clienteNombre: 'Elisabel',
        nombreMozo: 'Diego',
        platos: [{ nombre: '1/4 Pollo a la leña', cantidad: 2, eliminado: false }],
      },
      comandas: [{ numeroComandaDia: 2, mesaNumero: 10, clienteNombre: 'Elisabel' }],
    });
    expect(detalle.resumen).toContain('Ticket #1149');
    expect(detalle.resumen).toContain('comanda #2');
    expect(detalle.resumen).toContain('mesa 10');
    expect(detalle.resumen).toContain('Elisabel');
    expect(detalle.resumen).toContain('2x 1/4 Pollo a la leña');
    expect(detalle.numeroDia).toBe(2);
  });
});
