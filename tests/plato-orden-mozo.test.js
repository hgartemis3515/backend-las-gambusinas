const { fusionarOrdenIds, cmpOrdenPlato } = require('../src/utils/ordenPlatoMozo');

describe('orden de platos (mozos)', () => {
  test('fusiona un subconjunto sin mover el resto', () => {
    const actual = ['A', 'B', 'X', 'C', 'Y'];
    const filtradoNuevo = ['B', 'A', 'C'];
    expect(fusionarOrdenIds(actual, filtradoNuevo)).toEqual(['B', 'A', 'X', 'C', 'Y']);
  });

  test('cmpOrdenPlato: menor orden primero, luego id', () => {
    const arr = [
      { nombre: 'Z', orden: 30, id: 1 },
      { nombre: 'A', orden: 10, id: 9 },
      { nombre: 'B', orden: 10, id: 2 },
    ];
    arr.sort(cmpOrdenPlato);
    expect(arr.map((p) => p.nombre)).toEqual(['B', 'A', 'Z']);
  });
});
