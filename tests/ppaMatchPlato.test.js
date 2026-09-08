const { platoEstaSeleccionadoPpa } = require('../src/utils/ppaMatchPlato');

describe('ppaMatchPlato', () => {
  const comanda = {
    _id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    platos: [
      { _id: '111111111111111111111111' },
      { _id: '222222222222222222222222' },
    ],
  };

  test('empareja por platoSubdocId aunque comandaId venga distinto de tipo', () => {
    const sel = platoEstaSeleccionadoPpa(
      [{ comandaId: comanda._id, platoSubdocId: '222222222222222222222222', cantidad: 2 }],
      comanda,
      comanda.platos[1]
    );
    expect(sel).toBeTruthy();
    expect(sel.cantidad).toBe(2);
  });

  test('empareja por platoIndex si no hay subdoc id', () => {
    const sel = platoEstaSeleccionadoPpa(
      [{ comandaId: comanda._id, platoIndex: 0, cantidad: 1 }],
      comanda,
      comanda.platos[0]
    );
    expect(sel).toBeTruthy();
  });

  test('no empareja otra comanda', () => {
    const sel = platoEstaSeleccionadoPpa(
      [{ comandaId: 'bbbbbbbbbbbbbbbbbbbbbbbb', platoIndex: 0 }],
      comanda,
      comanda.platos[0]
    );
    expect(sel).toBeNull();
  });
});
