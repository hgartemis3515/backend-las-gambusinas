const {
  ticketElegibleForzarPago,
  repartirEfectivoGrupo,
} = require('../src/utils/forzarPagoGrupo');

describe('forzar pago de grupo', () => {
  test('solo comanda o parcial pendiente, sin boucher', () => {
    const base = { estado: 'pendiente_aprobacion', tipo: 'comanda_completa', isActive: true };
    expect(ticketElegibleForzarPago(base)).toBe(true);
    expect(ticketElegibleForzarPago({ ...base, tipo: 'pago_parcial' })).toBe(true);
    expect(ticketElegibleForzarPago({ ...base, tipo: 'pago_adelantado' })).toBe(false);
    expect(ticketElegibleForzarPago({ ...base, boucher: 'x' })).toBe(false);
    expect(ticketElegibleForzarPago({ ...base, estado: 'aprobado' })).toBe(false);
  });

  test('el vuelto del efectivo queda en la última comanda', () => {
    const partes = repartirEfectivoGrupo([10, 25.5, 4.5], 50);
    expect(partes).toEqual([
      { montoRecibido: 10, vuelto: 0 },
      { montoRecibido: 25.5, vuelto: 0 },
      { montoRecibido: 14.5, vuelto: 10 },
    ]);
    const sumaRecibido = partes.reduce((s, p) => s + p.montoRecibido, 0);
    const sumaVuelto = partes.reduce((s, p) => s + p.vuelto, 0);
    expect(Math.round(sumaRecibido * 100) / 100).toBe(50);
    expect(Math.round((sumaRecibido - sumaVuelto) * 100) / 100).toBe(40);
  });
});
