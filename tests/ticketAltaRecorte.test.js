const { recortarPlatosAlta, totalesRestanteAlta, partirSnapshotTicketAlta } = require('../src/utils/ticketAltaComanda');

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

  test('línea partida: el id nuevo descuenta el resto del mismo plato', () => {
    const comandaId = 'c1';
    const alta = [
      { platoLineaId: 'chaufa', comandaId, nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 2, subtotal: 72 },
      { platoLineaId: 'pollo', comandaId, nombre: '1/4 Pollo', precio: 33, cantidad: 2, subtotal: 66 },
      { platoLineaId: 'coca', comandaId, nombre: 'Coca Cola 3L', precio: 20, cantidad: 1, subtotal: 20 },
    ];
    const cobro = [
      { platoLineaId: 'chaufa', comandaId, nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 1 },
      { platoLineaId: 'chaufa-partida', comandaId, nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 1 },
      { platoLineaId: 'pollo', comandaId, nombre: '1/4 Pollo', precio: 33, cantidad: 1 },
      { platoLineaId: 'pollo-partida', comandaId, nombre: '1/4 Pollo', precio: 33, cantidad: 1 },
      { platoLineaId: 'coca', comandaId, nombre: 'Coca Cola 3L', precio: 20, cantidad: 1 },
    ];
    const r = recortarPlatosAlta(alta, cobro);
    expect(r.cubrioAlgo).toBe(true);
    expect(r.vacio).toBe(true);
  });

  test('cobrar solo el id nuevo no borra la línea vieja que no coincidió', () => {
    const r = recortarPlatosAlta(
      [{ platoLineaId: 'chaufa', comandaId: 'c1', nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 2, subtotal: 72 }],
      [{ platoLineaId: 'chaufa-partida', comandaId: 'c1', nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 1 }]
    );
    expect(r.cubrioAlgo).toBe(false);
    expect(r.platos[0].cantidad).toBe(2);
  });
});

describe('partirSnapshotTicketAlta', () => {
  test('cantidad 2 pasa a 1 en el id viejo y 1 en el id nuevo, mismo total', () => {
    const r = partirSnapshotTicketAlta(
      [{ platoLineaId: 'chaufa', nombre: 'Arroz Chaufa Pollo', precio: 36, cantidad: 2, subtotal: 72, _id: 'snap1' }],
      { lineaViejaId: 'chaufa', lineaNuevaId: 'chaufa-partida', cantidadMovida: 1 }
    );
    expect(r.changed).toBe(true);
    expect(r.platos).toHaveLength(2);
    expect(r.platos[0].platoLineaId).toBe('chaufa');
    expect(r.platos[0].cantidad).toBe(1);
    expect(r.platos[0].subtotal).toBe(36);
    expect(r.platos[1].platoLineaId).toBe('chaufa-partida');
    expect(r.platos[1].cantidad).toBe(1);
    expect(r.platos[1].subtotal).toBe(36);
    expect(r.platos[1]._id).toBeUndefined();
    const suma = r.platos.reduce((s, p) => s + p.subtotal, 0);
    expect(suma).toBe(72);
  });
});
