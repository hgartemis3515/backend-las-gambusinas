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

describe('aplicarCobroParcialCantidad', () => {
  const { aplicarCobroParcialCantidad } = require('../src/utils/separarCantidadLineaPlato');

  test('cobrar 1 de 2 deja las dos unidades en la venta', () => {
    const comanda = {
      platos: [{ _id: 'lena', estado: 'entregado', precioUnitario: 33, nombre: 'Leña' }],
      cantidades: [2],
    };
    const r = aplicarCobroParcialCantidad(comanda, 0, 1, 'pendiente', new Date('2026-09-23T20:00:00Z'));
    expect(r.didSplit).toBe(true);
    expect(r.lineaViejaId).toBe('lena');
    expect(r.lineaNuevaId).toBeTruthy();
    expect(comanda.cantidades).toEqual([1, 1]);
    expect(comanda.platos[0].estado).toBe('entregado');
    expect(comanda.platos[0].cantidad).toBe(1);
    expect(comanda.platos[1].estado).toBe('pendiente');
    expect(comanda.platos[1].cantidad).toBe(1);
    expect(comanda.platos[1].precioUnitario).toBe(33);
    const total = comanda.cantidades.reduce((s, c, i) => s + c * comanda.platos[i].precioUnitario, 0);
    expect(total).toBe(66);
  });

  test('cobrar la línea completa no parte y no baja la cantidad', () => {
    const comanda = {
      platos: [{ _id: 'lena', estado: 'entregado', precioUnitario: 33 }],
      cantidades: [2],
    };
    const r = aplicarCobroParcialCantidad(comanda, 0, 2, 'pendiente');
    expect(r.didSplit).toBe(false);
    expect(comanda.platos).toHaveLength(1);
    expect(comanda.cantidades).toEqual([2]);
    expect(comanda.platos[0].estado).toBe('pendiente');
  });
});
