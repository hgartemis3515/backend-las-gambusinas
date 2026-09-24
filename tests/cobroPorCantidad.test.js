'use strict';

const { decidirMontoCobro } = require('../src/utils/cobroPorCantidad');

describe('decidirMontoCobro', () => {
  test('sin monto cobra el saldo entero', () => {
    expect(decidirMontoCobro(null, 200)).toEqual({ monto: 200, esAbono: false, saldo: 200 });
  });

  test('un adelanto menor queda como abono', () => {
    expect(decidirMontoCobro(100, 200)).toEqual({ monto: 100, esAbono: true, saldo: 200 });
  });

  test('un monto mayor o igual cierra el saldo', () => {
    expect(decidirMontoCobro(250, 200)).toEqual({ monto: 200, esAbono: false, saldo: 200 });
  });

  test('saldo cero no se cobra', () => {
    expect(() => decidirMontoCobro(10, 0)).toThrow(/saldo/);
  });
});
