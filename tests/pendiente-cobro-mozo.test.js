const {
  mapComandaPorCobrar,
  pendienteDeComanda,
} = require('../src/utils/pendienteCobroMozo');

describe('mapComandaPorCobrar', () => {
  test('arma mesa, total, platos y cocinero', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c1',
      comandaNumber: 42,
      status: 'entregado',
      createdAt: '2026-09-02T12:00:00.000Z',
      mesaNumero: 7,
      cantidades: [2, 1],
      totalCalculado: 80,
      platos: [
        {
          nombre: 'Lomo',
          estado: 'entregado',
          procesadoPor: { alias: 'Pepe', cocineroId: 'ck1' },
        },
        {
          plato: { nombre: 'Ceviche' },
          estado: 'salio',
          procesandoPor: { nombre: 'Pepe', cocineroId: 'ck1' },
        },
      ],
    }, 80);

    expect(mapped.comandaNumber).toBe(42);
    expect(mapped.mesaNumero).toBe(7);
    expect(mapped.mesaId).toBe(null);
    expect(mapped.total).toBe(80);
    expect(mapped.pendienteCobro).toBe(80);
    expect(mapped.platosResumen).toBe('Lomo x2, Ceviche');
    expect(mapped.cocineros).toEqual([{ nombre: 'Pepe', cocineroId: 'ck1' }]);
    expect(mapped.pedidoId).toBe(null);
    expect(mapped.clienteId).toBe(null);
  });

  test('expone pedido y cliente para agrupar como comandas.html', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c3',
      comandaNumber: 81,
      pedido: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      cliente: { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', nombre: 'Luis' },
      clienteNombre: 'Luis',
      origenCreacion: 'mozos',
      createdByDashboard: null,
      totalCalculado: 10,
      platos: [{ nombre: 'Ají', estado: 'entregado' }],
    }, 10);
    expect(mapped.pedidoId).toBe('aaaaaaaaaaaaaaaaaaaaaaaa');
    expect(mapped.clienteId).toBe('bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(mapped.clienteNombre).toBe('Luis');
    expect(mapped.origenCreacion).toBe('mozos');
    expect(mapped.createdByDashboard).toBe(null);
  });

  test('incluye mesaId y estado cuando mesas viene poblada', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c2',
      comandaNumber: 9,
      mesas: { _id: 'm1', nummesa: 3, estado: 'pedido', nombreCombinado: '3+4' },
      totalCalculado: 25,
      platos: [{ nombre: 'Ají', estado: 'entregado' }],
    }, 25);
    expect(mapped.mesaId).toBe('m1');
    expect(mapped.mesaEstado).toBe('pedido');
    expect(mapped.mesaNombre).toBe('3+4');
    expect(mapped.mesaNumero).toBe(3);
    expect(mapped.esSinMesa).toBe(false);
  });

  test('esSinMesa cuando no hay mesa ni número', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c-ll',
      comandaNumber: 55,
      totalCalculado: 12,
      platos: [{ nombre: 'DCH', estado: 'pedido', tipoServicio: 'para_llevar' }],
    }, 12);
    expect(mapped.esSinMesa).toBe(true);
    expect(mapped.mesaId).toBe(null);
    expect(mapped.mesaNumero).toBe(null);
  });

  test('con mesaNumero y sin populate no es sin mesa', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c1',
      comandaNumber: 42,
      mesaNumero: 7,
      totalCalculado: 80,
      platos: [{ nombre: 'Lomo', estado: 'entregado' }],
    }, 80);
    expect(mapped.esSinMesa).toBe(false);
    expect(mapped.mesaNumero).toBe(7);
  });

  test('esSinMesa cuando sinMesa es true', () => {
    const mapped = mapComandaPorCobrar({
      _id: 'c-sm',
      comandaNumber: 70,
      sinMesa: true,
      totalCalculado: 15,
      platos: [{ nombre: 'DCH', estado: 'pedido', tipoServicio: 'para_llevar' }],
    }, 15);
    expect(mapped.esSinMesa).toBe(true);
    expect(mapped.sinMesa).toBe(true);
  });

  test('pendienteDeComanda es 0 si todos los platos están pagados', () => {
    const c = {
      status: 'entregado',
      IsActive: true,
      platos: [{ estado: 'pagado', precioUnitario: 10 }],
      cantidades: [1],
    };
    expect(pendienteDeComanda(c)).toBe(0);
  });

  test('pendienteDeComanda es 0 si todos los platos tienen PPA cobrado (forzar pago)', () => {
    const c = {
      status: 'entregado',
      IsActive: true,
      totalCalculado: 40,
      platos: [{
        estado: 'entregado',
        precioUnitario: 40,
        pagoAdelantado: { cobrado: true, estadoTicket: 'aprobado' },
      }],
      cantidades: [1],
    };
    expect(pendienteDeComanda(c)).toBe(0);
    expect(pendienteDeComanda(c, { cobradoBouchers: 40 })).toBe(0);
  });
});

