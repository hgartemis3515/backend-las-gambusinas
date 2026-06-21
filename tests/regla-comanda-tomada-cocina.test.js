/**
 * Tests: bloqueo de edición/eliminación por comandas/platos tomados por cocina
 */

jest.mock('../src/repository/configuracion.repository', () => ({
  obtenerConfiguracion: jest.fn()
}));

const configuracionRepository = require('../src/repository/configuracion.repository');
const {
  comandaTomadaPorCocina,
  platoTomadoPorCocina,
  validarEdicionMozoPermitida,
  validarActualizacionComandaMozo
} = require('../src/utils/reglasComandaTomadaCocina');

const cocineroId = '507f1f77bcf86cd799439011';

const comandaBase = {
  _id: 'comanda1',
  procesandoPor: null,
  platos: [
    { estado: 'pedido', procesandoPor: null },
    { estado: 'pedido', procesandoPor: { cocineroId, alias: 'Cocina 1' } }
  ],
  cantidades: [1, 2]
};

describe('reglasComandaTomadaCocina', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    configuracionRepository.obtenerConfiguracion.mockResolvedValue({
      mozos: { permitirEditarEliminarTomadasPorCocina: false }
    });
  });

  test('comandaTomadaPorCocina detecta procesandoPor en comanda', () => {
    expect(comandaTomadaPorCocina(comandaBase)).toBe(false);
    expect(comandaTomadaPorCocina({
      ...comandaBase,
      procesandoPor: { cocineroId, alias: 'Chef' }
    })).toBe(true);
  });

  test('platoTomadoPorCocina detecta plato individual tomado', () => {
    expect(platoTomadoPorCocina(comandaBase.platos[0])).toBe(false);
    expect(platoTomadoPorCocina(comandaBase.platos[1])).toBe(true);
  });

  test('bloquea eliminar comanda con plato tomado (config default)', async () => {
    const result = await validarEdicionMozoPermitida(comandaBase, {
      verificarComandaCompleta: true
    });
    expect(result.permitido).toBe(false);
    expect(result.codigo).toBe('COMANDA_TOMADA_COCINA');
  });

  test('permite editar cuando config lo habilita', async () => {
    configuracionRepository.obtenerConfiguracion.mockResolvedValue({
      mozos: { permitirEditarEliminarTomadasPorCocina: true }
    });
    const result = await validarEdicionMozoPermitida(comandaBase, {
      verificarComandaCompleta: true
    });
    expect(result.permitido).toBe(true);
  });

  test('bloquea actualización de cantidad de plato tomado', async () => {
    const result = await validarActualizacionComandaMozo(comandaBase, {
      cantidades: [1, 3]
    });
    expect(result.permitido).toBe(false);
  });

  test('forzarAdmin omite bloqueo', async () => {
    const result = await validarEdicionMozoPermitida(comandaBase, {
      forzarAdmin: true,
      verificarComandaCompleta: true
    });
    expect(result.permitido).toBe(true);
  });
});
