'use strict';

const mongoose = require('mongoose');
const { ymdOperativo, boundsDiaOperativo } = require('./diaOperativoRestaurante');
const { seqDeResultado } = require('./numeroComandaDia');

/** Contador propio. La clave es el día operativo YYYY-MM-DD (04:00–04:00). */
const COLECCION = 'ticket_cliente_counters';

function comandaRequiereTicketCliente(doc) {
  if (!doc) return false;
  if (doc.sinMesa === true) return true;
  const platos = doc.platos || [];
  return platos.some((p) => {
    const t = p?.tipoServicio;
    return t === 'para_llevar' || t === 'extra_llevar';
  });
}

async function siguienteNumeroTicketCliente(dia) {
  const col = mongoose.connection.collection(COLECCION);
  const raw = await col.findOneAndUpdate(
    { _id: String(dia) },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = seqDeResultado(raw);
  if (seq == null) {
    const err = new Error('No se pudo asignar el ticket de cliente');
    err.status = 500;
    throw err;
  }
  return seq;
}

async function fijarContadorTicketCliente(dia, seq) {
  const col = mongoose.connection.collection(COLECCION);
  const n = Math.max(0, Number(seq) || 0);
  await col.updateOne(
    { _id: String(dia) },
    { $max: { seq: n } },
    { upsert: true }
  );
}

/** Siempre asigna número si la comanda es para llevar / sin mesa. El nombre solo cambia la vista. */
async function asignarTicketClienteEnDoc(doc) {
  if (!doc || doc.numeroTicketCliente != null) return doc?.numeroTicketCliente ?? null;
  if (!comandaRequiereTicketCliente(doc)) return null;
  const dia = doc.diaOperativo || ymdOperativo(doc.createdAt || new Date());
  doc.numeroTicketCliente = await siguienteNumeroTicketCliente(dia);
  return doc.numeroTicketCliente;
}

/**
 * Numera comandas para llevar / sin mesa del día operativo actual que quedaron sin ticket.
 */
async function backfillNumeroTicketClienteHoy() {
  const Comanda = require('../database/models/comanda.model');
  const dia = ymdOperativo(new Date());
  const { inicio, fin } = boundsDiaOperativo(dia);
  const filtro = {
    numeroTicketCliente: null,
    createdAt: { $gte: inicio, $lte: fin },
    $or: [
      { sinMesa: true },
      { 'platos.tipoServicio': { $in: ['para_llevar', 'extra_llevar'] } },
    ],
  };
  const docs = await Comanda.find(filtro)
    .select('_id createdAt comandaNumber')
    .sort({ createdAt: 1, comandaNumber: 1 })
    .lean();
  if (!docs.length) return { asignadas: 0, dias: 0 };

  const ya = await Comanda.find({
    numeroTicketCliente: { $ne: null },
    createdAt: { $gte: inicio, $lte: fin },
  }).select('numeroTicketCliente').lean();

  const usados = new Set();
  for (const d of ya) {
    const n = Number(d.numeroTicketCliente);
    if (n > 0) usados.add(n);
  }

  let cursor = 1;
  const ops = [];
  for (const d of docs) {
    while (usados.has(cursor)) cursor += 1;
    usados.add(cursor);
    ops.push({
      updateOne: {
        filter: { _id: d._id, numeroTicketCliente: null },
        update: { $set: { numeroTicketCliente: cursor } },
      },
    });
    cursor += 1;
  }

  let asignadas = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const res = await Comanda.bulkWrite(ops.slice(i, i + 400), { ordered: false });
    asignadas += res.modifiedCount || 0;
  }

  let max = 0;
  for (const n of usados) if (n > max) max = n;
  if (max > 0) await fijarContadorTicketCliente(dia, max);

  return { asignadas, dias: 1 };
}

module.exports = {
  comandaRequiereTicketCliente,
  siguienteNumeroTicketCliente,
  asignarTicketClienteEnDoc,
  backfillNumeroTicketClienteHoy,
  fijarContadorTicketCliente,
};
