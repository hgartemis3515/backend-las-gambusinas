const {
  calcularTotalesConDescuento,
  repartirCentesimos,
} = require('../src/utils/descuentoComanda');

const cfgConIgv = {
  igvPorcentaje: 18,
  preciosIncluyenIGV: true,
  decimales: 2,
  politicaRedondeo: 'total',
  redondearA: 0.01,
};

const cfgSinIgv = {
  igvPorcentaje: 18,
  preciosIncluyenIGV: false,
  decimales: 2,
  politicaRedondeo: 'total',
  redondearA: 0.01,
};

describe('calcularTotalesConDescuento — monto fijo exacto', () => {
  test('624 con IGV incluido, descuento S/. 264 → 360.00 / 264.00 (no 264.01)', () => {
    const r = calcularTotalesConDescuento(624, { monto: 264 }, cfgConIgv);
    expect(r.montoDescuento).toBe(264);
    expect(r.totalCalculado).toBe(360);
    expect(r.totalSinDescuento).toBe(624);
    expect(r.descuentoMontoFijo).toBe(264);
  });

  test('precios sin IGV: platos 528.813559 → total 624, monto 264 → 360.00', () => {
    const r = calcularTotalesConDescuento(624 / 1.18, { monto: 264 }, cfgSinIgv);
    expect(r.totalSinDescuento).toBe(624);
    expect(r.montoDescuento).toBe(264);
    expect(r.totalCalculado).toBe(360);
  });

  test('el % a 2 decimales SÍ driftaría (42.31% de 624 = 264.01); el monto fijo no', () => {
    const viaPct = calcularTotalesConDescuento(624, { porcentaje: 42.31 }, cfgConIgv);
    expect(viaPct.montoDescuento).toBe(264.01);
    const viaMonto = calcularTotalesConDescuento(624, { monto: 264 }, cfgConIgv);
    expect(viaMonto.montoDescuento).toBe(264);
    expect(viaMonto.totalCalculado).toBe(360);
  });

  test('monto mayor al total se recorta', () => {
    const r = calcularTotalesConDescuento(100, { monto: 150 }, cfgConIgv);
    expect(r.montoDescuento).toBe(100);
    expect(r.totalCalculado).toBe(0);
    expect(r.descuentoNum).toBe(100);
  });

  test('10% sobre 624 → 62.40 / 561.60', () => {
    const r = calcularTotalesConDescuento(624, { porcentaje: 10 }, cfgConIgv);
    expect(r.montoDescuento).toBe(62.4);
    expect(r.totalCalculado).toBe(561.6);
    expect(r.descuentoMontoFijo).toBeNull();
  });
});

describe('repartirCentesimos', () => {
  test('264 entre 300 y 324 suma exactamente 264.00', () => {
    const partes = repartirCentesimos([300, 324], 264);
    expect(Math.round(partes.reduce((s, n) => s + n, 0) * 100)).toBe(26400);
    expect(partes).toHaveLength(2);
  });

  test('reparte céntimos residuales', () => {
    const partes = repartirCentesimos([1, 1, 1], 1);
    expect(Math.round(partes.reduce((s, n) => s + n, 0) * 100)).toBe(100);
    expect(partes.every((n) => n === 0.33 || n === 0.34)).toBe(true);
    expect(partes.filter((n) => n === 0.34)).toHaveLength(1);
  });
});
