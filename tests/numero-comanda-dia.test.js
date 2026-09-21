const { seqDeResultado } = require('../src/utils/numeroComandaDia');
const { ymdOperativo } = require('../src/utils/diaOperativoRestaurante');

describe('numero comanda del día', () => {
  test('lee seq del driver nuevo y del wrapper value', () => {
    expect(seqDeResultado({ seq: 4 })).toBe(4);
    expect(seqDeResultado({ value: { seq: 7 } })).toBe(7);
    expect(seqDeResultado(null)).toBe(null);
    expect(seqDeResultado({ seq: 0 })).toBe(null);
  });

  test('antes de las 04:00 Lima sigue el día anterior', () => {
    expect(ymdOperativo(new Date('2026-09-21T09:00:00.000Z'))).toBe('2026-09-21');
    expect(ymdOperativo(new Date('2026-09-21T08:30:00.000Z'))).toBe('2026-09-20');
  });
});
