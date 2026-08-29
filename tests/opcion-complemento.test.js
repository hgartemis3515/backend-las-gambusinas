const { normalizarOpcionDocumento } = require('../src/utils/opcionComplemento');

describe('normalizarOpcionDocumento', () => {
  test('conserva preselección y cantidad', () => {
    const out = normalizarOpcionDocumento({
      nombre: 'Papa frita',
      precio: 2,
      pronombre: 'P FRITA',
      preseleccionada: true,
      cantidadPreseleccion: 3,
    });
    expect(out).toEqual({
      nombre: 'Papa frita',
      precio: 2,
      pronombre: 'P FRITA',
      preseleccionada: true,
      cantidadPreseleccion: 3,
    });
  });

  test('string legacy no viene preseleccionada', () => {
    expect(normalizarOpcionDocumento('Ensalada')).toEqual({
      nombre: 'Ensalada',
      precio: 0,
      pronombre: '',
      preseleccionada: false,
      cantidadPreseleccion: 1,
    });
  });
});
