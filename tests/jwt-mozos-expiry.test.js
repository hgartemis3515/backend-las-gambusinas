'use strict';

const { resolverExpiryJwtMozos } = require('../src/utils/jwtMozosExpiry');

describe('resolverExpiryJwtMozos', () => {
  test('sin Recordarme: 12 horas', () => {
    expect(resolverExpiryJwtMozos(false)).toBe('12h');
    expect(resolverExpiryJwtMozos(undefined)).toBe('12h');
    expect(resolverExpiryJwtMozos(null)).toBe('12h');
  });

  test('Recordarme: 7 días', () => {
    expect(resolverExpiryJwtMozos(true)).toBe('7d');
    expect(resolverExpiryJwtMozos('true')).toBe('7d');
    expect(resolverExpiryJwtMozos(1)).toBe('7d');
  });
});
