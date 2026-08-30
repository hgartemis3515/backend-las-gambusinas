'use strict';

const { objectIdUsuarioOrNull } = require('../src/utils/objectIdUsuario');

describe('objectIdUsuarioOrNull', () => {
  test('rechaza el string admin que rompía la auditoría', () => {
    expect(objectIdUsuarioOrNull('admin')).toBeNull();
    expect(objectIdUsuarioOrNull('')).toBeNull();
    expect(objectIdUsuarioOrNull(null)).toBeNull();
  });

  test('acepta ObjectId hex de 24', () => {
    const id = '507f1f77bcf86cd799439011';
    const oid = objectIdUsuarioOrNull(id);
    expect(oid).toBeTruthy();
    expect(String(oid)).toBe(id);
  });
});
