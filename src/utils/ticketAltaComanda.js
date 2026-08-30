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
  matchFechaRangoTicket,
};
