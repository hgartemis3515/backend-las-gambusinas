/**
 * FASE 3: Tests para el flujo SALIO (estado intermedio recoger -> salio -> entregado)
 */

const {
  validarTransicionPlato,
  validarTransicionEstado,
  calcularEstadoGlobalInicial
} = require('../src/repository/comanda.repository');

jest.mock('../src/database/models/comanda.model');
jest.mock('../src/database/models/mesas.model');
jest.mock('../src/database/models/plato.model');
jest.mock('../src/utils/logger');
jest.mock('../src/utils/jsonSync');

describe('FASE 3: Flujo SALIO', () => {
  describe('validarTransicionPlato()', () => {
    test('recoger -> salio debe ser valido', () => {
      expect(validarTransicionPlato('recoger', 'salio')).toBe(true);
    });
    test('salio -> entregado debe ser valido', () => {
      expect(validarTransicionPlato('salio', 'entregado')).toBe(true);
    });
    test('pedido -> recoger sigue siendo valido', () => {
      expect(validarTransicionPlato('pedido', 'recoger')).toBe(true);
    });
    test('entregado -> pagado sigue siendo valido', () => {
      expect(validarTransicionPlato('entregado', 'pagado')).toBe(true);
    });
    test('recoger -> entregado debe estar BLOQUEADO (flujo SALIO)', () => {
      expect(validarTransicionPlato('recoger', 'entregado')).toBe(false);
    });
    test('salio -> recoger debe estar BLOQUEADO', () => {
      expect(validarTransicionPlato('salio', 'recoger')).toBe(false);
    });
    test('salio -> pagado debe estar BLOQUEADO', () => {
      expect(validarTransicionPlato('salio', 'pagado')).toBe(false);
    });
    test('entregado -> salio debe estar BLOQUEADO', () => {
      expect(validarTransicionPlato('entregado', 'salio')).toBe(false);
    });
    test('revertir salio a pedido es valido', () => {
      expect(validarTransicionPlato('salio', 'pedido')).toBe(true);
    });
    test('revertir salio a en_espera es valido', () => {
      expect(validarTransicionPlato('salio', 'en_espera')).toBe(true);
    });
  });

  describe('validarTransicionEstado()', () => {
    test('recoger -> salio es valido', () => {
      expect(validarTransicionEstado('recoger', 'salio')).toBe(true);
    });
    test('salio -> entregado es valido', () => {
      expect(validarTransicionEstado('salio', 'entregado')).toBe(true);
    });
    test('en_espera -> salio es valido', () => {
      expect(validarTransicionEstado('en_espera', 'salio')).toBe(true);
    });
    test('revertir salio a en_espera', () => {
      expect(validarTransicionEstado('salio', 'en_espera')).toBe(true);
    });
    test('cancelar salio', () => {
      expect(validarTransicionEstado('salio', 'cancelado')).toBe(true);
    });
  });

  describe('calcularEstadoGlobalInicial()', () => {
    test('todos en salio -> comanda en recoger', () => {
      expect(calcularEstadoGlobalInicial(['salio'])).toBe('recoger');
    });
    test('mix salio + recoger -> comanda en recoger', () => {
      expect(calcularEstadoGlobalInicial(['salio', 'recoger'])).toBe('recoger');
    });
    test('mix salio + entregado -> comanda en en_espera', () => {
      expect(calcularEstadoGlobalInicial(['salio', 'entregado'])).toBe('en_espera');
    });
    test('todos en recoger -> comanda en recoger', () => {
      expect(calcularEstadoGlobalInicial(['recoger'])).toBe('recoger');
    });
    test('todos en entregado -> comanda en entregado', () => {
      expect(calcularEstadoGlobalInicial(['entregado'])).toBe('entregado');
    });
  });
});
