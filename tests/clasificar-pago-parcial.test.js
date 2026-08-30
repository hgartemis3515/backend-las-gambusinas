'use strict';

const {
  cubreTodosLosPlatosPendientes,
  esCobroParcialDeVisita,
} = require('../src/utils/clasificarPagoParcial');

describe('clasificarPagoParcial', () => {
  const comanda = {
    _id: 'c1',
    cantidades: [2, 1],
    platos: [
      { _id: 'p1', estado: 'entregado', cantidad: 2 },
      { _id: 'p2', estado: 'entregado', cantidad: 1 },
    ],
  };

  test('un cobro de todos los platos a cantidad máxima no es parcial', () => {
    const sels = [
      { comandaId: 'c1', platoSubdocId: 'p1', platoIndex: 0, cantidad: 2 },
      { comandaId: 'c1', platoSubdocId: 'p2', platoIndex: 1, cantidad: 1 },
    ];
    expect(cubreTodosLosPlatosPendientes(sels, [comanda])).toBe(true);
    expect(esCobroParcialDeVisita({ cubreTodosPendientes: true, hayBouchersPreviosEnPedido: false })).toBe(false);
  });

  test('subconjunto de platos es parcial', () => {
    const sels = [
      { comandaId: 'c1', platoSubdocId: 'p1', platoIndex: 0, cantidad: 2 },
    ];
    expect(cubreTodosLosPlatosPendientes(sels, [comanda])).toBe(false);
    expect(esCobroParcialDeVisita({ cubreTodosPendientes: false, hayBouchersPreviosEnPedido: false })).toBe(true);
  });

  test('cantidad personalizada menor al máximo es parcial', () => {
    const sels = [
      { comandaId: 'c1', platoSubdocId: 'p1', platoIndex: 0, cantidad: 1 },
      { comandaId: 'c1', platoSubdocId: 'p2', platoIndex: 1, cantidad: 1 },
    ];
    expect(cubreTodosLosPlatosPendientes(sels, [comanda])).toBe(false);
  });

  test('segundo cobro del pedido sigue siendo parcial aunque cubra el resto', () => {
    expect(esCobroParcialDeVisita({ cubreTodosPendientes: true, hayBouchersPreviosEnPedido: true })).toBe(true);
  });

  test('ignora platos ya pagados o eliminados', () => {
    const mix = {
      _id: 'c1',
      cantidades: [1, 1, 1],
      platos: [
        { _id: 'p0', estado: 'pagado', cantidad: 1 },
        { _id: 'p1', estado: 'entregado', cantidad: 1 },
        { _id: 'p2', estado: 'entregado', eliminado: true, cantidad: 1 },
      ],
    };
    const sels = [{ comandaId: 'c1', platoSubdocId: 'p1', platoIndex: 1, cantidad: 1 }];
    expect(cubreTodosLosPlatosPendientes(sels, [mix])).toBe(true);
  });
});
