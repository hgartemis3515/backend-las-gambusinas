'use strict';

/**
 * Cruza Ventas Pendientes / Pagadas (desglose) contra:
 * - filtro Pendientes / Cobrados de la tabla de tickets (cocina)
 * - total neto de comandas.html
 * Uso: node scripts/investigar-cuadre-ventas.js [YYYY-MM-DD]
 */

require('dotenv/config');
const mongoose = require('mongoose');
const moment = require('moment-timezone');

require('../src/database/models/mozos.model');
require('../src/database/models/mesas.model');
require('../src/database/models/plato.model');
require('../src/database/models/boucher.model');
const ticketAprobacionModel = require('../src/database/models/ticketAprobacion.model');
const ticketPagoAdelantadoModel = require('../src/database/models/ticketPagoAdelantado.model');
const comandaModel = require('../src/database/models/comanda.model');
const {
  rangoLima,
  listarFilasEstadisticas,
  esComandaEliminada,
} = require('../src/utils/estadisticasComandas');
const {
  desgloseVentasPorAprobacion,
  filaEsVentaPagada,
} = require('../src/utils/desgloseVentasTickets');

const TZ = 'America/Lima';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function ymdOperativo(d = new Date()) {
  const m = moment(d).tz(TZ);
  if (m.hour() < 4) m.subtract(1, 'day');
  return m.format('YYYY-MM-DD');
}

function totalNetoComanda(c) {
  if (!c || esComandaEliminada(c)) return 0;
  const md = Number(c.montoDescuento) || 0;
  const sin = Number(c.totalSinDescuento) || 0;
  const tc = c.totalCalculado != null && c.totalCalculado !== '' ? Number(c.totalCalculado) : NaN;
  const tot = Number(c.total);
  const hayDesc = md > 0 || Number(c.descuento) > 0 || Number(c.descuentoMontoFijo) > 0;
  const bruto = sin > 0 ? sin : (Number.isFinite(tot) && tot > 0 ? tot : 0);
  if (hayDesc) {
    if (Number.isFinite(tc) && tc >= 0) return round2(tc);
    if (md > 0 && bruto > 0) return round2(Math.max(0, bruto - md));
    return 0;
  }
  if (Number.isFinite(tc) && tc > 0) return round2(tc);
  if (Number.isFinite(tot) && tot > 0) return round2(tot);
  return 0;
}

