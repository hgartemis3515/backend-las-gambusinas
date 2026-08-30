const {
  esComandaPrincipalDeReserva,
  debeCancelarReservaAlEliminarComanda,
  heredarProgramacionDeComandaPrincipal,
  mesaGrupoPrincipalId,
  mesaEstadoEsReserva
} = require('../src/utils/reservaComandas');

describe('PLAN_NUEVA_COMANDA_RESERVA_Y_MESAS_JUNTAS', () => {
  const reserva = { _id: 'r1', comandaGenerada: 'c-gen' };

  test('principal = comandaGenerada', () => {
    expect(esComandaPrincipalDeReserva(reserva, { _id: 'c-gen' })).toBe(true);
    expect(esComandaPrincipalDeReserva(reserva, { _id: 'c-extra' })).toBe(false);
  });

  test('eliminar extra no cancela la reserva', () => {
    expect(debeCancelarReservaAlEliminarComanda(reserva, { _id: 'c-extra' })).toBe(false);
    expect(debeCancelarReservaAlEliminarComanda(reserva, { _id: 'c-gen' })).toBe(true);
  });

  test('hereda programación solo si la original sigue programada', () => {
    expect(heredarProgramacionDeComandaPrincipal({ programadaPorReserva: false })).toBeNull();
    const h = heredarProgramacionDeComandaPrincipal({
      programadaPorReserva: true,
      fechaCocinaProgramada: '2026-08-30T20:40:00.000Z'
    });
    expect(h.programadaPorReserva).toBe(true);
    expect(h.origenCreacion).toBe('reserva');
    expect(h.fechaCocinaProgramada).toBe('2026-08-30T20:40:00.000Z');
  });

  test('comanda en secundaria usa la mesa principal del grupo', () => {
    expect(mesaGrupoPrincipalId({ esMesaPrincipal: true, mesaPrincipalId: 'p' })).toBeNull();
    expect(mesaGrupoPrincipalId({ esMesaPrincipal: false, mesaPrincipalId: 'p1' })).toBe('p1');
  });

  test('mesa reserva incluye pendiente_aprobar', () => {
    expect(mesaEstadoEsReserva('reservado')).toBe(true);
    expect(mesaEstadoEsReserva('pendiente_aprobar')).toBe(true);
    expect(mesaEstadoEsReserva('pedido')).toBe(false);
  });
});
