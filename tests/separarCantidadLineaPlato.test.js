const {
  indicePlatoPorIdLinea,
  aplicarSeparacionCantidadLinea
} = require('../src/utils/separarCantidadLineaPlato');

describe('separarCantidadLineaPlato', () => {
  test('encuentra por _id de línea, no por catálogo', () => {
    const platos = [
      { _id: 'a', platoId: 1 },
      { _id: 'b', platoId: 1 }
    ];
    expect(indicePlatoPorIdLinea(platos, 'b')).toBe(1);
  });

  test('n === total no parte', () => {
    const comanda = {
      platos: [{ _id: 'p1', estado: 'en_espera' }],
      cantidades: [5]
    };
    const r = aplicarSeparacionCantidadLinea(comanda, 0, 5);
    expect(r.didSplit).toBe(false);
    expect(comanda.platos).toHaveLength(1);
    expect(comanda.cantidades).toEqual([5]);
  });

  test('parte 2 de 5: original 3, nueva línea 2 al final', () => {
    const comanda = {
      platos: [
        { _id: 'p1', estado: 'en_espera', complementosSeleccionados: [{ _id: 'c1', grupo: 'Guarnición', opcion: 'Arroz', cantidad: 1 }] },
        { _id: 'p2', estado: 'en_espera' }
      ],
      cantidades: [5, 1]
    };
    const r = aplicarSeparacionCantidadLinea(comanda, 0, 2);
    expect(r.didSplit).toBe(true);
    expect(r.cantidadRestante).toBe(3);
    expect(r.cantidadEntregar).toBe(2);
    expect(comanda.platos).toHaveLength(3);
    expect(comanda.cantidades).toEqual([3, 1, 2]);
    expect(comanda.platos[0]._id).toBe('p1');
    expect(comanda.platos[1]._id).toBe('p2');
    expect(comanda.platos[2]._id).toBeUndefined();
    expect(comanda.platos[2].estado).toBe('en_espera');
    expect(comanda.platos[2].complementosSeleccionados[0]._id).toBeUndefined();
    expect(comanda.platos[2].complementosSeleccionados[0].opcion).toBe('Arroz');
  });

  test('rechaza entregar más que la línea', () => {
    const comanda = { platos: [{ _id: 'p1' }], cantidades: [2] };
    const r = aplicarSeparacionCantidadLinea(comanda, 0, 9);
    expect(r.error).toMatch(/tiene 2/);
    expect(comanda.platos).toHaveLength(1);
  });
});
