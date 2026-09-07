'use strict';

const {
  expandirHexColor,
  sanitizarColorPerfil,
} = require('../src/utils/colorPerfilMozo');

describe('colorPerfilMozo', () => {
  test('acepta #rrggbb y lo normaliza a minúsculas', () => {
    expect(sanitizarColorPerfil('#1E3A8A')).toBe('#1e3a8a');
  });

  test('expande #rgb a #rrggbb', () => {
    expect(expandirHexColor('#abc')).toBe('#aabbcc');
    expect(sanitizarColorPerfil('b53')).toBe('#bb5533');
  });

  test('cae a vacío (sin color personalizado) si el valor no es hex', () => {
    expect(sanitizarColorPerfil('azul')).toBe('');
    expect(sanitizarColorPerfil('')).toBe('');
    expect(sanitizarColorPerfil(null)).toBe('');
  });
});
