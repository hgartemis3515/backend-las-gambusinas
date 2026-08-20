'use strict';

const {
  platoListoCocinaHist,
  resolverTomadoEnAlFinalizar,
  tomadoEnPlato,
  listoEnPlato,
  tiempoPrepPlatoSegundos
} = require('../src/utils/tiemposPrepPlato');

describe('tiemposPrepPlato', () => {
  const tomado = new Date('2026-08-20T12:00:00.000Z');
  const listo = new Date('2026-08-20T12:08:30.000Z');

  test('tras finalizar KDS (recoger) usa tomadoEn distinto de listo y duración > 0', () => {
    const p = {
      estado: 'recoger',
      tiempos: { recoger: listo },
      procesandoPor: { cocineroId: null, timestamp: null },
      procesadoPor: { cocineroId: 'c1', timestamp: listo, tomadoEn: tomado }
    };
    expect(tomadoEnPlato(p)).toEqual(tomado);
    expect(listoEnPlato(p)).toEqual(listo);
    expect(tiempoPrepPlatoSegundos(p)).toBe(510);
    expect(platoListoCocinaHist(p)).toBe(true);
  });

  test('no usa procesadoPor.timestamp como tomado (evita cronómetro 00:00)', () => {
    const p = {
      estado: 'recoger',
      tiempos: { recoger: listo },
      procesadoPor: { timestamp: listo }
    };
    expect(tomadoEnPlato(p)).toBeNull();
    expect(listoEnPlato(p)).toEqual(listo);
    expect(tiempoPrepPlatoSegundos(p)).toBeNull();
  });

  test('resolverTomadoEnAlFinalizar no cae al instante de listo', () => {
    const ahora = new Date('2026-08-20T12:08:30.000Z');
    const item = {
      procesandoPor: { timestamp: tomado },
      asignacionMeta: { timestamp: new Date('2026-08-20T11:59:00.000Z') }
    };
    expect(resolverTomadoEnAlFinalizar(item)).toEqual(tomado);
    expect(resolverTomadoEnAlFinalizar({ tiempos: { en_espera: tomado } })).toEqual(tomado);
    expect(resolverTomadoEnAlFinalizar({})).toBeNull();
    expect(resolverTomadoEnAlFinalizar({ procesadoPor: { timestamp: ahora } })).toBeNull();
  });

  test('plato en curso usa ahora como fin del cronómetro', () => {
    const ahora = new Date('2026-08-20T12:02:00.000Z');
    const p = {
      estado: 'en_espera',
      procesandoPor: { cocineroId: 'c1', timestamp: tomado }
    };
    expect(tiempoPrepPlatoSegundos(p, ahora)).toBe(120);
    expect(listoEnPlato(p)).toBeNull();
  });
});
