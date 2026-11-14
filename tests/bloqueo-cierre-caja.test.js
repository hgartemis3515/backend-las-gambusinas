'use strict';

const {
  platoVisibleEnTablaKds,
  comandaEnTablaKds,
  clasificarBloqueo,
  mensajeBloqueoCierre,
} = require('../src/utils/bloqueoCierreCaja');

describe('bloqueo de cierre por KDS y cobro', () => {
  test('la tarjeta KDS solo cuenta platos en preparación o listos', () => {
    expect(platoVisibleEnTablaKds({ estado: 'en_espera' })).toBe(true);
    expect(platoVisibleEnTablaKds({ estado: 'recoger' })).toBe(true);
    expect(platoVisibleEnTablaKds({ estado: 'pedido' })).toBe(true);
    expect(platoVisibleEnTablaKds({ estado: 'salio' })).toBe(false);
    expect(platoVisibleEnTablaKds({ estado: 'entregado' })).toBe(false);
    expect(platoVisibleEnTablaKds({ estado: 'pendiente' })).toBe(false);
    expect(platoVisibleEnTablaKds({ estado: 'en_espera', eliminado: true })).toBe(false);
    expect(platoVisibleEnTablaKds({
      estado: 'en_espera',
      tipoServicio: 'para_llevar',
      pagoAdelantado: { estadoTicket: 'pendiente_aprobacion' },
    })).toBe(false);
  });

  test('una comanda entregada no está en la tabla KDS', () => {
    expect(comandaEnTablaKds({
      status: 'entregado',
      platos: [{ estado: 'entregado' }],
    })).toBe(false);
    expect(comandaEnTablaKds({
      status: 'en_espera',
      platos: [{ estado: 'recoger' }],
    })).toBe(true);
  });

  test('usa el número del día y no el histórico', () => {
    const clasif = clasificarBloqueo({
      kds: [{
        _id: 'a',
        status: 'en_espera',
        numeroComandaDia: 4,
        comandaNumber: 880,
        platos: [{ estado: 'en_espera' }],
      }],
      tickets: [{
        _id: 't1',
        comandas: [{ _id: 'b', numeroComandaDia: 9, comandaNumber: 1200 }],
      }],
    });
    expect(clasif.entregar).toEqual([4]);
    expect(clasif.cobrar).toEqual([9]);
    expect(mensajeBloqueoCierre(clasif)).toBe(
      'Falta cobrar la comanda #9. Falta entregar la comanda #4.'
    );
  });

  test('si sigue en cocina no se lista también como cobro', () => {
    const clasif = clasificarBloqueo({
      kds: [{
        _id: 'a',
        status: 'recoger',
        numeroComandaDia: 2,
        platos: [{ estado: 'recoger' }],
      }],
      tickets: [{ _id: 't', comandas: [{ _id: 'a', numeroComandaDia: 2 }] }],
    });
    expect(clasif.entregar).toEqual([2]);
    expect(clasif.cobrar).toEqual([]);
    expect(mensajeBloqueoCierre(clasif)).toBe('Falta entregar la comanda #2.');
  });

  test('pendiente de aprobar en KDS se informa como cobro', () => {
    const clasif = clasificarBloqueo({
      kds: [{
        _id: 'a',
        status: 'pendiente_aprobar',
        numeroComandaDia: 6,
        comandaNumber: 50,
        platos: [{ estado: 'pedido' }],
      }],
    });
    expect(clasif.cobrar).toEqual([6]);
    expect(clasif.entregar).toEqual([]);
    expect(mensajeBloqueoCierre(clasif)).toBe('Falta cobrar la comanda #6.');
  });

  test('varias comandas y una sin número del día', () => {
    const clasif = clasificarBloqueo({
      kds: [
        { _id: 'a', status: 'en_espera', numeroComandaDia: 3, platos: [{ estado: 'en_espera' }] },
        { _id: 'b', status: 'salio', numeroComandaDia: 1, platos: [{ estado: 'recoger' }] },
        { _id: 'c', status: 'en_espera', comandaNumber: 99, platos: [{ estado: 'en_espera' }] },
      ],
    });
    expect(clasif.entregar).toEqual([1, 3]);
    expect(clasif.sinEntregar).toBe(1);
    expect(mensajeBloqueoCierre(clasif)).toBe(
      'Falta entregar las comandas #1, #3 y una comanda sin número del día.'
    );
  });
});
