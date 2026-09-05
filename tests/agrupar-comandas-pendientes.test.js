const {
  agruparComandasPendientes,
  formatGrupoComandasLabel,
} = require('../../gambusinas/utils/agruparComandasPendientes');

describe('agruparComandasPendientes (comandas.html)', () => {
  test('mismo pedidoId sale una sola fila #81+#82', () => {
    const filas = agruparComandasPendientes([
      { _id: 'c', mesaNumero: 3, pedidoId: 'aaaaaaaaaaaaaaaaaaaaaaaa', comandaNumber: 82, pendienteCobro: 20, createdAt: '2026-09-02T12:10:00Z' },
      { _id: 'a', mesaNumero: 3, pedidoId: 'aaaaaaaaaaaaaaaaaaaaaaaa', comandaNumber: 81, pendienteCobro: 10, createdAt: '2026-09-02T12:00:00Z' },
      { _id: 'b', mesaNumero: 5, comandaNumber: 90, pendienteCobro: 5, createdAt: '2026-09-02T12:05:00Z' },
    ]);
    const grupo = filas.find((f) => f.tipo === 'grupo');
    const solo = filas.find((f) => f.tipo === 'individual');
    expect(grupo.comandaLabel).toBe('#81+#82');
    expect(grupo.pendienteCobro).toBe(30);
    expect(grupo.id).toBe('pedido_aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(solo._id).toBe('b');
    expect(filas).toHaveLength(2);
  });

  test('fallback cliente + mesa', () => {
    const cid = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const filas = agruparComandasPendientes([
      { _id: '1', mesaNumero: 2, clienteId: cid, comandaNumber: 10, pendienteCobro: 8, createdAt: '2026-09-02T12:00:00Z' },
      { _id: '2', mesaNumero: 2, clienteId: cid, comandaNumber: 11, pendienteCobro: 7, createdAt: '2026-09-02T12:01:00Z' },
      { _id: '3', mesaNumero: 2, comandaNumber: 12, pendienteCobro: 4, createdAt: '2026-09-02T12:02:00Z' },
    ]);
    const grupo = filas.find((f) => f.tipo === 'grupo');
    const solos = filas.filter((f) => f.tipo === 'individual');
    expect(formatGrupoComandasLabel(grupo ? [{ comandaNumber: 10 }, { comandaNumber: 11 }] : [])).toBe('#10+#11');
    expect(grupo.comandaLabel).toBe('#10+#11');
    expect(solos).toHaveLength(1);
    expect(solos[0]._id).toBe('3');
  });

  test('dashboard no se agrupa aunque compartan pedido', () => {
    const pid = 'cccccccccccccccccccccccc';
    const filas = agruparComandasPendientes([
      { _id: '1', pedidoId: pid, comandaNumber: 1, pendienteCobro: 10, origenCreacion: 'dashboard', createdAt: '2026-09-02T12:00:00Z' },
      { _id: '2', pedidoId: pid, comandaNumber: 2, pendienteCobro: 10, origenCreacion: 'dashboard', createdAt: '2026-09-02T12:01:00Z' },
    ]);
    expect(filas.every((f) => f.tipo === 'individual')).toBe(true);
    expect(filas).toHaveLength(2);
  });
});
