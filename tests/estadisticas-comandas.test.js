'use strict';

const {
  matchComandasEstadisticas,
  exprMontoComanda,
  exprFechaComanda,
  mapearFilaReporte,
  resumirHorariosComandas,
  rangoLima,
  montoComandaNum,
  precioPlatoNum
} = require('../src/utils/estadisticasComandas');

describe('estadisticasComandas', () => {
  test('match no exige IsActive y excluye canceladas', () => {
    const inicio = new Date('2026-08-20T05:00:00.000Z');
    const fin = new Date('2026-08-21T04:59:59.999Z');
    const m = matchComandasEstadisticas(inicio, fin);
    expect(m.IsActive).toBeUndefined();
    expect(m.status).toEqual({ $nin: ['cancelado'] });
    expect(m.$or).toHaveLength(3);
    expect(m.$or[0].createdAt).toEqual({ $gte: inicio, $lte: fin });
    expect(m.$or[1].tiempoPagado).toEqual({ $gte: inicio, $lte: fin });
    expect(m.$or[2].tiempoEntregado).toEqual({ $gte: inicio, $lte: fin });
  });

  test('monto ignora totalCalculado 0 y usa precioTotal', () => {
    const expr = exprMontoComanda();
    expect(expr.$let.in.$switch.branches[0].case).toEqual({ $gt: ['$$calc', 0] });
    expect(montoComandaNum({ totalCalculado: 0, precioTotal: 45.5 })).toBe(45.5);
    expect(montoComandaNum({ totalCalculado: 118, precioTotal: 100 })).toBe(118);
  });

  test('monto suma platos si los totales de comanda están en 0', () => {
    expect(montoComandaNum({
      totalCalculado: 0,
      precioTotal: 0,
      cantidades: [2],
      platos: [{ precioUnitario: 0, plato: { precio: 12.5 }, eliminado: false }]
    })).toBe(25);
  });

  test('precio de plato no se queda en precioUnitario 0', () => {
    expect(precioPlatoNum({ precioUnitario: 0, plato: { precio: 22.5 } })).toBe(22.5);
    expect(precioPlatoNum({ precioUnitario: 19.9, plato: { precio: 22.5 } })).toBe(19.9);
  });

  test('fecha canónica: pagado → entregado → createdAt', () => {
    expect(exprFechaComanda()).toEqual({
      $ifNull: ['$tiempoPagado', { $ifNull: ['$tiempoEntregado', '$createdAt'] }]
    });
  });

  test('rangoLima cubre el día civil en America/Lima', () => {
    const { inicio, fin } = rangoLima('2026-08-20', '2026-08-20');
    expect(inicio.toISOString()).toBe('2026-08-20T05:00:00.000Z');
    expect(fin.getTime()).toBeGreaterThan(inicio.getTime());
    expect(fin.toISOString().startsWith('2026-08-21')).toBe(true);
  });

  test('mapearFilaReporte cuenta comanda pagada inactiva (sin boucher)', () => {
    const fila = mapearFilaReporte({
      _id: 'c1',
      IsActive: false,
      status: 'pagado',
      totalCalculado: 118,
      precioTotal: 100,
      tiempoPagado: new Date('2026-08-20T20:00:00.000Z'),
      mozoNombre: 'Ana',
      mesaNumero: 4,
      pagoOmitido: { aplicado: true },
      platos: [
        { nombre: 'Lomo', cantidad: 2, precioUnitario: 25, eliminado: false },
        { nombre: 'X', cantidad: 1, precioUnitario: 10, anulado: true }
      ]
    });
    expect(fila.total).toBe(118);
    expect(fila.nombreMozo).toBe('Ana');
    expect(fila.numMesa).toBe(4);
    expect(fila.metodoPago).toBe('omitido');
    expect(fila.platos).toHaveLength(1);
    expect(fila.platos[0].cantidad).toBe(2);
    expect(fila.platos[0].subtotal).toBe(50);
    expect(fila._fuente).toBe('comanda');
  });

  test('resumirHorariosComandas agrupa ventas, mesas y turnos', () => {
    const h = resumirHorariosComandas([
      { hora: 12, diaSemana: 2, _montoStat: 40, mesas: 'm1', mozos: 'z1' },
      { hora: 12, diaSemana: 2, _montoStat: 10, mesas: 'm1', mozos: 'z1' },
      { hora: 19, diaSemana: 6, _montoStat: 80, mesas: 'm2', mozos: 'z2' }
    ]);
    expect(h.ventasPorHora[12].total).toBe(50);
    expect(h.mesasPorHora[12].mesas).toBe(1);
    expect(h.ventasPorDiaSemana[0].tickets).toBe(2);
    expect(h.ventasPorDiaSemana[0].dia).toBe('Lun');
    expect(h.comparacionPorTurno.almuerzo.ventas).toBe(50);
    expect(h.comparacionPorTurno.cena.tickets).toBe(1);
    expect(h.productividadMozoHora.find(p => p.mozoId === 'z1' && p.hora === 12).mesas).toBe(1);
  });
});
