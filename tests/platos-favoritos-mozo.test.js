const { sanitizePlatosFavoritos } = require('../src/utils/platosFavoritosMozo');

describe('sanitizePlatosFavoritos', () => {
  test('deduplica y descarta ids inválidos', () => {
    const a = '507f1f77bcf86cd799439011';
    const b = '507f1f77bcf86cd799439012';
    expect(sanitizePlatosFavoritos([a, a, { _id: b }, 'nope', null])).toEqual([a, b]);
  });
});
