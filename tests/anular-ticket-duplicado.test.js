const { aplicarAnulacionDuplicado, motivoDuplicadoValido } = require('../src/utils/anularTicketDuplicado');

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
});
