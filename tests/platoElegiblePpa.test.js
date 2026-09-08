const { esPlatoElegibleParaPPA } = require('../src/utils/platoElegiblePpa');

describe('esPlatoElegibleParaPPA', () => {
  test('mesa y para llevar en pedido/recoger son elegibles', () => {
    expect(esPlatoElegibleParaPPA({ estado: 'pedido', tipoServicio: 'mesa' })).toBe(true);
    expect(esPlatoElegibleParaPPA({ estado: 'recoger', tipoServicio: 'mesa' })).toBe(true);
    expect(esPlatoElegibleParaPPA({ estado: 'pedido', tipoServicio: 'para_llevar' })).toBe(true);
  });

  test('entregado/pagado o ya cobrado por TPA no son elegibles', () => {
    expect(esPlatoElegibleParaPPA({ estado: 'entregado', tipoServicio: 'mesa' })).toBe(false);
    expect(esPlatoElegibleParaPPA({ estado: 'pagado', tipoServicio: 'para_llevar' })).toBe(false);
    expect(esPlatoElegibleParaPPA({
      estado: 'pedido',
      pagoAdelantado: { cobrado: true, estadoTicket: 'pendiente_aprobacion' },
    })).toBe(false);
  });
});
