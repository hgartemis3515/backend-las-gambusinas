/**
 * Tests unitarios básicos para comanda.repository.js
 * Ejecutar con: npm test
 */

const { validarTransicionEstado } = require('../src/repository/comanda.repository');

describe('Comanda Repository - Validaciones', () => {
  describe('validarTransicionEstado', () => {
    test('debe permitir transición en_espera -> recoger', () => {
      expect(validarTransicionEstado('en_espera', 'recoger')).toBe(true);
    });

    test('debe permitir transición recoger -> entregado', () => {
      expect(validarTransicionEstado('recoger', 'entregado')).toBe(true);
    });

    test('debe permitir transición entregado -> pagado', () => {
      expect(validarTransicionEstado('entregado', 'pagado')).toBe(true);
    });

    test('debe permitir revertir a en_espera desde cualquier estado', () => {
      expect(validarTransicionEstado('recoger', 'en_espera')).toBe(true);
      expect(validarTransicionEstado('entregado', 'en_espera')).toBe(true);
      expect(validarTransicionEstado('pagado', 'en_espera')).toBe(true);
    });

    test('debe rechazar transición inválida: pagado -> recoger', () => {
      expect(validarTransicionEstado('pagado', 'recoger')).toBe(false);
    });

    test('debe rechazar transición inválida: entregado -> recoger', () => {
      expect(validarTransicionEstado('entregado', 'recoger')).toBe(false);
    });

    test('debe rechazar transición inválida: en_espera -> entregado', () => {
      expect(validarTransicionEstado('en_espera', 'entregado')).toBe(false);
    });
  });
});

