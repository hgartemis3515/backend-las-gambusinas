jest.mock('../src/repository/configuracion.repository', () => ({
  obtenerConfiguracion: jest.fn(),
}));
jest.mock('../src/repository/ticketAprobacion.repository', () => ({
  aprobarTicket: jest.fn(async (id, usuarioId, usuarioNombre) => ({
    ticket: { _id: id, estado: 'aprobado', aprobadoPorNombre: usuarioNombre },
    platosLiberados: [{ estadoNuevo: 'pagado' }],
    mesaEstado: 'pagado',
  })),
}));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const configuracionRepository = require('../src/repository/configuracion.repository');
const ticketAprobacionRepository = require('../src/repository/ticketAprobacion.repository');
const { intentarCobroDirectoComanda } = require('../src/services/cobroDirectoCaja.service');

describe('cobro directo caja', () => {
  const ticket = { _id: 't1', estado: 'pendiente_aprobacion' };
  const cajero = { _id: 'u1', name: 'Caja', rol: 'cajero' };

  beforeEach(() => {
    jest.clearAllMocks();
    configuracionRepository.obtenerConfiguracion.mockResolvedValue({
      caja: { cobroDirectoMozos: true, autoAprobarCobroCaja: true },
    });
  });

  test('cajero aprueba el ticket y libera platos', async () => {
    const res = await intentarCobroDirectoComanda(ticket, { usuario: cajero, cobroDirectoCaja: true });
    expect(res.aplicado).toBe(true);
    expect(res.ticket.estado).toBe('aprobado');
    expect(res.aprobacion.platosLiberados[0].estadoNuevo).toBe('pagado');
    expect(res.aprobacion.mesaEstado).toBe('pagado');
    expect(ticketAprobacionRepository.aprobarTicket).toHaveBeenCalledWith('t1', 'u1', 'Caja');
  });

  test('mozo queda pendiente aunque pida cobro directo', async () => {
    const res = await intentarCobroDirectoComanda(ticket, {
      usuario: { _id: 'u2', name: 'Mozo', rol: 'mozos' },
      cobroDirectoCaja: true,
    });
    expect(res.aplicado).toBe(false);
    expect(res.ticket.estado).toBe('pendiente_aprobacion');
    expect(ticketAprobacionRepository.aprobarTicket).not.toHaveBeenCalled();
  });

  test('con config apagada el ticket sigue pendiente', async () => {
    configuracionRepository.obtenerConfiguracion.mockResolvedValue({
      caja: { cobroDirectoMozos: false, autoAprobarCobroCaja: true },
    });
    const res = await intentarCobroDirectoComanda(ticket, { usuario: cajero, cobroDirectoCaja: true });
    expect(res.aplicado).toBe(false);
    expect(ticketAprobacionRepository.aprobarTicket).not.toHaveBeenCalled();
  });
});
