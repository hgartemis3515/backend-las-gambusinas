'use strict';

const { assertComandaParaTicketYaAprobado } = require('../src/services/aprobacionComanda.service');

describe('ticket ya aprobado desde comandas.html', () => {
  test('comanda pagada (IsActive=false) sí puede crear el ticket', () => {
    expect(() => assertComandaParaTicketYaAprobado({
      _id: '6a94424e0f225680b70bd674',
      status: 'pagado',
      IsActive: false,
      eliminada: false,
    })).not.toThrow();
  });

  test('comanda abierta también puede', () => {
    expect(() => assertComandaParaTicketYaAprobado({
      status: 'entregado',
      IsActive: true,
    })).not.toThrow();
  });

  test('sin comanda → 404', () => {
    try {
      assertComandaParaTicketYaAprobado(null);
      throw new Error('debía fallar');
    } catch (err) {
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('Comanda no encontrada');
    }
  });

  test('comanda eliminada → 404', () => {
    try {
      assertComandaParaTicketYaAprobado({ eliminada: true, IsActive: false });
      throw new Error('debía fallar');
    } catch (err) {
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe('La comanda está eliminada');
    }
  });
});
