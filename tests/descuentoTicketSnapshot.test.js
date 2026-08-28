const {
  adjuntarDescuentoTicket,
  aplicarDescuentoAVistaTicket,
  totalesConDescuentoImpresion,
  aplicarDescuentoADocTicket,
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
});
