const {
  adjuntarDescuentoTicket,
  aplicarDescuentoAVistaTicket,
  totalesConDescuentoImpresion,
  aplicarDescuentoADocTicket,
  aplicarDescuentoADocDesdeComanda,
  marcarYRestarPlatosEliminados,
} = require('../src/utils/descuentoTicketSnapshot');

describe('descuento en tickets / impresión', () => {
  test('usa descuento de la comanda si el ticket no lo tiene', () => {
    const t = adjuntarDescuentoTicket({
      total: 624,
      comandas: [{ comandaNumber: 12, descuento: 10, montoDescuento: 62.4, motivoDescuento: 'VIP', totalSinDescuento: 624 }],
    });
    expect(t.montoDescuento).toBe(62.4);
    expect(t.descuentos[0].motivo).toBe('VIP');
  });

  test('impresión: total 624 con descuento 62.4 → TOTAL 561.6 y línea Descuento', () => {
    const r = totalesConDescuentoImpresion(
      {
        total: 624,
        subtotal: 624,
        comandas: [{ descuento: 10, montoDescuento: 62.4, totalSinDescuento: 624 }],
      },
      { subtotal: 624, total: 624 }
    );
    expect(r.montoDescuento).toBe(62.4);
    expect(r.total).toBe(561.6);
    expect(r.subtotal).toBe(624);
  });

  test('ticket ya persistido no doble-descuenta', () => {
    const r = aplicarDescuentoAVistaTicket({
      total: 561.6,
      montoDescuento: 62.4,
      totalSinDescuento: 624,
      descuentos: [{ monto: 62.4, porcentaje: 10 }],
    });
    expect(r.total).toBe(561.6);
    expect(r.montoDescuento).toBe(62.4);
  });

  test('aplicarDescuentoADocTicket escribe snapshot y total neto', () => {
    const doc = { total: 624, totalSinDescuento: null };
    aplicarDescuentoADocTicket(doc, { porcentaje: 10, motivo: 'VIP', comandaNumber: 5 });
    expect(doc.totalSinDescuento).toBe(624);
    expect(doc.montoDescuento).toBe(62.4);
    expect(doc.total).toBe(561.6);
    expect(doc.descuentos[0].motivo).toBe('VIP');
  });

  test('quitar descuento restaura total original', () => {
    const doc = { total: 561.6, totalSinDescuento: 624, montoDescuento: 62.4, descuentos: [{}] };
    aplicarDescuentoADocTicket(doc, { porcentaje: 0 });
    expect(doc.total).toBe(624);
    expect(doc.montoDescuento).toBe(0);
    expect(doc.descuentos).toEqual([]);
  });

  test('descuento 100% deja total 0', () => {
    const r = totalesConDescuentoImpresion(
      {
        total: 0,
        subtotal: 118,
        montoDescuento: 118,
        totalSinDescuento: 118,
        descuentos: [{ porcentaje: 100, monto: 118 }],
      },
      { subtotal: 118, total: 0 }
    );
    expect(r.montoDescuento).toBe(118);
    expect(r.total).toBe(0);
  });

  test('TOTAL se resta aunque el ticket siga con el bruto', () => {
    const r = totalesConDescuentoImpresion(
      {
        total: 624,
        subtotal: 624,
        montoDescuento: 62.4,
      },
      { subtotal: 624, total: 624 }
    );
    expect(r.subtotal).toBe(624);
    expect(r.montoDescuento).toBe(62.4);
    expect(r.total).toBe(561.6);
  });

  test('no doble-resta si total ya es neto y hay totalSinDescuento', () => {
    const r = aplicarDescuentoAVistaTicket({
      total: 561.6,
      montoDescuento: 62.4,
      totalSinDescuento: 624,
    });
    expect(r.total).toBe(561.6);
  });

  test('post-pago: ticket/boucher en 0 usa descuento vivo de la comanda', () => {
    const t = adjuntarDescuentoTicket({
      total: 624,
      montoDescuento: 0,
      boucher: { total: 624, montoDescuento: 0 },
      comandas: [{ comandaNumber: 12, descuento: 10, montoDescuento: 62.4, motivoDescuento: 'VIP', totalSinDescuento: 624 }],
    });
    expect(t.montoDescuento).toBe(62.4);
    const vista = aplicarDescuentoAVistaTicket({
      total: 624,
      montoDescuento: 0,
      comandas: [{ descuento: 10, montoDescuento: 62.4, totalSinDescuento: 624 }],
    });
    expect(vista.total).toBe(561.6);
  });

  test('post-pago: boucher de 2 comandas solo resta la que tiene descuento', () => {
    const boucher = {
      total: 300,
      montoDescuento: 0,
      descuentos: [],
      comandas: ['a', 'b'],
      platos: [
        { comandaNumber: 1, subtotal: 100 },
        { comandaNumber: 2, subtotal: 200 },
      ],
    };
    aplicarDescuentoADocDesdeComanda(boucher, {
      _id: 'a',
      comandaNumber: 1,
      descuento: 10,
      montoDescuento: 10,
      motivoDescuento: 'cortesía',
      totalCalculado: 90,
      platos: [{ precioUnitario: 100, cantidad: 1 }],
    });
    expect(boucher.montoDescuento).toBe(10);
    expect(boucher.total).toBe(290);
    expect(boucher.descuentos).toHaveLength(1);
    expect(boucher.descuentos[0].comandaNumber).toBe(1);
  });

  test('plato eliminado se marca en snapshot y baja el bruto', () => {
    const doc = {
      total: 150,
      totalSinDescuento: 150,
      subtotal: 150,
      platos: [
        { platoLineaId: 'a1', nombre: 'Lomo', subtotal: 100, comandaNumber: 1 },
        { platoLineaId: 'b1', nombre: 'Causa', subtotal: 50, comandaNumber: 1 },
      ],
    };
    marcarYRestarPlatosEliminados(doc, {
      _id: 'c1',
      comandaNumber: 1,
      platos: [
        { _id: 'a1', eliminado: true, nombre: 'Lomo' },
        { _id: 'b1', eliminado: false, nombre: 'Causa' },
      ],
    });
    expect(doc.platos[0].eliminado).toBe(true);
    expect(doc.platos[1].eliminado).toBeFalsy();
    expect(doc.subtotal).toBe(50);
    expect(doc.totalSinDescuento).toBe(50);
  });
});
