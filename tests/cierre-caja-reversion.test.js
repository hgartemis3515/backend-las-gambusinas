'use strict';

const {
  normalizarMotivoReversion,
  FILTRO_CIERRE_VIGENTE
} = require('../src/utils/cierreCajaReversion');

describe('cierreCajaReversion', () => {
  test('rechaza motivo vacío o corto', () => {
    expect(() => normalizarMotivoReversion('')).toThrow(/motivo/i);
    expect(() => normalizarMotivoReversion('abc')).toThrow(/8 caracteres/);
    expect(() => normalizarMotivoReversion('   ok   ')).toThrow(/8 caracteres/);
  });

  test('acepta motivo de auditoría y recorta espacios', () => {
    expect(normalizarMotivoReversion('  Cierre por error del turno  ')).toBe('Cierre por error del turno');
  });

  test('rechaza motivo demasiado largo', () => {
    expect(() => normalizarMotivoReversion('x'.repeat(501))).toThrow(/500/);
  });

  test('filtro vigente excluye revertidos', () => {
    expect(FILTRO_CIERRE_VIGENTE).toEqual({ estado: { $ne: 'revertido' } });
  });
});
