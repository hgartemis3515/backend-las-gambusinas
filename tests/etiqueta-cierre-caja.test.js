'use strict';

const { etiquetaVisible, esCierreNoche } = require('../src/utils/etiquetaCierreCaja');

const dia = new Date('2026-08-29T22:00:00.000Z');
const noche = new Date('2026-08-30T02:00:00.000Z');
const caja2 = new Date('2026-08-30T01:00:00.000Z');

const docs = [
  { _id: 'a', fechaCierre: dia, estado: 'completado' },
  { _id: 'b', fechaCierre: caja2, estado: 'completado', cajaAdicionalNumero: 2 },
  { _id: 'c', fechaCierre: noche, estado: 'completado' },
];

describe('etiqueta de cierre', () => {
  test('el primero es CAJA 1 DIA, el adicional CAJA 2 y el resto NOCHE', () => {
    expect(etiquetaVisible(docs[0], docs)).toBe('CAJA 1 DIA');
    expect(etiquetaVisible(docs[1], docs)).toBe('CAJA 2');
    expect(etiquetaVisible(docs[2], docs)).toBe('NOCHE');
    expect(esCierreNoche(docs[2], docs)).toBe(true);
    expect(esCierreNoche(docs[0], docs)).toBe(false);
  });

  test('una fusión conserva los nombres y no es NOCHE', () => {
    const fusion = { _id: 'a', fechaCierre: dia, estado: 'completado', etiquetasCaja: ['CAJA 1 DIA', 'CAJA 2'] };
    expect(etiquetaVisible(fusion, docs)).toBe('CAJA 1 DIA + CAJA 2');
    expect(esCierreNoche(fusion, docs)).toBe(false);
  });
});
