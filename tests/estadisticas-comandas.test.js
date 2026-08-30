'use strict';

const {
  matchComandasEstadisticas,
  matchComandaAbiertaEnTabla,
  matchComandasCierrePendiente,
  matchComandasPeriodoDeCierre,
  agruparVentasPorMozo,
  exprMontoComanda,
  exprFechaComanda,
  mapearFilaReporte,
  resumirHorariosComandas,
  rangoLima,
  montoComandaNum,
  sumaMontosReporte,
  precioPlatoNum,
  etiquetasComplemento,
  minutosServicioComanda,
  setConfigMonedaEstadisticas
} = require('../src/utils/estadisticasComandas');

describe('estadisticasComandas', () => {
  beforeEach(() => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 18, preciosIncluyenIGV: false });
  });

  test('match no exige IsActive y excluye canceladas y eliminadas', () => {
    const inicio = new Date('2026-08-20T05:00:00.000Z');
    const fin = new Date('2026-08-21T04:59:59.999Z');
    const m = matchComandasEstadisticas(inicio, fin);
    expect(m.IsActive).toBeUndefined();
    expect(m.eliminada).toEqual({ $ne: true });
    expect(m.status).toEqual({ $nin: ['cancelado'] });
    expect(m.$or).toHaveLength(3);
    expect(m.$or[0].createdAt).toEqual({ $gte: inicio, $lte: fin });
    expect(m.$or[1].tiempoPagado).toEqual({ $gte: inicio, $lte: fin });
    expect(m.$or[2].tiempoEntregado).toEqual({ $gte: inicio, $lte: fin });
  });

  test('matchComandaAbiertaEnTabla alinea en-vivo con comandas.html (no eliminadas ni IsActive false)', () => {
    const m = matchComandaAbiertaEnTabla();
    expect(m.eliminada).toEqual({ $ne: true });
    expect(m.IsActive).toEqual({ $ne: false, $exists: true });
    expect(m.status.$nin).toEqual(expect.arrayContaining(['pagado', 'completado', 'cancelado']));
  });

  test('monto ignora totalCalculado 0 y usa precioTotal', () => {
    const expr = exprMontoComanda();
    expect(expr.$let.in.$cond[0]).toBe('$$tieneDesc');
    expect(expr.$let.in.$cond[2].$cond[0]).toEqual({ $gt: ['$$dePlatos', 0] });
    expect(montoComandaNum({ totalCalculado: 0, precioTotal: 45.5 })).toBe(45.5);
    expect(montoComandaNum({ totalCalculado: 118, precioTotal: 100 })).toBe(118);
  });

  test('descuento 100% no cae al bruto de platos', () => {
    expect(montoComandaNum({
      descuento: 100,
      montoDescuento: 118,
      totalCalculado: 0,
      precioTotal: 100,
      totalSinDescuento: 118,
      platos: [{ precioUnitario: 100, cantidad: 1 }]
    })).toBe(0);
    expect(montoComandaNum({
      descuento: 10,
      montoDescuento: 11.8,
      totalCalculado: 106.2,
      precioTotal: 90
    })).toBe(106.2);
  });

  test('monto suma platos si los totales de comanda están en 0', () => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 10.5, preciosIncluyenIGV: true });
    expect(montoComandaNum({
      totalCalculado: 0,
      precioTotal: 0,
      cantidades: [2],
      platos: [{ precioUnitario: 0, plato: { precio: 12.5 }, eliminado: false }]
    })).toBe(25);
  });

  test('monto sin descuento no cuenta platos eliminados', () => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 10.5, preciosIncluyenIGV: true });
    expect(montoComandaNum({
      totalCalculado: 0,
      precioTotal: 85,
      platos: [
        { precioUnitario: 46, cantidad: 1, eliminado: false },
        { precioUnitario: 33, cantidad: 1, eliminado: false },
        { precioUnitario: 6, cantidad: 1, eliminado: true }
      ]
    })).toBe(79);
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

  test('rangoLima respeta instantes ISO (DIA/NOCHE)', () => {
    const corte = '2026-08-29T22:00:00.000Z'; // 17:00 Lima
    const { inicio, fin } = rangoLima('2026-08-29T05:00:00.000Z', corte);
    expect(inicio.toISOString()).toBe('2026-08-29T05:00:00.000Z');
    expect(fin.toISOString()).toBe(corte);
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
    expect(fila.total).toBe(59);
    expect(fila.nombreMozo).toBe('Ana');
    expect(fila.numMesa).toBe(4);
    expect(fila.metodoPago).toBe('omitido');
    expect(fila.platos).toHaveLength(1);
    expect(fila.platos[0].cantidad).toBe(2);
    expect(fila.platos[0].precio).toBe(29.5);
    expect(fila.platos[0].subtotal).toBe(59);
    expect(fila._fuente).toBe('comanda');
  });

  test('P. Unit. es el precio del plato cuando el catálogo ya incluye IGV', () => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 10.5, preciosIncluyenIGV: true });
    const fila = mapearFilaReporte({
      totalCalculado: 0,
      totalSinDescuento: 0,
      precioTotal: 85,
      platos: [
        { nombre: 'Chancho a la Leña', cantidad: 1, precioUnitario: 46, eliminado: false },
        { nombre: '1/4 Pollo a la leña + papa frita + arroz + ensalada', cantidad: 1, precioUnitario: 33, eliminado: false },
        { nombre: 'Extra', cantidad: 1, precioUnitario: 6, eliminado: true }
      ]
    });
    const pollo = fila.platos.find((p) => p.nombre.startsWith('1/4'));
    expect(pollo.precio).toBe(33);
    expect(pollo.subtotal).toBe(33);
    expect(fila.total).toBe(79);
  });

  test('mapearFilaReporte resta descuento en total y líneas', () => {
    const fila = mapearFilaReporte({
      status: 'pagado',
      descuento: 10,
      montoDescuento: 11.8,
      totalCalculado: 106.2,
      totalSinDescuento: 118,
      precioTotal: 90,
      platos: [{ nombre: 'Lomo', cantidad: 1, precioUnitario: 100, eliminado: false }]
    });
    expect(fila.total).toBe(106.2);
    expect(fila.montoDescuento).toBe(11.8);
    expect(fila.platos[0].subtotal).toBe(106.2);
  });

  test('mapearFila incluye complementos y minutos de servicio', () => {
    expect(etiquetasComplemento({
      complementosSeleccionados: [
        { grupo: 'Proteína', opcion: 'Pollo', cantidad: 1 },
        { grupo: 'Salsa', opcion: 'Huancaína' }
      ]
    })).toEqual(['Proteína: Pollo', 'Salsa: Huancaína']);
    const ini = new Date('2026-08-20T12:00:00.000Z');
    const fin = new Date('2026-08-20T12:18:00.000Z');
    expect(minutosServicioComanda({ tiempoEnEspera: ini, tiempoPagado: fin })).toBe(18);
    const fila = mapearFilaReporte({
      totalCalculado: 20,
      createdAt: ini,
      tiempoPagado: fin,
      platos: [{
        nombre: 'Ceviche',
        cantidad: 1,
        precioUnitario: 20,
        complementosSeleccionados: [{ grupo: 'Ají', opcion: 'Limón' }]
      }]
    });
    expect(fila.platos[0].complementos).toEqual(['Ají: Limón']);
    expect(fila.minutosServicio).toBe(18);
    expect(fila.metodoPago).toBeNull();
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

  test('ticket de cierre por período no exige status vendida y admite marca nula o de ese cierre', () => {
    const inicio = new Date('2023-12-31T05:00:00.000Z');
    const fin = new Date('2026-07-08T17:33:00.000Z');
    const cierreId = '68abc123def4567890123456';
    const m = matchComandasPeriodoDeCierre(inicio, fin, cierreId);
    expect(m.$and).toHaveLength(3);
    expect(m.$and[0].status).toEqual({ $nin: ['cancelado'] });
    expect(m.$and[1].$or).toHaveLength(3);
    expect(m.$and[2].$or).toEqual(expect.arrayContaining([
      { incluidoEnCierre: cierreId },
      { incluidoEnCierre: String(cierreId) },
      { incluidoEnCierre: null },
      { incluidoEnCierre: { $exists: false } }
    ]));
  });

  test('cierre pendiente no pisa el $or de fechas con el de incluidoEnCierre', () => {
    const inicio = new Date('2026-08-28T05:00:00.000Z');
    const fin = new Date('2026-08-29T04:59:59.999Z');
    const m = matchComandasCierrePendiente(inicio, fin, { soloVendidas: true });
    expect(m.$and).toHaveLength(3);
    expect(m.$and[0].status).toEqual({ $in: ['pagado', 'entregado', 'completado'] });
    expect(m.$and[1].$or).toHaveLength(3);
    expect(m.$and[2].$or).toEqual([
      { incluidoEnCierre: null },
      { incluidoEnCierre: { $exists: false } }
    ]);
  });

  test('sumaMontosReporte ignora plato eliminado e incluye entregado (927)', () => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 10.5, preciosIncluyenIGV: true });
    const total = sumaMontosReporte([
      { status: 'pagado', precioTotal: 85, platos: [
        { nombre: 'Chancho', cantidad: 1, precioUnitario: 46 },
        { nombre: 'Pollo', cantidad: 1, precioUnitario: 33 },
        { nombre: 'Extra', cantidad: 1, precioUnitario: 6, eliminado: true }
      ] },
      { status: 'entregado', descuento: 33.33, montoDescuento: 2, totalCalculado: 4, platos: [
        { nombre: 'Gaseosa', cantidad: 1, precioUnitario: 6 }
      ] }
    ]);
    expect(total).toBe(83);
  });

  test('agruparVentasPorMozo no cuenta plato eliminado (933 vs 927)', () => {
    setConfigMonedaEstadisticas({ igvPorcentaje: 10.5, preciosIncluyenIGV: true });
    const filas = [
      mapearFilaReporte({
        mozos: { _id: 'm1', name: 'Ana' },
        status: 'pagado',
        precioTotal: 85,
        platos: [
          { nombre: 'Chancho', cantidad: 1, precioUnitario: 46 },
          { nombre: 'Pollo', cantidad: 1, precioUnitario: 33 },
          { nombre: 'Extra', cantidad: 1, precioUnitario: 6, eliminado: true }
        ]
      })
    ];
    const g = agruparVentasPorMozo(filas);
    expect(g).toHaveLength(1);
    expect(g[0].totalVentas).toBe(79);
    expect(g[0].cantidad).toBe(1);
  });

  test('comanda eliminada (cancelado o eliminada=true) no entra en match de reportes/mozos', () => {
    const vigente = require('../src/utils/estadisticasComandas').matchComandaVigente();
    expect(vigente.eliminada).toEqual({ $ne: true });
    expect(vigente.status).toEqual({ $nin: ['cancelado'] });
  });

  test('boucher de comanda eliminada no entra en fallback de reportes', () => {
    const { matchBoucherVigente } = require('../src/utils/estadisticasComandas');
    expect(matchBoucherVigente({ isActive: true }).eliminadaPorComanda).toEqual({ $ne: true });
  });
});
