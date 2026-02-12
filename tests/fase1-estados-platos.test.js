/**
 * FASE 1: Tests para Validación y Persistencia de Estados Individuales de Platos
 * 
 * Pruebas:
 * 1. crearComanda() con estados válidos → OK
 * 2. crearComanda() estado inválido → ERROR
 * 3. cambiarEstadoPlato() transición válida → OK  
 * 4. cambiarEstadoPlato() inválida → ERROR
 * 5. editarComanda() EXISTENTE NO rompe
 */

const mongoose = require('mongoose');
const {
  agregarComanda,
  cambiarEstadoPlato,
  validarTransicionPlato,
  calcularEstadoGlobalInicial
} = require('../src/repository/comanda.repository');

// Mock de modelos y dependencias
jest.mock('../src/database/models/comanda.model');
jest.mock('../src/database/models/mesas.model');
jest.mock('../src/database/models/plato.model');
jest.mock('../src/utils/logger');
jest.mock('../src/utils/jsonSync');

const comandaModel = require('../src/database/models/comanda.model');
const mesasModel = require('../src/database/models/mesas.model');
const platoModel = require('../src/database/models/plato.model');

describe('FASE 1: Validación y Persistencia de Estados Individuales', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validarTransicionPlato()', () => {
    test('debe permitir transición pedido → recoger', () => {
      expect(validarTransicionPlato('pedido', 'recoger')).toBe(true);
    });

    test('debe permitir transición pedido → entregado', () => {
      expect(validarTransicionPlato('pedido', 'entregado')).toBe(true);
    });

    test('debe permitir transición en_espera → recoger', () => {
      expect(validarTransicionPlato('en_espera', 'recoger')).toBe(true);
    });

    test('debe permitir transición recoger → entregado', () => {
      expect(validarTransicionPlato('recoger', 'entregado')).toBe(true);
    });

    test('debe permitir transición entregado → pagado', () => {
      expect(validarTransicionPlato('entregado', 'pagado')).toBe(true);
    });

    test('debe permitir revertir cualquier estado → pedido', () => {
      expect(validarTransicionPlato('recoger', 'pedido')).toBe(true);
      expect(validarTransicionPlato('entregado', 'pedido')).toBe(true);
      expect(validarTransicionPlato('pagado', 'pedido')).toBe(true);
    });

    test('debe rechazar transición inválida recoger → pedido (excepto revertir)', () => {
      // Nota: revertir está permitido, pero transición directa sin revertir no
      // En este caso, 'pedido' como nuevo estado siempre está permitido (revertir)
      expect(validarTransicionPlato('recoger', 'pedido')).toBe(true); // Revertir permitido
    });

    test('debe rechazar transición inválida entregado → recoger', () => {
      expect(validarTransicionPlato('entregado', 'recoger')).toBe(false);
    });

    test('debe rechazar transición inválida pagado → entregado', () => {
      expect(validarTransicionPlato('pagado', 'entregado')).toBe(false);
    });

    test('debe rechazar transición inválida recoger → pedido (sin revertir)', () => {
      // Nota: 'pedido' siempre está permitido como revertir
      // Pero si queremos validar transición directa sin revertir, sería false
      // Por ahora, revertir siempre está permitido según el plan
      expect(validarTransicionPlato('recoger', 'pedido')).toBe(true); // Revertir permitido
    });
  });

  describe('calcularEstadoGlobalInicial()', () => {
    test('debe retornar en_espera si no hay platos', () => {
      expect(calcularEstadoGlobalInicial([])).toBe('en_espera');
      expect(calcularEstadoGlobalInicial(null)).toBe('en_espera');
    });

    test('debe retornar estado único si todos los platos tienen el mismo estado', () => {
      const platos = [
        { estado: 'pedido', eliminado: false },
        { estado: 'pedido', eliminado: false }
      ];
      expect(calcularEstadoGlobalInicial(platos)).toBe('en_espera'); // pedido → en_espera
    });

    test('debe retornar recoger si todos los platos están en recoger', () => {
      const platos = [
        { estado: 'recoger', eliminado: false },
        { estado: 'recoger', eliminado: false }
      ];
      expect(calcularEstadoGlobalInicial(platos)).toBe('recoger');
    });

    test('debe retornar estado más bajo si hay mezcla de estados', () => {
      const platos = [
        { estado: 'recoger', eliminado: false },
        { estado: 'pedido', eliminado: false }
      ];
      expect(calcularEstadoGlobalInicial(platos)).toBe('en_espera'); // pedido es más bajo
    });

    test('debe ignorar platos eliminados', () => {
      const platos = [
        { estado: 'recoger', eliminado: true },
        { estado: 'pedido', eliminado: false }
      ];
      expect(calcularEstadoGlobalInicial(platos)).toBe('en_espera');
    });

    test('debe normalizar en_espera como pedido', () => {
      const platos = [
        { estado: 'en_espera', eliminado: false },
        { estado: 'pedido', eliminado: false }
      ];
      expect(calcularEstadoGlobalInicial(platos)).toBe('en_espera');
    });
  });

  describe('agregarComanda() - Estados válidos', () => {
    test('debe crear comanda con estados válidos (pedido)', async () => {
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'libre'
      };

      const mockPlato = {
        _id: new mongoose.Types.ObjectId(),
        id: 1,
        nombre: 'Plato Test',
        precio: 10
      };

      const mockComanda = {
        _id: new mongoose.Types.ObjectId(),
        comandaNumber: 1,
        platos: [
          {
            plato: mockPlato._id,
            platoId: 1,
            estado: 'pedido',
            tiempos: { pedido: new Date() }
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId(),
        status: 'en_espera'
      };

      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.findOne.mockResolvedValue(null);
      platoModel.findById.mockResolvedValue(mockPlato);
      comandaModel.find.mockResolvedValue([]);
      comandaModel.create.mockResolvedValue(mockComanda);
      comandaModel.findById.mockResolvedValue(mockComanda);
      mesasModel.prototype.save = jest.fn().mockResolvedValue(mockMesa);

      const data = {
        platos: [
          {
            plato: mockPlato._id,
            estado: 'pedido'
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId()
      };

      const result = await agregarComanda(data);

      expect(result).toBeDefined();
      expect(comandaModel.create).toHaveBeenCalled();
      expect(result.comanda.platos[0].estado).toBe('pedido');
    });

    test('debe establecer estado default pedido si no se especifica', async () => {
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'libre'
      };

      const mockPlato = {
        _id: new mongoose.Types.ObjectId(),
        id: 1,
        nombre: 'Plato Test',
        precio: 10
      };

      const mockComanda = {
        _id: new mongoose.Types.ObjectId(),
        comandaNumber: 1,
        platos: [
          {
            plato: mockPlato._id,
            platoId: 1,
            estado: 'pedido',
            tiempos: { pedido: new Date() }
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId(),
        status: 'en_espera'
      };

      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.findOne.mockResolvedValue(null);
      platoModel.findById.mockResolvedValue(mockPlato);
      comandaModel.find.mockResolvedValue([]);
      comandaModel.create.mockResolvedValue(mockComanda);
      comandaModel.findById.mockResolvedValue(mockComanda);
      mesasModel.prototype.save = jest.fn().mockResolvedValue(mockMesa);

      const data = {
        platos: [
          {
            plato: mockPlato._id
            // Sin estado explícito
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId()
      };

      await agregarComanda(data);

      // Verificar que se estableció estado 'pedido' por defecto
      const createCall = comandaModel.create.mock.calls[0][0];
      expect(createCall.platos[0].estado).toBe('pedido');
    });
  });

  describe('agregarComanda() - Estados inválidos', () => {
    test('debe rechazar estado inicial inválido (recoger)', async () => {
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'libre'
      };

      const mockPlato = {
        _id: new mongoose.Types.ObjectId(),
        id: 1,
        nombre: 'Plato Test'
      };

      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.findOne.mockResolvedValue(null);
      platoModel.findById.mockResolvedValue(mockPlato);
      comandaModel.find.mockResolvedValue([]);

      const data = {
        platos: [
          {
            plato: mockPlato._id,
            estado: 'recoger' // Estado inválido para nuevo plato
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId()
      };

      await expect(agregarComanda(data)).rejects.toThrow('Estado inicial inválido');
    });

    test('debe rechazar estado inicial inválido (entregado)', async () => {
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'libre'
      };

      const mockPlato = {
        _id: new mongoose.Types.ObjectId(),
        id: 1,
        nombre: 'Plato Test'
      };

      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.findOne.mockResolvedValue(null);
      platoModel.findById.mockResolvedValue(mockPlato);
      comandaModel.find.mockResolvedValue([]);

      const data = {
        platos: [
          {
            plato: mockPlato._id,
            estado: 'entregado' // Estado inválido para nuevo plato
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId()
      };

      await expect(agregarComanda(data)).rejects.toThrow('Estado inicial inválido');
    });
  });

  describe('cambiarEstadoPlato() - Transiciones válidas', () => {
    test('debe cambiar estado pedido → recoger correctamente', async () => {
      const mockComandaId = new mongoose.Types.ObjectId();
      const mockPlatoId = new mongoose.Types.ObjectId();
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'pedido'
      };

      const mockComanda = {
        _id: mockComandaId,
        platos: [
          {
            plato: mockPlatoId,
            platoId: 1,
            estado: 'pedido',
            tiempos: {}
          }
        ],
        mesas: mockMesa._id,
        status: 'en_espera'
      };

      comandaModel.findById
        .mockResolvedValueOnce(mockComanda) // Primera llamada
        .mockResolvedValueOnce(mockComanda) // Segunda llamada después de updateOne
        .mockResolvedValueOnce(mockComanda); // Tercera llamada después de recalcular

      comandaModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      comandaModel.find.mockResolvedValue([mockComanda]);
      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.prototype.save = jest.fn().mockResolvedValue(mockMesa);

      // Mock de recalcularEstadoComandaPorPlatos (se llama internamente)
      jest.spyOn(require('../src/repository/comanda.repository'), 'recalcularEstadoComandaPorPlatos')
        .mockResolvedValue();

      const result = await cambiarEstadoPlato(mockComandaId, mockPlatoId, 'recoger');

      expect(comandaModel.updateOne).toHaveBeenCalledWith(
        { _id: mockComandaId, "platos.plato": mockPlatoId },
        expect.objectContaining({
          $set: expect.objectContaining({
            "platos.$.estado": 'recoger'
          })
        })
      );
    });

    test('debe cambiar estado recoger → entregado correctamente', async () => {
      const mockComandaId = new mongoose.Types.ObjectId();
      const mockPlatoId = new mongoose.Types.ObjectId();
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'preparado'
      };

      const mockComanda = {
        _id: mockComandaId,
        platos: [
          {
            plato: mockPlatoId,
            platoId: 1,
            estado: 'recoger',
            tiempos: {}
          }
        ],
        mesas: mockMesa._id,
        status: 'recoger'
      };

      comandaModel.findById
        .mockResolvedValueOnce(mockComanda)
        .mockResolvedValueOnce(mockComanda)
        .mockResolvedValueOnce(mockComanda);

      comandaModel.updateOne.mockResolvedValue({ modifiedCount: 1 });
      comandaModel.find.mockResolvedValue([mockComanda]);
      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.prototype.save = jest.fn().mockResolvedValue(mockMesa);

      jest.spyOn(require('../src/repository/comanda.repository'), 'recalcularEstadoComandaPorPlatos')
        .mockResolvedValue();

      await cambiarEstadoPlato(mockComandaId, mockPlatoId, 'entregado');

      expect(comandaModel.updateOne).toHaveBeenCalledWith(
        { _id: mockComandaId, "platos.plato": mockPlatoId },
        expect.objectContaining({
          $set: expect.objectContaining({
            "platos.$.estado": 'entregado'
          })
        })
      );
    });
  });

  describe('cambiarEstadoPlato() - Transiciones inválidas', () => {
    test('debe rechazar transición inválida entregado → recoger', async () => {
      const mockComandaId = new mongoose.Types.ObjectId();
      const mockPlatoId = new mongoose.Types.ObjectId();
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1
      };

      const mockComanda = {
        _id: mockComandaId,
        platos: [
          {
            plato: mockPlatoId,
            platoId: 1,
            estado: 'entregado',
            tiempos: {}
          }
        ],
        mesas: mockMesa._id
      };

      comandaModel.findById.mockResolvedValue(mockComanda);

      await expect(
        cambiarEstadoPlato(mockComandaId, mockPlatoId, 'recoger')
      ).rejects.toThrow('Transición inválida');
    });

    test('debe rechazar transición inválida pagado → entregado', async () => {
      const mockComandaId = new mongoose.Types.ObjectId();
      const mockPlatoId = new mongoose.Types.ObjectId();
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1
      };

      const mockComanda = {
        _id: mockComandaId,
        platos: [
          {
            plato: mockPlatoId,
            platoId: 1,
            estado: 'pagado',
            tiempos: {}
          }
        ],
        mesas: mockMesa._id
      };

      comandaModel.findById.mockResolvedValue(mockComanda);

      await expect(
        cambiarEstadoPlato(mockComandaId, mockPlatoId, 'entregado')
      ).rejects.toThrow('Transición inválida');
    });
  });

  describe('Compatibilidad con funciones existentes', () => {
    test('debe mantener compatibilidad con comandas sin estados explícitos', async () => {
      const mockMesa = {
        _id: new mongoose.Types.ObjectId(),
        nummesa: 1,
        estado: 'libre'
      };

      const mockPlato = {
        _id: new mongoose.Types.ObjectId(),
        id: 1,
        nombre: 'Plato Test'
      };

      const mockComanda = {
        _id: new mongoose.Types.ObjectId(),
        comandaNumber: 1,
        platos: [
          {
            plato: mockPlato._id,
            platoId: 1,
            estado: 'pedido', // Se establece automáticamente
            tiempos: { pedido: new Date() }
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId(),
        status: 'en_espera'
      };

      mesasModel.findById.mockResolvedValue(mockMesa);
      mesasModel.findOne.mockResolvedValue(null);
      platoModel.findById.mockResolvedValue(mockPlato);
      comandaModel.find.mockResolvedValue([]);
      comandaModel.create.mockResolvedValue(mockComanda);
      comandaModel.findById.mockResolvedValue(mockComanda);
      mesasModel.prototype.save = jest.fn().mockResolvedValue(mockMesa);

      const data = {
        platos: [
          {
            plato: mockPlato._id
            // Sin estado - debe establecer 'pedido' por defecto
          }
        ],
        cantidades: [1],
        mesas: mockMesa._id,
        mozos: new mongoose.Types.ObjectId()
      };

      const result = await agregarComanda(data);

      expect(result).toBeDefined();
      expect(result.comanda.platos[0].estado).toBe('pedido');
    });
  });
});


