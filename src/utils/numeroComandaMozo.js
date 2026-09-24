'use strict';

const mongoose = require('mongoose');
const { ymdOperativo } = require('./diaOperativoRestaurante');
const { seqDeResultado } = require('./numeroComandaDia');

const COLECCION = 'comanda_mozo_counters';

function mozoIdDe(doc) {
  let m = doc?.mozos;
  if (m == null || m === '') return null;
  // Populate: { _id: ObjectId, ... }. ObjectId._id === ObjectId → no recursión.
  if (typeof m === 'object' && m._id != null && m._id !== m) {
    m = m._id;
  }
  if (typeof m === 'object' && typeof m.toString === 'function') {
    const s = String(m.toString());
    if (/^[a-f0-9]{24}$/i.test(s)) return s;
    return null;
  }
  const s = String(m).trim();
  return /^[a-f0-9]{24}$/i.test(s) ? s : null;
}

function claveContador(dia, mozoId) {
  return `${String(dia)}:${String(mozoId)}`;
}

async function siguienteNumeroComandaMozo(dia, mozoId) {
  const col = mongoose.connection.collection(COLECCION);
  const raw = await col.findOneAndUpdate(
    { _id: claveContador(dia, mozoId) },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = seqDeResultado(raw);
  if (seq == null) {
    const err = new Error('No se pudo asignar el número de comanda del mozo');
    err.status = 500;
    throw err;
  }
  return seq;
}

async function fijarContadorMozo(dia, mozoId, seq) {
  const col = mongoose.connection.collection(COLECCION);
  const n = Math.max(0, Number(seq) || 0);
  await col.updateOne(
    { _id: claveContador(dia, mozoId) },
    { $max: { seq: n } },
    { upsert: true }
  );
}

/** Solo si aún no tiene número y hay mozo. El día es el de creación. */
async function asignarNumeroMozoEnDoc(doc) {
  if (!doc || doc.numeroComandaMozo != null) return doc?.numeroComandaMozo ?? null;
  const mozoId = mozoIdDe(doc);
  if (!mozoId) return null;
  const dia = doc.diaOperativo || ymdOperativo(doc.createdAt || new Date());
  if (!doc.diaOperativo) doc.diaOperativo = dia;
  doc.numeroComandaMozo = await siguienteNumeroComandaMozo(dia, mozoId);
  return doc.numeroComandaMozo;
}

/**
 * Solo el día operativo de hoy. Las de días anteriores quedan sin número.
 * Orden de creación, para que el contador no vuelva a 1 a mitad del día.
 */
async function backfillNumeroComandaMozoHoy() {
  const Comanda = require('../database/models/comanda.model');
  const dia = ymdOperativo(new Date());
  const docs = await Comanda.find({
    diaOperativo: dia,
    numeroComandaMozo: null,
    mozos: { $ne: null },
  })
    .select('_id mozos createdAt comandaNumber')
    .sort({ createdAt: 1, comandaNumber: 1 })
    .lean();
  if (!docs.length) return { asignadas: 0, dia };

  const ya = await Comanda.find({
    diaOperativo: dia,
    numeroComandaMozo: { $ne: null },
  })
    .select('mozos numeroComandaMozo')
    .lean();
  const maxPorMozo = new Map();
  for (const d of ya) {
    const id = mozoIdDe(d);
    const n = Number(d.numeroComandaMozo) || 0;
    if (!id || n <= 0) continue;
    maxPorMozo.set(id, Math.max(maxPorMozo.get(id) || 0, n));
  }

  const porMozo = new Map();
  for (const d of docs) {
    const id = mozoIdDe(d);
    if (!id) continue;
    if (!porMozo.has(id)) porMozo.set(id, []);
    porMozo.get(id).push(d);
  }

  const ops = [];
  for (const [mozoId, list] of porMozo) {
    let cursor = (maxPorMozo.get(mozoId) || 0) + 1;
    for (const d of list) {
      ops.push({
        updateOne: {
          filter: { _id: d._id, numeroComandaMozo: null },
          update: { $set: { numeroComandaMozo: cursor } },
        },
      });
      cursor += 1;
    }
    maxPorMozo.set(mozoId, cursor - 1);
  }

  let asignadas = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const res = await Comanda.bulkWrite(ops.slice(i, i + 400), { ordered: false });
    asignadas += res.modifiedCount || 0;
  }
  for (const [mozoId, max] of maxPorMozo) {
    if (max > 0) await fijarContadorMozo(dia, mozoId, max);
  }
  return { asignadas, dia, mozos: maxPorMozo.size };
}

module.exports = {
  mozoIdDe,
  asignarNumeroMozoEnDoc,
  backfillNumeroComandaMozoHoy,
};
