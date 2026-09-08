const { estadoTrasCambioPlato } = require('../src/utils/platoEstadoTrasEntregaPpa');

describe('estadoTrasCambioPlato', () => {
  test('entrega de plato con PPA pasa a pagado', () => {
    expect(estadoTrasCambioPlato({
      pagoAdelantado: { cobrado: true, estadoTicket: 'aprobado' },
    }, 'entregado')).toBe('pagado');
  });

  test('entrega de plato de mesa sin PPA sigue entregado', () => {
    expect(estadoTrasCambioPlato({ tipoServicio: 'mesa' }, 'entregado')).toBe('entregado');
  });

  test('otros destinos no cambian', () => {
    expect(estadoTrasCambioPlato({
      pagoAdelantado: { cobrado: true },
    }, 'salio')).toBe('salio');
  });
});
