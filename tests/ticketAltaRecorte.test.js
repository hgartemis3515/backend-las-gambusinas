const { recortarPlatosAlta, totalesRestanteAlta } = require('../src/utils/ticketAltaComanda');

describe('recortarPlatosAlta', () => {
  const alta = [
    { platoLineaId: 'a', nombre: 'Tamal chancho', precio: 12, cantidad: 1, subtotal: 12 },
    { platoLineaId: 'b', nombre: 'Patasca', precio: 27, cantidad: 1, subtotal: 27 },
    { platoLineaId: 'c', nombre: 'Salchipapa', precio: 19, cantidad: 1, subtotal: 19 },
    { platoLineaId: 'd', nombre: 'Tamal pollo', precio: 12, cantidad: 1, subtotal: 12 },
  ];

  test('un plato cobrado deja el resto en 58', () => {
    const r = recortarPlatosAlta(alta, [{ platoLineaId: 'd', cantidad: 1, precio: 12 }]);
    expect(r.cubrioAlgo).toBe(true);
    expect(r.vacio).toBe(false);
    expect(r.platos.map((p) => p.platoLineaId)).toEqual(['a', 'b', 'c']);
    const tot = totalesRestanteAlta(r.platos, { subtotal: 70, igv: 0, total: 70 });
    expect(tot.total).toBe(58);
  });

  test('cobro de toda la comanda vacía el alta', () => {
    const r = recortarPlatosAlta(alta, alta);
    expect(r.vacio).toBe(true);
  });

  test('otra comanda no se recorta', () => {
    const r = recortarPlatosAlta(alta, [{ platoLineaId: 'zzz', nombre: 'Otro', precio: 10, cantidad: 1 }]);
    expect(r.cubrioAlgo).toBe(false);
    expect(r.platos).toHaveLength(4);
  });

  test('cantidad parcial deja las unidades restantes', () => {
    const r = recortarPlatosAlta(
      [{ platoLineaId: 'p', nombre: 'Leña', precio: 33, cantidad: 2, subtotal: 66 }],
      [{ platoLineaId: 'p', cantidad: 1, precio: 33 }]
    );
    expect(r.platos[0].cantidad).toBe(1);
    expect(r.platos[0].subtotal).toBe(33);
  });
});
