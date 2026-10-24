'use strict';

const { destinosDe, normalizarDestinos } = require('../src/repository/noticias.repository');

describe('destinos de la noticia', () => {
  test('sin lista: mozos y cocina, caja no entra sola', () => {
    expect(destinosDe({})).toEqual(['mozos', 'cocina']);
    expect(normalizarDestinos(undefined)).toEqual(['mozos', 'cocina']);
  });

  test('cocina y caja pueden ir juntos; mozos no los borra', () => {
    expect(destinosDe({ destinos: ['cocina', 'caja'] })).toEqual(['cocina', 'caja']);
    expect(destinosDe({ destinos: ['mozos', 'cocina', 'caja'] })).toEqual(['mozos', 'cocina', 'caja']);
  });

  test('vacío o desconocido no se guarda', () => {
    expect(() => destinosDe({ destinos: [] })).toThrow(/quién llega/);
    expect(() => destinosDe({ destinos: ['barra'] })).toThrow(/quién llega/);
  });
});
