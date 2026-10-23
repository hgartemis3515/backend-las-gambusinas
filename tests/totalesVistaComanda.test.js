const { ajustePorEliminados, brutoParaDescuento } = require('../public/assets/js/totalesVistaComanda');

describe('totales de comandas.html con platos eliminados y descuento', () => {
  test('grupo 95+94+88h: no infla 450/350 a 641.61/541.61', () => {
    const comanda88 = ajustePorEliminados({
      totalActivos: 348,
      totalTodos: 440,
      precioTotal: 224.43,
      brutoGuardado: 348,
      hayEliminados: true,
      tasaIgv: 1,
    });
    expect(comanda88.escalado).toBe(false);
    expect(comanda88.bruto).toBe(348);

    const subtotalGrupo = comanda88.bruto + 92 + 10;
    const totalGrupo = 248 + 92 + 10;
    expect(subtotalGrupo).toBe(450);
    expect(totalGrupo).toBe(350);
    expect(brutoParaDescuento({
      sumaLineas: 348,
      brutoGuardado: 348,
      precioTotal: 224.43,
      tasaIgv: 1,
    })).toBe(348);
  });

  test('si el total guardado aún incluye los platos eliminados, sí lo reduce', () => {
    const r = ajustePorEliminados({
      totalActivos: 348,
      totalTodos: 440,
      precioTotal: 440,
      brutoGuardado: 440,
      hayEliminados: true,
      tasaIgv: 1,
    });
    expect(r.escalado).toBe(true);
    expect(r.bruto).toBe(348);
  });

  test('con IGV encima de la suma activa no vuelve a recortar', () => {
    const r = ajustePorEliminados({
      totalActivos: 300,
      totalTodos: 400,
      precioTotal: 254,
      brutoGuardado: 354,
      hayEliminados: true,
      tasaIgv: 1.18,
    });
    expect(r.escalado).toBe(false);
    expect(r.bruto).toBe(354);
  });

  test('el editor no convierte la suma de platos con el precioTotal neto', () => {
    expect(brutoParaDescuento({
      sumaLineas: 348,
      brutoGuardado: 539.61,
      precioTotal: 224.43,
      tasaIgv: 1.105,
    })).toBe(348);
  });
});
