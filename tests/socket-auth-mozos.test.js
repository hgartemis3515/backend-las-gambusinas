'use strict';

const { puedeAccederSocketMozos } = require('../src/middleware/socketAuth');

describe('puedeAccederSocketMozos', () => {
  test('acepta token de App Mozos aunque el rol sea cocinero (Martha/Melina)', () => {
    expect(puedeAccederSocketMozos({
      app: 'mozos',
      rol: 'cocinero',
      permisos: ['ver-comandas-cocina', 'ver-platos'],
    })).toBe(true);
  });

  test('acepta rol mozos / admin / supervisor', () => {
    expect(puedeAccederSocketMozos({ rol: 'mozos' })).toBe(true);
    expect(puedeAccederSocketMozos({ rol: 'admin' })).toBe(true);
    expect(puedeAccederSocketMozos({ rol: 'supervisor' })).toBe(true);
  });

  test('acepta rol cocinero aunque el token sea antiguo (sin app)', () => {
    expect(puedeAccederSocketMozos({ rol: 'cocinero', permisos: [] })).toBe(true);
  });

  test('acepta rol custom con crear-comandas', () => {
    expect(puedeAccederSocketMozos({
      rol: 'capitan',
      permisos: ['crear-comandas'],
    })).toBe(true);
  });

  test('rechaza token de cocina sin rol de sala', () => {
    expect(puedeAccederSocketMozos({
      app: 'cocina',
      rol: '',
      permisos: ['ver-comandas-cocina'],
    })).toBe(false);
  });

  test('rechaza payload vacío', () => {
    expect(puedeAccederSocketMozos(null)).toBe(false);
    expect(puedeAccederSocketMozos({})).toBe(false);
  });
});
