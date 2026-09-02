/**
 * Helpers de ticket al crear comanda y filtro DIA/NOCHE (misma lógica que comandas.html).
 */
const moment = require('moment-timezone');

const ZONA = 'America/Lima';

function limaYMD(d) {
  return moment.tz(d || new Date(), ZONA).format('YYYY-MM-DD');
}

function limaDayStart(ymd) {
  return moment.tz(ymd, 'YYYY-MM-DD', ZONA).startOf('day').toDate();
}

function limaDayEnd(ymd) {
  return moment.tz(ymd, 'YYYY-MM-DD', ZONA).endOf('day').toDate();
}

function ticketEsAltaSinPago(ticket) {
  if (!ticket) return false;
  const origen = String(ticket.origen || '').toLowerCase();
  const sinBoucher = !ticket.boucher;
  return ticket.estado === 'pendiente_aprobacion'
    && sinBoucher
    && (origen === 'alta_comanda' || origen === 'alta');
}

function ticketPuedeAprobarse(ticket) {
  return ticket && ticket.estado === 'pendiente_aprobacion' && !!ticket.boucher;
}

function ticketPuedeForzarPago(ticket) {
  return ticket && ticket.estado === 'pendiente_aprobacion' && esTicketComandaTipo(ticket);
}

function esTicketComandaTipo(ticket) {
  const t = String(ticket?.tipo || '').toLowerCase();
  return t === 'comanda_completa' || t === 'comanda' || t === 'pago_parcial' || t === '';
}

/**
 * Al cobrar el mozo (pago normal o PPA), el ticket de alta deja de mostrarse
 * en la tabla de cocina y se reemplaza por la solicitud real.
 */
async function desactivarTicketsAltaPendientes(comandaIds, motivo) {
  if (!Array.isArray(comandaIds) || comandaIds.length === 0) return { modifiedCount: 0 };
  const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
  return ticketAprobacionModel.updateMany(
    {
      comandas: { $in: comandaIds },
      estado: 'pendiente_aprobacion',
      origen: { $in: ['alta_comanda', 'alta'] },
      isActive: true,
      boucher: null,
    },
    {
      $set: {
        isActive: false,
        observaciones: motivo || 'Reemplazado por solicitud de cobro del mozo',
      },
    }
  );
}

/**
 * Si caja ya forzó el cobro y el mozo envía un PPA, el ticket forzado
 * adopta método / efectivo / vuelto de esa solicitud y deja de duplicarse.
 */
async function actualizarTicketsForzadosConPpaMozo(comandaIds, pago = {}) {
  if (!Array.isArray(comandaIds) || comandaIds.length === 0) return 0;
  const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
  const boucherModel = require('../database/models/boucher.model');
  const tickets = await ticketAprobacionModel.find({
    comandas: { $in: comandaIds },
    isActive: { $ne: false },
    $or: [{ pagoForzado: true }, { origen: 'forzado' }],
  });
  let n = 0;
  for (const t of tickets) {
    if (pago.metodoPago) t.metodoPago = pago.metodoPago;
    if (pago.montoRecibido != null) t.montoRecibido = pago.montoRecibido;
    if (pago.vuelto != null) t.vuelto = pago.vuelto;
    if (pago.platos) t.platos = pago.platos;
    if (pago.subtotal != null) t.subtotal = pago.subtotal;
    if (pago.igv != null) t.igv = pago.igv;
    if (pago.total != null) t.total = pago.total;
    t.observaciones = `${t.observaciones || ''} [Actualizado con PPA del mozo]`.trim();
    t.isActive = false;
    await t.save();
    if (t.boucher) {
      const set = {};
      if (pago.metodoPago) set.metodoPago = pago.metodoPago;
      if (pago.montoRecibido != null) set.montoRecibido = pago.montoRecibido;
      if (pago.vuelto != null) set.vuelto = pago.vuelto;
      if (Object.keys(set).length) {
        await boucherModel.updateOne({ _id: t.boucher }, { $set: set });
      }
    }
    n += 1;
  }
  return n;
}

/**
 * @param {Date|string} createdAt
 * @param {{ periodo: string, primerCierreHoyAt?: Date|string|null, desde?: string, hasta?: string }} opts
 */
function matchFechaRangoTicket(createdAt, opts = {}) {
  const periodo = String(opts.periodo || 'hoy').toLowerCase();
  if (periodo === 'todos') return true;
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;

  if (periodo === 'dia' || periodo === 'noche') {
    if (!opts.primerCierreHoyAt) return false;
    const corte = new Date(opts.primerCierreHoyAt).getTime();
    const ymd = limaYMD();
    if (t < limaDayStart(ymd).getTime() || t > limaDayEnd(ymd).getTime()) return false;
    if (periodo === 'dia') return t < corte;
    return t >= corte;
  }

  const ymd = limaYMD(createdAt);
  if (periodo === 'hoy') return ymd === limaYMD();
  if (periodo === 'ayer') {
    const ayer = moment.tz(ZONA).subtract(1, 'day').format('YYYY-MM-DD');
    return ymd === ayer;
  }
  const desde = opts.desde;
  const hasta = opts.hasta;
  if (!desde && !hasta) return true;
  if (desde && ymd < desde) return false;
  if (hasta && ymd > hasta) return false;
  return true;
}

module.exports = {
  ZONA,
  limaYMD,
  limaDayStart,
  limaDayEnd,
  ticketEsAltaSinPago,
  ticketPuedeAprobarse,
  ticketPuedeForzarPago,
  esTicketComandaTipo,
  desactivarTicketsAltaPendientes,
  actualizarTicketsForzadosConPpaMozo,
  matchFechaRangoTicket,
};
