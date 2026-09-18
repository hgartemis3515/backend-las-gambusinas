const { toCartaMozo, idCarta } = require('../src/utils/cartaMozoPlato');

describe('toCartaMozo', () => {
  test('proyecta whitelist e incluye complementos vacíos', () => {
    const carta = toCartaMozo({
      _id: 'abc',
      id: 7,
      nombre: 'Lomo',
      precio: 28,
      descripcion: 'no debe ir',
      nombreCocina: 'oculto',
      complementos: [{ nombre: 'Arroz' }],
      complementosAfectanPrecio: false,
    });
    expect(carta).toMatchObject({
      _id: 'abc',
      id: 7,
      nombre: 'Lomo',
      precio: 28,
      isActive: true,
      complementosAfectanPrecio: false,
    });
    expect(carta.complementos).toEqual([{ nombre: 'Arroz' }]);
    expect(carta.descripcion).toBeUndefined();
    expect(carta.nombreCocina).toBeUndefined();
  });

  test('idCarta usa _id y toCartaMozo ignora docs vacíos', () => {
    expect(idCarta({ _id: 1, id: 9 })).toBe('1');
    expect(toCartaMozo(null)).toBeNull();
    expect(toCartaMozo({})).toBeNull();
  });
});
