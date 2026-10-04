const { planBajaLinea, mapaCantidadesAEliminar } = require('../src/utils/bajaCantidadPlato');

describe('baja por cantidad', () => {
  test('5 menos 3 deja 2', () => {
    expect(planBajaLinea({ cantidadLinea: 5, cantidadQuitar: 3 })).toEqual({
      total: 5,
      quitar: 3,
      restante: 2,
      bajaTotal: false,
    });
  });

  test('sin cantidad o el máximo elimina la línea', () => {
    expect(planBajaLinea({ cantidadLinea: 5 }).bajaTotal).toBe(true);
    expect(planBajaLinea({ cantidadLinea: 5, cantidadQuitar: 5 }).restante).toBe(0);
    expect(planBajaLinea({ cantidadLinea: 5, cantidadQuitar: 9 }).quitar).toBe(5);
  });

  test('el mapa solo guarda índices con cantidad', () => {
    const map = mapaCantidadesAEliminar({
      cantidadesAEliminar: [{ index: 0, cantidad: 3 }, { index: '1', cantidad: 0 }, { index: 2 }],
    });
    expect(map.get(0)).toBe(3);
    expect(map.has(1)).toBe(false);
    expect(map.has(2)).toBe(false);
  });
});
