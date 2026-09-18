const {
  applyMenuEvent,
  applyMenuEventBatch,
} = require('../../gambusinas/utils/catalogoPlatosApply');

describe('applyMenuEvent', () => {
  const base = [
    { _id: 'a', id: 1, nombre: 'A', orden: 10, isActive: true, precio: 10, complementos: [] },
    { _id: 'b', id: 2, nombre: 'B', orden: 20, isActive: true, precio: 12, complementos: [{ n: 1 }] },
  ];

  test('upsert reemplaza por _id y conserva complementos', () => {
    const { platos, invalidate } = applyMenuEvent(base, {
      op: 'upsert',
      plato: { _id: 'b', id: 2, nombre: 'B2', precio: 15, complementos: [{ n: 2 }], isActive: true },
    });
    expect(invalidate).toBe(false);
    expect(platos).toHaveLength(2);
    expect(platos[1].nombre).toBe('B2');
    expect(platos[1].precio).toBe(15);
    expect(platos[1].complementos).toEqual([{ n: 2 }]);
  });

  test('upsert de inactivo lo quita', () => {
    const { platos } = applyMenuEvent(base, {
      op: 'upsert',
      plato: { _id: 'a', isActive: false },
    });
    expect(platos.map((p) => p._id)).toEqual(['b']);
  });

  test('delete filtra por _id', () => {
    const { platos } = applyMenuEvent(base, { op: 'delete', plato: { _id: 'a' } });
    expect(platos.map((p) => p._id)).toEqual(['b']);
  });

  test('orden parchea y ordena', () => {
    const { platos } = applyMenuEvent(base, {
      op: 'orden',
      items: [{ _id: 'b', orden: 1 }, { _id: 'a', orden: 2 }],
    });
    expect(platos.map((p) => p._id)).toEqual(['b', 'a']);
    expect(platos[0].orden).toBe(1);
  });

  test('invalidate no aplica upserts del lote', () => {
    const { invalidate, platos } = applyMenuEventBatch(base, [
      { op: 'upsert', plato: { _id: 'c', id: 3, nombre: 'C', isActive: true } },
      { op: 'invalidate' },
      { op: 'delete', plato: { _id: 'a' } },
    ]);
    expect(invalidate).toBe(true);
    expect(platos).toHaveLength(3);
  });
});
