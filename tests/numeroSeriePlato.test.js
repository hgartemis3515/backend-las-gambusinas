const {
  normalizarNumeroSerie,
  numeroSerieEsValido,
  platoRequiereNumeroSerie,
  recolectarNumeroSerie,
  aplicarNumeroSerieComanda
} = require('../src/utils/numeroSeriePlato');

describe('numeroSeriePlato', () => {
  test('normaliza a 2–4 dígitos', () => {
    expect(normalizarNumeroSerie('12')).toBe('12');
    expect(normalizarNumeroSerie(' 0345 ')).toBe('0345');
    expect(normalizarNumeroSerie('12ab34')).toBe('1234');
    expect(normalizarNumeroSerie('12345')).toBe('1234');
    expect(numeroSerieEsValido('1')).toBe(false);
    expect(numeroSerieEsValido('12')).toBe(true);
    expect(numeroSerieEsValido('1234')).toBe(true);
    expect(numeroSerieEsValido('abc')).toBe(false);
  });

  test('platoRequiereNumeroSerie lee snapshot o catálogo', () => {
    expect(platoRequiereNumeroSerie({ requiereNumeroSerie: true })).toBe(true);
    expect(platoRequiereNumeroSerie({ plato: { requiereNumeroSerie: true } })).toBe(true);
    expect(platoRequiereNumeroSerie({}, { requiereNumeroSerie: true })).toBe(true);
    expect(platoRequiereNumeroSerie({})).toBe(false);
  });

  test('aplicarNumeroSerieComanda exige serie si el catálogo lo pide', () => {
    const map = new Map([['dch', { requiereNumeroSerie: true }]]);
    expect(() => aplicarNumeroSerieComanda({ platos: [{ plato: 'dch' }] }, map)).toThrow(/número de serie/);
    const data = { platos: [{ plato: 'dch', numeroSerie: '07' }] };
    expect(aplicarNumeroSerieComanda(data, map)).toBe('07');
    expect(data.numeroSerie).toBe('07');
    expect(data.platos[0].numeroSerie).toBe('07');
  });

  test('recolecta serie a nivel comanda', () => {
    expect(recolectarNumeroSerie({ numeroSerie: '99', platos: [] })).toBe('99');
  });
});
