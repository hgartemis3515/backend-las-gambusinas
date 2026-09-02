/**
 * Saldo que el mozo aún debe cobrar: neto de comandas abiertas
 * menos seña de reserva, bouchers (pago / forzar / PPA) y descuento.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function sumaPlatosActivos(comanda) {
  let s = 0;
  (comanda.platos || []).forEach((p, i) => {
    if (!p || p.eliminado === true || p.anulado === true) return;
    const cant = Number(p.cantidad ?? comanda.cantidades?.[i] ?? 1) || 1;
    const precio = Number(p.precioUnitario ?? p.precio ?? p.plato?.precio) || 0;
    s += precio * cant;
  });
  return round2(s);
}

function netoComanda(c) {
  const desc = Number(c.montoDescuento) || 0;
  const pct = Number(c.descuento) || 0;
  const calc = Number(c.totalCalculado);
  if (desc > 0 || pct > 0) {
    if (Number.isFinite(calc) && calc >= 0) return round2(Math.max(0, calc));
    const bruto = Number(c.totalSinDescuento) > 0 ? Number(c.totalSinDescuento) : sumaPlatosActivos(c);
    return round2(Math.max(0, bruto - desc));
  }
  if (Number.isFinite(calc) && calc > 0) return round2(calc);
  if (Number(c.totalSinDescuento) > 0) return round2(c.totalSinDescuento);
  return sumaPlatosActivos(c);
}

function cobradoBouchersDeComanda(comandaId, bouchers) {
  const id = String(comandaId);
  let sum = 0;
  for (const b of bouchers || []) {
    const ids = (b.comandas || []).map((x) => String(x?._id || x));
    if (!ids.includes(id)) continue;
    const tot = Number(b.total) || 0;
    sum += ids.length <= 1 ? tot : tot / ids.length;
  }
  return round2(sum);
}

function esComandaCerradaParaPendiente(c) {
  if (!c) return true;
  if (c.eliminada === true || c.eliminado === true) return true;
  if (c.IsActive === false || c.isActive === false) return true;
  const st = String(c.status || '').toLowerCase();
  return ['pagado', 'completado', 'cancelado', 'anulado', 'cerrado'].includes(st);
}

function pendienteDeComanda(c, { adelanto = 0, cobradoBouchers = 0 } = {}) {
  if (esComandaCerradaParaPendiente(c)) return 0;
  const platos = (c.platos || []).filter((p) => p && p.eliminado !== true && p.anulado !== true);
  if (!platos.length) return 0;
  if (platos.every((p) => String(p.estado || '').toLowerCase() === 'pagado')) return 0;

  const neto = netoComanda(c);
  const collected = round2(Math.max(0, Number(adelanto) || 0) + Math.max(0, Number(cobradoBouchers) || 0));
  return round2(Math.max(0, neto - collected));
}

/** Comandas abiertas que el mozo aún debe cobrar (no pagado/completado). */
const ESTADOS_POR_COBRAR = [
  'pendiente',
  'pendiente_aprobar',
  'en_espera',
  'recoger',
  'salio',
  'entregado',
];

function cocineroDeBloque(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const nombre = String(obj.alias || obj.nombre || obj.name || '').trim();
  const cocineroId = obj.cocineroId || obj.usuarioId || null;
  if (!nombre && !cocineroId) return null;
  return {
    nombre: nombre || 'Cocinero',
    cocineroId: cocineroId ? String(cocineroId) : null,
  };
}

function cocineroDePlato(p) {
  return cocineroDeBloque(p?.procesandoPor)
    || cocineroDeBloque(p?.procesadoPor)
    || cocineroDeBloque(p?.finalizadoPor);
}

function mapComandaPorCobrar(c, pendienteCobro) {
  const platos = [];
  const cocinerosMap = new Map();
  (c.platos || []).forEach((p, i) => {
    if (!p || p.eliminado === true || p.anulado === true) return;
    const nombre = p.plato?.nombre || p.plato?.nombreCocina || p.nombre || p.platoNombre || 'Plato';
    const cantidad = Number(p.cantidad ?? c.cantidades?.[i] ?? 1) || 1;
    const coc = cocineroDePlato(p);
    if (coc) {
      const key = String(coc.cocineroId || coc.nombre);
      if (!cocinerosMap.has(key)) cocinerosMap.set(key, coc);
    }
    platos.push({
      nombre,
      cantidad,
      estado: p.estado || 'pedido',
      cocinero: coc,
    });
  });
  const cocComanda = cocineroDeBloque(c.procesandoPor) || cocineroDeBloque(c.procesadoPor);
  if (cocComanda) {
    const key = String(cocComanda.cocineroId || cocComanda.nombre);
    if (!cocinerosMap.has(key)) cocinerosMap.set(key, cocComanda);
  }
  return {
    _id: c._id,
    comandaNumber: c.comandaNumber,
    status: c.status,
    createdAt: c.createdAt,
    mesaNumero: c.mesaNumero ?? c.mesas?.nummesa ?? c.mesas?.numero ?? null,
    total: netoComanda(c),
    pendienteCobro: round2(pendienteCobro),
    observaciones: c.observaciones || '',
    platos,
    platosResumen: platos.map((p) => (p.cantidad > 1 ? `${p.nombre} x${p.cantidad}` : p.nombre)).join(', '),
    cocineros: [...cocinerosMap.values()],
  };
}

module.exports = {
  round2,
  netoComanda,
  cobradoBouchersDeComanda,
  pendienteDeComanda,
  esComandaCerradaParaPendiente,
  ESTADOS_POR_COBRAR,
  cocineroDeBloque,
  cocineroDePlato,
  mapComandaPorCobrar,
};
