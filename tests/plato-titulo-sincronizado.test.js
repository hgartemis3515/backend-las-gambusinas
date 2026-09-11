const {
  CAMPOS_GRUPO_PRINCIPAL,
  tituloUnicoVariante,
} = require('../src/repository/plato.repository');

describe('títulos de platos sincronizados', () => {
  test('el grupo no pisa el nombre (título de mozos)', () => {
    expect(CAMPOS_GRUPO_PRINCIPAL).not.toContain('nombre');
    expect(CAMPOS_GRUPO_PRINCIPAL).toContain('precio');
    expect(CAMPOS_GRUPO_PRINCIPAL).toContain('codigoMozo');
  });

  test('tituloUnicoVariante no repite el del principal', () => {
    const usados = new Set(['pollo leña']);
    expect(tituloUnicoVariante('Pollo leña', usados, 0)).toBe('Pollo leña 2');
    expect(tituloUnicoVariante('Leña Papa', usados, 0)).toBe('Leña Papa');
    expect(tituloUnicoVariante('Leña Papa', usados, 1)).toBe('Leña Papa 2');
  });
});
