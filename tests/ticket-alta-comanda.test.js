const {
  limaYMD,
  ticketEsAltaSinPago,
  ticketPuedeAprobarse,
  ticketPuedeForzarPago,
  matchFechaRangoTicket,
} = require('../src/utils/ticketAltaComanda');

describe('ticket alta comanda + filtro DIA/NOCHE', () => {
  test('alta sin boucher es PENDIENTE de caja', () => {
    expect(ticketEsAltaSinPago({
      estado: 'pendiente_aprobacion',
      origen: 'alta_comanda',
      boucher: null,
    })).toBe(true);
    expect(ticketPuedeAprobarse({
      estado: 'pendiente_aprobacion',
      boucher: null,
    })).toBe(false);
    expect(ticketPuedeForzarPago({
      estado: 'pendiente_aprobacion',
      tipo: 'comanda_completa',
    })).toBe(true);
  });

  test('con boucher se puede aprobar (solicitud del mozo)', () => {
    expect(ticketPuedeAprobarse({
      estado: 'pendiente_aprobacion',
      boucher: 'b1',
    })).toBe(true);
  });

  test('HOY no incluye ayer', () => {
    const ayer = new Date(Date.now() - 36 * 60 * 60 * 1000);
    expect(matchFechaRangoTicket(ayer, { periodo: 'hoy' })).toBe(false);
    expect(matchFechaRangoTicket(new Date(), { periodo: 'hoy' })).toBe(true);
  });

  test('DIA / NOCHE cortan en el primer cierre', () => {
    const ymd = limaYMD();
    const corte = new Date(`${ymd}T14:00:00-05:00`);
    const manana = new Date(`${ymd}T10:00:00-05:00`);
    const tarde = new Date(`${ymd}T18:00:00-05:00`);
    expect(matchFechaRangoTicket(manana, { periodo: 'dia', primerCierreHoyAt: corte })).toBe(true);
    expect(matchFechaRangoTicket(tarde, { periodo: 'dia', primerCierreHoyAt: corte })).toBe(false);
    expect(matchFechaRangoTicket(tarde, { periodo: 'noche', primerCierreHoyAt: corte })).toBe(true);
    expect(matchFechaRangoTicket(manana, { periodo: 'noche', primerCierreHoyAt: corte })).toBe(false);
  });
});
