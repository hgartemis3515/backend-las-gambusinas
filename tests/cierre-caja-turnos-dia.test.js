'use strict';

const { boundsLimaDay, obtenerTurnosDia } = require('../src/utils/cierreCajaTurnosDia');
const { FILTRO_CIERRE_VIGENTE } = require('../src/utils/cierreCajaReversion');

function mockCierreModel(docs) {
  const captured = {};
  return {
    captured,
    find(q) {
      captured.query = q;
      return {
        sort(s) {
          captured.sort = s;
          return {
            select() {
              return {
                lean: async () => docs
              };
            }
          };
        }
      };
    }
  };
}

describe('cierreCajaTurnosDia', () => {
  test('boundsLimaDay usa el día Perú, no UTC', () => {
    // 29 ago 2026 20:08 Lima = 30 ago 01:08 UTC
    const now = new Date('2026-08-30T01:08:00.000Z');
    const b = boundsLimaDay(now);
    expect(b.limaYMD).toBe('2026-08-29');
    expect(b.inicio.toISOString()).toBe('2026-08-29T05:00:00.000Z');
  });

  test('sin cierres vigentes no activa DIA/NOCHE', async () => {
    const Model = mockCierreModel([]);
    const r = await obtenerTurnosDia(Model, new Date('2026-08-29T22:00:00.000Z'));
    expect(r.hayCierreHoy).toBe(false);
    expect(r.cantidad).toBe(0);
    expect(r.primerCierreAt).toBe(null);
    expect(Model.captured.query.estado).toEqual(FILTRO_CIERRE_VIGENTE.estado);
  });

  test('el corte es el primer cierre del día Lima', async () => {
    const primero = new Date('2026-08-29T22:00:00.000Z'); // 17:00 Lima
    const segundo = new Date('2026-08-30T03:00:00.000Z'); // 22:00 Lima
    const Model = mockCierreModel([
      { fechaCierre: primero },
      { fechaCierre: segundo }
    ]);
    const r = await obtenerTurnosDia(Model, new Date('2026-08-30T04:00:00.000Z'));
    expect(r.hayCierreHoy).toBe(true);
    expect(r.cantidad).toBe(2);
    expect(r.limaYMD).toBe('2026-08-29');
    expect(r.primerCierreAt).toEqual(primero);
    expect(Model.captured.sort).toEqual({ fechaCierre: 1 });
  });
});
