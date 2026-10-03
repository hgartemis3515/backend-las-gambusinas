const { seqDeResultado } = require('../src/utils/numeroComandaDia');

describe('numero comanda dia', () => {
  test('lee seq del contador incremental', () => {
    expect(seqDeResultado({ seq: 8 })).toBe(8);
    expect(seqDeResultado({ value: { seq: 3 } })).toBe(3);
    expect(seqDeResultado({})).toBeNull();
  });
});
