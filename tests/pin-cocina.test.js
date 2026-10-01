const { PIN_COCINA_MIN, PIN_COCINA_MAX, normalizarPinCocina, esPinCocinaValido } = require('../src/utils/pinCocina');
const { evaluarReasignacionProcesamiento } = require('../src/utils/reasignacionProcesamiento');

describe('pinCocina', () => {
  test('acepta 6, 7 u 8 dígitos', () => {
    expect(PIN_COCINA_MIN).toBe(6);
    expect(PIN_COCINA_MAX).toBe(8);
    expect(esPinCocinaValido('123456')).toBe(true);
    expect(esPinCocinaValido('1234567')).toBe(true);
    expect(esPinCocinaValido('12345678')).toBe(true);
    expect(esPinCocinaValido('1234')).toBe(false);
    expect(esPinCocinaValido('123456789')).toBe(false);
  });

  test('normaliza recortando a 8', () => {
    expect(normalizarPinCocina('12ab34cd5678')).toBe('12345678');
  });
});

describe('evaluarReasignacionProcesamiento', () => {
  test('el holder puede transferir con forzar', () => {
    const r = evaluarReasignacionProcesamiento({
      adminId: 'a1',
      esSupervisor: false,
      holderId: 'a1',
      nuevoCocineroId: 'b2',
      forzar: true
    });
    expect(r.ok).toBe(true);
  });

  test('otro cocinero no puede tomar un plato ajeno', () => {
    const r = evaluarReasignacionProcesamiento({
      adminId: 'c3',
      esSupervisor: false,
      holderId: 'a1',
      nuevoCocineroId: 'c3',
      forzar: false
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(409);
  });

  test('supervisor con forzar reasigna', () => {
    const r = evaluarReasignacionProcesamiento({
      adminId: 'sup',
      esSupervisor: true,
      holderId: 'a1',
      nuevoCocineroId: 'b2',
      forzar: true
    });
    expect(r.ok).toBe(true);
  });
});
