function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Misma regla que el botón de cocina: comanda o parcial pendiente, sin boucher. */
function ticketElegibleForzarPago(ticket) {
  if (!ticket || ticket.isActive === false) return false;
  if (ticket.estado !== 'pendiente_aprobacion') return false;
  if (ticket.boucher) return false;
  if (ticket.esPagoAdelantado === true) return false;
  const tipo = String(ticket.tipo || '').toLowerCase();
  if (tipo === 'pago_adelantado' || tipo === 'adelantado') return false;
  return tipo === 'comanda_completa' || tipo === 'comanda' || tipo === 'pago_parcial';
}

/**
 * Reparte el efectivo del grupo: cada comanda cobra su total;
 * el vuelto queda en la última.
 */
function repartirEfectivoGrupo(netos, recibido) {
  const partes = [];
  let rest = round2(recibido);
  (netos || []).forEach((neto, i) => {
    const n = round2(neto);
    const ultimo = i === netos.length - 1;
    if (ultimo) {
      const mr = round2(rest);
      partes.push({ montoRecibido: mr, vuelto: round2(Math.max(0, mr - n)) });
      return;
    }
    partes.push({ montoRecibido: n, vuelto: 0 });
    rest = round2(rest - n);
  });
  return partes;
}

module.exports = {
  round2,
  ticketElegibleForzarPago,
  repartirEfectivoGrupo,
};