function idDeRef(v) {
  if (v == null) return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

function idsComanda(t) {
  const raw = Array.isArray(t?.comandas) ? t.comandas : [];
  const ids = raw.map(idDeRef).filter(Boolean);
  if (ids.length) return ids;
  if (t?.comandaId) return [idDeRef(t.comandaId)].filter(Boolean);
  return [];
}

function tsTicket(t) {
  const d = t?.createdAt ? new Date(t.createdAt).getTime() : 0;
  return Number.isFinite(d) ? d : 0;
}

function masNuevo(a, b) {
  const ta = tsTicket(a);
  const tb = tsTicket(b);
  if (ta !== tb) return ta > tb ? a : b;
  const na = Number(a?.ticketNumber) || 0;
  const nb = Number(b?.ticketNumber) || 0;
  if (na !== nb) return na > nb ? a : b;
  return String(a?._id) >= String(b?._id) ? a : b;
}

async function main() {
  const ymd = process.argv[2] || ymdOperativo();
  const uri = process.env.DBLOCAL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Sin DBLOCAL/MONGODB_URI');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const { inicio, fin } = rangoLima(ymd, ymd);
  const desglose = await desgloseVentasPorAprobacion(inicio, fin, { tablaTickets: true });
  const filas = await listarFilasEstadisticas(inicio, fin);

  const [ticketsCmd, ticketsPpa] = await Promise.all([
    ticketAprobacionModel.find({ createdAt: { $gte: inicio, $lte: fin }, isActive: { $ne: false } }).lean(),
    ticketPagoAdelantadoModel.find({ createdAt: { $gte: inicio, $lte: fin }, isActive: { $ne: false } }).lean(),
  ]);
  const tickets = [...ticketsCmd, ...ticketsPpa];

  const lastBy = new Map();
  tickets.forEach((t) => {
    for (const cid of idsComanda(t)) {
      const prev = lastBy.get(cid);
      lastBy.set(cid, prev ? masNuevo(t, prev) : t);
    }
  });

  let pendTickets = 0;
  let cobrTickets = 0;
  let otrosTickets = 0;
  const porEstadoTicket = {};
  for (const t of tickets) {
    const est = String(t.estado || '');
    const total = round2(t.total);
    porEstadoTicket[est] = round2((porEstadoTicket[est] || 0) + total);
    if (est === 'pendiente_aprobacion') pendTickets += total;
    else if (est === 'aprobado') cobrTickets += total;
    else otrosTickets += total;
  }

  // Un ticket por comanda, como el KPI de cocina (resumenKpisTickets) sin saldo vivo.
  const seen = new Set();
  let kpiUltimoPend = 0;
  let kpiUltimoPag = 0;
  for (const t of lastBy.values()) {
    if (seen.has(t)) continue;
    seen.add(t);
    const total = round2(t.total);
    if (t.estado === 'pendiente_aprobacion') kpiUltimoPend += total;
    else if (t.estado === 'aprobado') kpiUltimoPag += total;
  }

  const comandas = await comandaModel.find({
    createdAt: { $gte: inicio, $lte: fin },
    eliminada: { $ne: true },
    fechaEliminacion: null,
    status: { $ne: 'cancelado' },
  }).select('comandaNumber status total totalCalculado totalSinDescuento montoDescuento descuento descuentoMontoFijo tiempoPagado createdAt pagoOmitido').lean();

  let htmlPend = 0;
  let htmlPag = 0;
  let htmlEntregado = 0;
  let htmlOtros = 0;
  const porStatus = {};
  for (const c of comandas) {
    const neto = totalNetoComanda(c);
    const st = String(c.status || '');
    porStatus[st] = round2((porStatus[st] || 0) + neto);
    if (st === 'pendiente_aprobar') htmlPend += neto;
    else if (st === 'pagado' || st === 'completado') htmlPag += neto;
    else if (st === 'entregado') htmlEntregado += neto;
    else htmlOtros += neto;
  }

  const filasById = new Map(filas.map((f) => [String(f._id), f]));
  const cmdById = new Map(comandas.map((c) => [String(c._id), c]));

  const huérfanasEnDesglose = [];
  const clasifDistinta = [];
  let sumaFilaPend = 0;
  let sumaFilaPag = 0;
  for (const f of filas) {
    const last = lastBy.get(String(f._id));
    const pagada = filaEsVentaPagada(f, last);
    const amount = round2(f.total);
    if (pagada) sumaFilaPag += amount;
    else sumaFilaPend += amount;
    const html = cmdById.get(String(f._id));
    const netoHtml = html ? totalNetoComanda(html) : null;
    const st = String(f.status || '');
    const ticketEst = last ? last.estado : '(sin ticket en el día)';
    const esperaPend = st === 'pendiente_aprobar' || st === 'entregado' || f.soloPagoAdelantado;
    const esperaPag = st === 'pagado' || st === 'completado';
    const clase = pagada ? 'pagada' : 'pendiente';
    const claseHtml = st === 'pendiente_aprobar' ? 'pendiente' : (st === 'pagado' || st === 'completado' ? 'pagada' : st);
    if (clase !== claseHtml || (netoHtml != null && Math.abs(netoHtml - amount) > 0.009) || !last) {
      clasifDistinta.push({
        n: f.comandaNumber,
        status: st,
        claseDesglose: clase,
        claseHtml,
        totalReporte: amount,
        totalHtml: netoHtml,
        delta: netoHtml == null ? null : round2(amount - netoHtml),
        ticket: ticketEst,
        ticketTotal: last ? round2(last.total) : null,
        soloPpa: !!f.soloPagoAdelantado,
        id: String(f._id),
      });
    }
  }

  // Tickets del día cuya comanda no está en las filas del desglose.
  const ticketsSinFila = [];
  for (const t of tickets) {
    const ids = idsComanda(t);
    const cubre = ids.some((id) => filasById.has(id));
    if (!cubre) {
      ticketsSinFila.push({
        n: t.ticketNumber,
        estado: t.estado,
        tipo: t.tipo,
        total: round2(t.total),
        comandas: t.comandasNumbers || ids,
        createdAt: t.createdAt,
      });
    }
  }

  // Tickets pendientes de cualquier día (la bandeja los trae) cuya fecha no es hoy.
  const pendCualquierDia = await Promise.all([
    ticketAprobacionModel.find({ estado: 'pendiente_aprobacion', isActive: { $ne: false } })
      .select('ticketNumber total comandasNumbers createdAt tipo estado').lean(),
    ticketPagoAdelantadoModel.find({ estado: 'pendiente_aprobacion', isActive: { $ne: false } })
      .select('ticketNumber total comandasNumbers createdAt tipo estado').lean(),
  ]);
  const pendFuera = [];
  let sumaPendFuera = 0;
  for (const t of [...pendCualquierDia[0], ...pendCualquierDia[1]]) {
    const enRango = t.createdAt && new Date(t.createdAt) >= inicio && new Date(t.createdAt) <= fin;
    if (enRango) continue;
    const total = round2(t.total);
    sumaPendFuera += total;
    pendFuera.push({
      n: t.ticketNumber,
      tipo: t.tipo,
      total,
      comandas: t.comandasNumbers,
      createdAt: t.createdAt,
    });
  }

  const de104 = [];
  const candidatos = [
    ...clasifDistinta.map((r) => ({ origen: 'fila', monto: r.delta, ...r })),
    ...ticketsSinFila.map((r) => ({ origen: 'ticket-sin-fila', monto: r.total, ...r })),
    ...pendFuera.map((r) => ({ origen: 'pendiente-otro-dia', monto: r.total, ...r })),
  ];
  for (const c of candidatos) {
    if (Math.abs(Number(c.monto) - 104) < 0.02 || Math.abs(Number(c.total) - 104) < 0.02) de104.push(c);
  }

  const out = {
    ymd,
    inicio,
    fin,
    desglose: {
      ventasPendientes: desglose.ventasPendientes,
      ventasAprobadas: desglose.ventasAprobadas,
      total: round2(desglose.ventasPendientes + desglose.ventasAprobadas),
    },
    sumaFilasReporte: { pendientes: round2(sumaFilaPend), pagadas: round2(sumaFilaPag) },
    comandasHtml: {
      pendiente_aprobar: round2(htmlPend),
      pagado_completado: round2(htmlPag),
      entregado: round2(htmlEntregado),
      otros: round2(htmlOtros),
      porStatus,
    },
    ticketsDelDia_sumaBruta: {
      pendientes: round2(pendTickets),
      cobrados: round2(cobrTickets),
      otros: round2(otrosTickets),
      porEstado: porEstadoTicket,
      cantidad: tickets.length,
    },
    ultimoTicketPorComanda: {
      pendientes: round2(kpiUltimoPend),
      pagadas: round2(kpiUltimoPag),
    },
    brechas: {
      desglosePend_vs_htmlPend: round2(desglose.ventasPendientes - htmlPend),
      desglosePag_vs_htmlPag: round2(desglose.ventasAprobadas - htmlPag),
      desglosePend_vs_ticketsPend: round2(desglose.ventasPendientes - pendTickets),
      desglosePag_vs_ticketsCobr: round2(desglose.ventasAprobadas - cobrTickets),
      desglosePend_vs_ultimo: round2(desglose.ventasPendientes - kpiUltimoPend),
      desglosePag_vs_ultimo: round2(desglose.ventasAprobadas - kpiUltimoPag),
      ticketsPend_vs_htmlPend: round2(pendTickets - htmlPend),
      ticketsCobr_vs_htmlPag: round2(cobrTickets - htmlPag),
    },
    filasConDiferencia: clasifDistinta.length,
    detalleDiferencias: clasifDistinta.slice(0, 80),
    ticketsSinFilaDelDia: ticketsSinFila,
    pendientesDeOtroDia: { suma: round2(sumaPendFuera), items: pendFuera.slice(0, 40), cantidad: pendFuera.length },
    montos104: de104,
  };

  const listaTickets = tickets.map((t) => {
    const platos = Array.isArray(t.platos) ? t.platos.filter((p) => p && !p.eliminado && !p.anulado) : [];
    const sumaPlatos = round2(platos.reduce((s, p) => s + (Number(p.subtotal) || (Number(p.precio) || 0) * (Number(p.cantidad) || 1)), 0));
    return {
      n: t.ticketNumber,
      tipo: t.tipo || 'ppa',
      estado: t.estado,
      total: round2(t.total),
      sumaPlatos,
      deltaPlatos: round2(sumaPlatos - (Number(t.total) || 0)),
      comandas: t.comandasNumbers,
      cobroPorCantidad: !!t.cobroPorCantidad,
      totalCuenta: t.totalCuenta != null ? round2(t.totalCuenta) : null,
      montoDescuento: round2(t.montoDescuento),
      pedido: t.pedido ? String(t.pedido) : null,
    };
  }).sort((a, b) => Number(a.n) - Number(b.n));

  const soloPpa = clasifDistinta.filter((r) => r.soloPpa && r.totalReporte > 0);
  const sumaSoloPpa = round2(soloPpa.reduce((s, r) => s + r.totalReporte, 0));

  console.log(JSON.stringify({
    ...out,
    listaTickets,
    soloPpaQueElDesglosePasaAPendiente: soloPpa,
    sumaSoloPpa,
    nota104: {
      sumaSinLaDe74: round2(sumaSoloPpa - 74),
      combinacion_70_33_1: 104,
    },
  }, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
