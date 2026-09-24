/**
 * Helpers de ticket al crear comanda y filtro DIA/NOCHE (misma lógica que comandas.html).
 */
const moment = require('moment-timezone');
const { TZ: ZONA, ymdOperativo, boundsDiaOperativo } = require('./diaOperativoRestaurante');

function limaYMD(d) {
  return ymdOperativo(d || new Date());
}

function limaDayStart(ymd) {
  return boundsDiaOperativo(ymd).inicio;
}

function limaDayEnd(ymd) {
  return boundsDiaOperativo(ymd).fin;
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

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function idLinea(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

function claveLineaTicket(p) {
  const id = idLinea(p && p.platoLineaId);
  if (id) return `id:${id}`;
  const nombre = String((p && p.nombre) || '').trim().toLowerCase();
  const precio = round2(p && (p.precio != null ? p.precio : p.precioUnitario));
  const comanda = p && p.comandaNumber != null ? String(p.comandaNumber) : '';
  const comandaId = idLinea(p && p.comandaId);
  return `fb:${comandaId}|${comanda}|${nombre}|${precio}`;
}

/**
 * Quita del ticket de alta las unidades que entraron en un cobro parcial o PPA.
 * Si no queda nada, el alta se apaga. Si queda saldo, el ticket sigue visible.
 */
function recortarPlatosAlta(platosAlta, platosCobrados) {
  const bolsa = (platosCobrados || []).map((p) => ({
    clave: claveLineaTicket(p),
    cantidad: Math.max(0, Number(p && p.cantidad) || 1),
  })).filter((p) => p.cantidad > 0);

  let cubrioAlgo = false;
  const platos = [];
  for (const linea of platosAlta || []) {
    const clave = claveLineaTicket(linea);
    let queda = Math.max(0, Number(linea && linea.cantidad) || 1);
    const inicio = queda;
    for (const b of bolsa) {
      if (queda <= 0) break;
      if (b.clave !== clave || b.cantidad <= 0) continue;
      const n = Math.min(queda, b.cantidad);
      b.cantidad -= n;
      queda -= n;
    }
    if (queda < inicio) cubrioAlgo = true;
    if (queda <= 0) continue;
    const precio = Number(linea.precio) || 0;
    platos.push({ ...linea, cantidad: queda, subtotal: round2(precio * queda) });
  }
  return { platos, cubrioAlgo, vacio: platos.length === 0 };
}

function totalesRestanteAlta(platos, ticket) {
  const suma = round2((platos || []).reduce((s, p) => {
    const sub = Number(p.subtotal);
    if (Number.isFinite(sub) && sub > 0) return s + sub;
    return s + (Number(p.precio) || 0) * (Number(p.cantidad) || 1);
  }, 0));
  const subPrev = Number(ticket && ticket.subtotal) || 0;
  const igvPrev = Number(ticket && ticket.igv) || 0;
  const tasa = subPrev > 0 && igvPrev > 0 ? igvPrev / subPrev : 0;
  const igv = round2(suma * tasa);
  const descPrev = Number(ticket && ticket.montoDescuento) || 0;
  const sinPrev = Number(ticket && ticket.totalSinDescuento) || subPrev || suma;
  const desc = sinPrev > 0 && descPrev > 0 ? round2(descPrev * (suma / sinPrev)) : 0;
  const total = round2(Math.max(0, suma + igv - desc));
  return { subtotal: suma, igv, total, montoDescuento: desc, totalSinDescuento: round2(suma + igv) };
}

/**
 * Al cobrar el mozo (pago normal o PPA), el ticket de alta deja de mostrar
 * los platos de esa solicitud. Si la comanda aún tiene platos por cobrar,
 * el alta sigue en la tabla (imprimir y forzar cobro).
 * Sin platosCobrados, apaga el alta completo (cobro de toda la comanda).
 */
async function desactivarTicketsAltaPendientes(comandaIds, motivo, platosCobrados) {
  if (!Array.isArray(comandaIds) || comandaIds.length === 0) return { modifiedCount: 0, recortados: 0 };
  const ticketAprobacionModel = require('../database/models/ticketAprobacion.model');
  const filtro = {
    comandas: { $in: comandaIds },
    estado: 'pendiente_aprobacion',
    origen: { $in: ['alta_comanda', 'alta'] },
    isActive: true,
    boucher: null,
  };
  const hayDetalle = Array.isArray(platosCobrados) && platosCobrados.length > 0;
  if (!hayDetalle) {
    const res = await ticketAprobacionModel.updateMany(filtro, {
      $set: {
        isActive: false,
        observaciones: motivo || 'Reemplazado por solicitud de cobro del mozo',
      },
    });
    return { modifiedCount: res.modifiedCount || 0, recortados: 0 };
  }

  const tickets = await ticketAprobacionModel.find(filtro);
  let modifiedCount = 0;
  let recortados = 0;
  for (const t of tickets) {
    const plain = (t.platos || []).map((p) => (typeof p.toObject === 'function' ? p.toObject() : { ...p }));
    const recorte = recortarPlatosAlta(plain, platosCobrados);
    if (!recorte.cubrioAlgo) continue;
    if (recorte.vacio) {
      t.isActive = false;
      t.observaciones = motivo || 'Reemplazado por solicitud de cobro del mozo';
    } else {
      const tot = totalesRestanteAlta(recorte.platos, t);
      t.platos = recorte.platos;
      t.subtotal = tot.subtotal;
      t.igv = tot.igv;
      t.total = tot.total;
      t.totalSinDescuento = tot.totalSinDescuento;
      t.montoDescuento = tot.montoDescuento;
      t.isActive = true;
      t.markModified('platos');
      recortados += 1;
    }
    await t.save();
    modifiedCount += 1;
  }
  return { modifiedCount, recortados };
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
    const plain = (t.platos || []).map((p) => (typeof p.toObject === 'function' ? p.toObject() : { ...p }));
    const recorte = Array.isArray(pago.platos) && pago.platos.length
      ? recortarPlatosAlta(plain, pago.platos)
      : { platos: plain, cubrioAlgo: false, vacio: false };
    if (recorte.cubrioAlgo && !recorte.vacio && t.estado === 'pendiente_aprobacion') {
      const tot = totalesRestanteAlta(recorte.platos, t);
      t.platos = recorte.platos;
      t.subtotal = tot.subtotal;
      t.igv = tot.igv;
      t.total = tot.total;
      t.totalSinDescuento = tot.totalSinDescuento;
      t.montoDescuento = tot.montoDescuento;
      t.markModified('platos');
    } else if (!recorte.cubrioAlgo) {
      continue;
    } else {
      if (pago.platos) t.platos = pago.platos;
      if (pago.subtotal != null) t.subtotal = pago.subtotal;
      if (pago.igv != null) t.igv = pago.igv;
      if (pago.total != null) t.total = pago.total;
      t.isActive = false;
    }
    t.observaciones = `${t.observaciones || ''} [Actualizado con PPA del mozo]`.trim();
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
    const ayer = moment.tz(limaYMD(), 'YYYY-MM-DD', ZONA).subtract(1, 'day').format('YYYY-MM-DD');
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
  recortarPlatosAlta,
  totalesRestanteAlta,
  desactivarTicketsAltaPendientes,
  actualizarTicketsForzadosConPpaMozo,
  matchFechaRangoTicket,
};
