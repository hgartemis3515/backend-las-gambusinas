'use strict';

const {
  ymdOperativo,
  ymdCalendario,
  boundsDiaCalendario,
  rangoLima
} = require('../src/utils/diaOperativoRestaurante');
const { matchComandasEstadisticas } = require('../src/utils/estadisticasComandas');

describe('diaOperativoRestaurante 04:00–04:00', () => {
  test('00:36 Lima pertenece al día anterior', () => {
    expect(ymdOperativo(new Date('2026-09-20T05:36:00.000Z'))).toBe('2026-09-19');
  });

  test('04:00 Lima abre el día nuevo', () => {
    expect(ymdOperativo(new Date('2026-09-20T09:00:00.000Z'))).toBe('2026-09-20');
  });

  test('03:59 Lima sigue en el ciclo anterior', () => {
    expect(ymdOperativo(new Date('2026-09-20T08:59:00.000Z'))).toBe('2026-09-19');
  });

  test('rango Hoy 19-sep no incluye cobro 00:17 del 19 (comanda del 18)', () => {
    const { inicio, fin } = rangoLima('2026-09-19', '2026-09-19');
    const created18 = new Date('2026-09-18T19:01:54.000Z'); // 14:01 Lima
    const pagado0017 = new Date('2026-09-19T05:17:09.000Z'); // 00:17 Lima
    expect(created18 < inicio).toBe(true);
    expect(pagado0017 < inicio).toBe(true);
    expect(pagado0017 < fin).toBe(true);
    const m = matchComandasEstadisticas(inicio, fin);
    expect(m.createdAt.$gte).toEqual(inicio);
    expect(m.$or).toBeUndefined();
  });
});

describe('inventario día calendario 00:00–23:59 Lima', () => {
  test('00:30 Lima ya es el día nuevo', () => {
    expect(ymdCalendario(new Date('2026-09-20T05:30:00.000Z'))).toBe('2026-09-20');
  });

  test('el día cierra a las 23:59 Lima', () => {
    const { inicio, fin } = boundsDiaCalendario('2026-10-16');
    expect(inicio.toISOString()).toBe('2026-10-16T05:00:00.000Z');
    expect(fin.toISOString()).toBe('2026-10-17T04:59:59.999Z');
  });
});
