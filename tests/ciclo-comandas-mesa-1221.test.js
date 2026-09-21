/**
 * Reproducción 1221/1222: mesa pendiente_aprobar + comanda nueva en pedido.
 * El endpoint para-pagos omite 1222; el cliente debe fusionar /activas.
 */
const {
  reducirRespuestasCicloMesa,
  mergeComandasPorId,
} = require('../../Las-Gambusinas/utils/cicloComandasMesa');

const PEDIDO = '6ab04a0d9800068f136791c4';

const c1221 = {
  _id: '6ab04a0d9800068f136791ba',
  comandaNumber: 1221,
  pedido: PEDIDO,
  status: 'pendiente_aprobar',
  createdAt: '2026-09-20T21:03:09.412Z',
  updatedAt: '2026-09-20T21:03:32.174Z',
  tiempoPagado: '2026-09-20T21:03:32.174Z',
  IsActive: true,
  platos: [{ estado: 'pendiente' }, { estado: 'pendiente' }],
};

const c1222 = {
  _id: '6ab04b4e9800068f1368596d',
  comandaNumber: 1222,
  pedido: PEDIDO,
  status: 'en_espera',
  createdAt: '2026-09-20T21:08:30.060Z',
  updatedAt: '2026-09-20T21:08:30.090Z',
  IsActive: true,
  platos: [{ estado: 'pedido' }, { estado: 'pedido' }],
};

function visibleEnParaPagos(comanda) {
  return (comanda.platos || []).some((p) => {
    if (p.eliminado || p.anulado) return false;
    const e = String(p.estado || '').toLowerCase();
    if (e === 'entregado' || e === 'pagado' || e === 'pendiente') return true;
    const t = p.pagoAdelantado && p.pagoAdelantado.estadoTicket;
    return t === 'pendiente_aprobacion' || t === 'aprobado';
  });
}

function numeros(list) {
  return (list || []).map((c) => c.comandaNumber).sort((a, b) => a - b);
}

describe('ciclo comandas mesa 1221+1222', () => {
  test('para-pagos deja fuera 1222 (solo platos pedido)', () => {
    expect(visibleEnParaPagos(c1221)).toBe(true);
    expect(visibleEnParaPagos(c1222)).toBe(false);
  });

  test('bug: primera ruta no vacía oculta 1222', () => {
    const { comandas } = reducirRespuestasCicloMesa([
      { ruta: 'para-pagos', data: { success: true, pedidoId: PEDIDO, comandas: [c1221] } },
      { ruta: 'activas', data: { success: true, pedidoId: PEDIDO, comandas: [c1221, c1222] } },
    ], 'pedido');
    expect(numeros(comandas)).toEqual([1221]);
  });

  test('pendiente_aprobar fusiona para-pagos + activas y muestra 1222', () => {
    const { comandas, pedidoId } = reducirRespuestasCicloMesa([
      { ruta: 'para-pagos', data: { success: true, pedidoId: PEDIDO, comandas: [c1221] } },
      { ruta: 'activas', data: { success: true, pedidoId: PEDIDO, comandas: [c1221, c1222] } },
      { ruta: 'pagadas', data: { success: true, comandas: [{ _id: 'old', comandaNumber: 900, pedido: 'otro' }] } },
    ], 'pendiente_aprobar');
    expect(pedidoId).toBe(PEDIDO);
    expect(numeros(comandas)).toEqual([1221, 1222]);
  });

  test('pendiente_pago también fusiona', () => {
    const { comandas } = reducirRespuestasCicloMesa([
      { ruta: 'para-pagos', data: { success: true, comandas: [c1221] } },
      { ruta: 'activas', data: { success: true, comandas: [c1222] } },
    ], 'pendiente_pago');
    expect(numeros(comandas)).toEqual([1221, 1222]);
  });

  test('pagadas no se mezcla si ya hay ciclo pendiente', () => {
    const { comandas } = reducirRespuestasCicloMesa([
      { ruta: 'para-pagos', data: { success: true, comandas: [c1221] } },
      { ruta: 'pagadas', data: { success: true, comandas: [{ _id: 'old', comandaNumber: 1 }] } },
    ], 'pendiente_aprobar');
    expect(numeros(comandas)).toEqual([1221]);
  });

  test('merge por id prefiere más platos', () => {
    const merged = mergeComandasPorId(
      [{ _id: 'a', platos: [{ estado: 'pendiente' }], updatedAt: '2026-01-01T00:00:00Z' }],
      [{ _id: 'a', platos: [{ estado: 'pendiente' }, { estado: 'pedido' }], updatedAt: '2026-01-01T00:00:01Z' }]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].platos).toHaveLength(2);
  });
});