describe('pagadas hoy (helpers)', () => {
  const {
    ESTADOS_POR_COBRAR,
    esComandaPagadaCaja,
    fechaEnRango,
    fechaReferenciaPago,
  } = require('../src/utils/pendienteCobroMozo');

  test('ESTADOS_POR_COBRAR incluye pedido (para llevar)', () => {
    expect(ESTADOS_POR_COBRAR).toContain('pedido');
    expect(ESTADOS_POR_COBRAR).toContain('en_espera');
  });

  test('esComandaPagadaCaja con PPA cobrado y status pedido', () => {
    const c = {
      status: 'pedido',
      sinMesa: true,
      platos: [{
        estado: 'pedido',
        pagoAdelantado: { cobrado: true, estadoTicket: 'pendiente_aprobacion' },
      }],
    };
    expect(esComandaPagadaCaja(c)).toBe(true);
  });

  test('esComandaPagadaCaja false si aún hay saldo', () => {
    const c = {
      status: 'en_espera',
      platos: [{ estado: 'pedido', precioUnitario: 10 }],
    };
    expect(esComandaPagadaCaja(c)).toBe(false);
  });

  test('fechaEnRango cubre el día Lima', () => {
    const inicio = new Date('2026-09-06T05:00:00.000Z');
    const fin = new Date('2026-09-07T04:59:59.999Z');
    expect(fechaEnRango(new Date('2026-09-06T12:00:00.000Z'), inicio, fin)).toBe(true);
    expect(fechaEnRango(new Date('2026-09-05T20:00:00.000Z'), inicio, fin)).toBe(false);
  });

  test('fechaReferenciaPago usa tiempoPagado', () => {
    const d = new Date('2026-09-06T15:00:00.000Z');
    expect(fechaReferenciaPago({ tiempoPagado: d, createdAt: new Date('2026-09-01') }).getTime()).toBe(d.getTime());
  });
});

describe('seguimiento sin mesa en pendientes', () => {
  const {
    seguimientoSinMesaEnPendientes,
    comandaAunEnServicio,
  } = require('../src/utils/pendienteCobroMozo');

  test('PPA cobrado sin mesa sigue en pendientes mientras cocina', () => {
    const c = {
      sinMesa: true,
      status: 'en_espera',
      platos: [{
        estado: 'en_espera',
        tipoServicio: 'para_llevar',
        pagoAdelantado: { cobrado: true, estadoTicket: 'aprobado' },
      }],
    };
    expect(comandaAunEnServicio(c)).toBe(true);
    expect(seguimientoSinMesaEnPendientes(c)).toBe(true);
  });

  test('sin mesa entregada ya no es seguimiento', () => {
    const c = {
      sinMesa: true,
      status: 'en_espera',
      platos: [{ estado: 'entregado', tipoServicio: 'para_llevar' }],
    };
    expect(seguimientoSinMesaEnPendientes(c)).toBe(false);
  });
});

describe('comandaCalificaLiberarSinCaja (costo 0)', () => {
  const { comandaCalificaLiberarSinCaja, esComandaSinCobro } = require('../src/utils/pendienteCobroMozo');

  test('plato 0 entregado se libera sin caja', () => {
    const c = {
      platos: [{ estado: 'entregado', precioUnitario: 0, eliminado: false }],
      cantidades: [1],
    };
    expect(esComandaSinCobro(c)).toBe(true);
    expect(comandaCalificaLiberarSinCaja(c)).toBe(true);
  });

  test('plato 0 aún en cocina no se libera', () => {
    const c = {
      platos: [{ estado: 'pedido', precioUnitario: 0 }],
      cantidades: [1],
    };
    expect(comandaCalificaLiberarSinCaja(c)).toBe(false);
  });

  test('plato 0 + adicional con precio sigue el flujo de caja', () => {
    const c = {
      platos: [
        { estado: 'entregado', precioUnitario: 0 },
        { estado: 'entregado', precioUnitario: 8 },
      ],
      cantidades: [1, 1],
    };
    expect(esComandaSinCobro(c)).toBe(false);
    expect(comandaCalificaLiberarSinCaja(c)).toBe(false);
  });

  test('plato 0 con extra en precioUnitario no es costo cero', () => {
    const c = {
      platos: [{ estado: 'entregado', precioUnitario: 5 }],
      cantidades: [1],
    };
    expect(esComandaSinCobro(c)).toBe(false);
    expect(comandaCalificaLiberarSinCaja(c)).toBe(false);
  });
});
