const { mesaIdEsValido } = require('../src/repository/ticketPagoAdelantado.repository');

describe('PPA sin mesa', () => {
  test('mesaIdEsValido rechaza undefined y strings basura', () => {
    expect(mesaIdEsValido(undefined)).toBe(false);
    expect(mesaIdEsValido(null)).toBe(false);
    expect(mesaIdEsValido('undefined')).toBe(false);
    expect(mesaIdEsValido('null')).toBe(false);
    expect(mesaIdEsValido('')).toBe(false);
    expect(mesaIdEsValido('6a9e1c8de3b12d5d734ed1ee')).toBe(true);
  });
});
