'use strict';

const { boundsLimaDay, obtenerTurnosDia, resolverPeriodoPendienteCierre } = require('../src/utils/cierreCajaTurnosDia');
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

describe('resolverPeriodoPendienteCierre', () => {
  const now = new Date('2026-09-06T01:00:00.000Z'); // 05 sep 2026 20:00 Lima

  test('sin cierre previo empieza hoy a las 00:00 Lima, no en 2024', () => {
    const r = resolverPeriodoPendienteCierre(null, now);
    expect(r.periodoInicio.toISOString()).toBe('2026-09-05T05:00:00.000Z');
    expect(r.periodoFin.toISOString()).toBe(now.toISOString());
  });

  test('cierre de ayer no arrastra comandas de días anteriores', () => {
    const r = resolverPeriodoPendienteCierre({
      periodoFin: new Date('2026-09-04T22:00:00.000Z')
    }, now);
    expect(r.periodoInicio.toISOString()).toBe('2026-09-05T05:00:00.000Z');
  });

  test('si ya cerraron hoy, el período sigue desde ese cierre', () => {
    const finTurnoDia = new Date('2026-09-05T20:00:00.000Z'); // 15:00 Lima
    const r = resolverPeriodoPendienteCierre({ periodoFin: finTurnoDia }, now);
    expect(r.periodoInicio.toISOString()).toBe(finTurnoDia.toISOString());
  });
});
