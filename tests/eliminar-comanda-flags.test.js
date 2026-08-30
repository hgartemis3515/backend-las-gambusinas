'use strict';

const Comanda = require('../src/database/models/comanda.model');
const Boucher = require('../src/database/models/boucher.model');

describe('flags de eliminación de comanda', () => {
  test('schema persiste eliminada (Mongoose strict no la descarta)', () => {
    const path = Comanda.schema.path('eliminada');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
  });

  test('boucher schema marca tickets archivados con la comanda', () => {
    const path = Boucher.schema.path('eliminadaPorComanda');
    expect(path).toBeTruthy();
    expect(path.instance).toBe('Boolean');
  });

  test('status cancelado es un valor válido de comanda', () => {
    const enumVals = Comanda.schema.path('status').enumValues;
    expect(enumVals).toContain('cancelado');
  });
});
