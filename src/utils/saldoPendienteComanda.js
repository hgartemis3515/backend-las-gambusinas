'use strict';

/**
 * Saldo pendiente por cobrar de una comanda POPULADA dentro de un ticket.
 *
 * Regla (misma que calcularTotalPendienteMesa en comanda.repository):
 * pendiente = suma de platos activos en estado 'entregado' × cantidades[] (unidades restantes),
 * prorrateando el descuento de la comanda cuando aplica.
 *
 * Un ticket pago_parcial registra lo COBRADO en ese envío (snapshot de platos);
 * el saldo por cobrar se calcula en vivo contra la comanda, así la tabla de
 * cocina refleja el mismo pendiente que ve el mozo (p.ej. 383 = 77+45+150+111
 * cuando quedan 3 pollos + tamal por cobrar).
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function precioDeLinea(p) {
  const rawU = p && p.precioUnitario;
  if (rawU != null && rawU !== '') {
    const v = Number(rawU);
    if (Number.isFinite(v) && v >= 0) return v;
  }
  const rawP = p && p.precio;
  if (rawP != null && rawP !== '') {
    const alt = Number(rawP);
    if (Number.isFinite(alt) && alt >= 0) return alt;
  }
  return null;
}

function cantidadDeLinea(comanda, p, index) {
  const fromArr = Number(comanda?.cantidades?.[index]);
  if (Number.isFinite(fromArr) && fromArr >= 0) return fromArr;
  const fromSub = Number(p?.cantidad);
  if (Number.isFinite(fromSub) && fromSub >= 0) return fromSub;
  return 1;
}

/** Saldo pendiente (0..n) de una comanda populada; null si no se puede calcular.
 * PPA PARCIAL v2: modo 'ppa' suma como pendientes los platos cobrables sin
 * cobrar vía PPA (pedido/en_espera/recoger/salio/entregado SIN pagoAdelantado
 * cobrado ni ticket PPA pendiente/aprobado). Modo default: solo 'entregado'. */
function pendienteCobroDeComandaPopulada(comanda, { modo = 'entregado' } = {}) {
  if (!comanda || typeof comanda !== 'object') return null;
  const platos = Array.isArray(comanda.platos) ? comanda.platos : [];
  if (!platos.length) return 0;

  const esPpa = modo === 'ppa';
  let subPagable = 0; // platos cobrables sin cobrar
  let subTotal = 0; // bruto de todos los platos activos
  for (let i = 0; i < platos.length; i++) {
    const p = platos[i];
    if (!p || p.eliminado === true || p.anulado === true) continue;
    const precio = precioDeLinea(p);
    if (precio == null) return null; // sin precio no hay número confiable
    const cant = cantidadDeLinea(comanda, p, i);
    subTotal += precio * cant;
    if (esPpa) {
      const estado = String(p.estado || '').toLowerCase();
      const cobradoPpa = p.pagoAdelantado?.cobrado === true;
      const ticketPpaActivo = ['pendiente_aprobacion', 'aprobado']
        .includes(String(p.pagoAdelantado?.estadoTicket || '').toLowerCase());
      const cobrableSinCobrar = ['pedido', 'en_espera', 'recoger', 'salio', 'entregado']
        .includes(estado) && !cobradoPpa && !ticketPpaActivo;
      if (cobrableSinCobrar) {
        subPagable += precio * cant;
      }
    } else if (String(p.estado || '').toLowerCase() === 'entregado') {
      subPagable += precio * cant;
    }
  }
  subPagable = round2(subPagable);
  subTotal = round2(subTotal);

  const desc = Number(comanda.montoDescuento) || 0;
  const calc = Number(comanda.totalCalculado);
  if (desc > 0 && Number.isFinite(calc) && calc >= 0) {
    // Con descuento: prorratear el total neto según lo aún entregado.
    if (subTotal > 0 && subPagable < subTotal) {
      return round2(Math.max(0, calc) * (subPagable / subTotal));
    }
    return round2(Math.max(0, calc));
  }
  return subPagable;
}

/** Adjunta `pendienteCobro` a cada comanda populada de cada ticket (muta copia).
 * modo='ppa': pendiente incluye platos aún sin cobrar vía PPA (pedido/en_espera...). */
function adjuntarPendienteCobroTickets(tickets, { modo = 'entregado' } = {}) {
  for (const t of tickets || []) {
    if (!t || !Array.isArray(t.comandas)) continue;
    t.comandas = t.comandas.map((c) => {
      if (!c || typeof c !== 'object') return c;
      const pendiente = pendienteCobroDeComandaPopulada(c, { modo });
      if (pendiente == null) return c;
      return { ...c, pendienteCobro: pendiente };
    });
  }
  return tickets;
}

/** Suma de pendientes de las comandas populadas de un ticket (0 si ninguna). */
function saldoPendienteDeTicket(ticket, { modo = 'entregado' } = {}) {
  const cmds = Array.isArray(ticket?.comandas) ? ticket.comandas : [];
  let sum = 0;
  let ok = false;
  for (const c of cmds) {
    if (!c || typeof c !== 'object') continue;
    const n = Number(c.pendienteCobro);
    if (!Number.isFinite(n)) continue;
    ok = true;
    sum += Math.max(0, n);
  }
  return ok ? round2(sum) : 0;
}

module.exports = {
  pendienteCobroDeComandaPopulada,
  adjuntarPendienteCobroTickets,
  saldoPendienteDeTicket,
};