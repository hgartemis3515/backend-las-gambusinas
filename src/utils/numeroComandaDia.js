'use strict';

const mongoose = require('mongoose');
const { ymdOperativo } = require('./diaOperativoRestaurante');

/** Contador propio. No usa la colección `counters` de mongoose-sequence. */
const COLECCION = 'comanda_dia_counters';

function seqDeResultado(raw) {
  const seq = Number(raw?.seq ?? raw?.value?.seq);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

async function siguienteNumeroComandaDia(dia) {
  const col = mongoose.connection.collection(COLECCION);
  const raw = await col.findOneAndUpdate(
    { _id: String(dia) },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = seqDeResultado(raw);
  if (seq == null) {
    const err = new Error('No se pudo asignar el número de comanda del día');
    err.status = 500;
    throw err;
  }
  return seq;
}

async function fijarContadorDia(dia, seq) {
  const col = mongoose.connection.collection(COLECCION);
  const n = Math.max(0, Number(seq) || 0);
  await col.updateOne(
    { _id: String(dia) },
    { $max: { seq: n } },
    { upsert: true }
  );
}

/** Día operativo 04:00–04:00 Lima. No usa el corte de turno día/noche. */
async function asignarNumeroDiaEnDoc(doc) {
  const cuando = doc.createdAt || new Date();
  const dia = ymdOperativo(cuando);
  doc.diaOperativo = dia;
  doc.numeroComandaDia = await siguienteNumeroComandaDia(dia);
  return doc.numeroComandaDia;
}

/**
 * Numera comandas ya guardadas, en orden de creación dentro de cada día operativo.
 * El contador queda en el máximo de ese día para que la siguiente comanda siga la serie.
 */
async function backfillNumeroComandaDia() {
  const Comanda = require('../database/models/comanda.model');
  const filtro = { numeroComandaDia: null };
  const faltan = await Comanda.countDocuments(filtro);
  if (!faltan) return { asignadas: 0, dias: 0 };

  const docs = await Comanda.find(filtro)
    .select('_id createdAt comandaNumber')
    .sort({ createdAt: 1, comandaNumber: 1 })
    .lean();

  const usados = new Map();
  const ya = await Comanda.find({ numeroComandaDia: { $ne: null }, diaOperativo: { $ne: null } })
    .select('diaOperativo numeroComandaDia')
    .lean();
  for (const d of ya) {
    const dia = String(d.diaOperativo);
    if (!usados.has(dia)) usados.set(dia, new Set());
    usados.get(dia).add(Number(d.numeroComandaDia));
  }

  const grupos = new Map();
  for (const d of docs) {
    const dia = ymdOperativo(d.createdAt || new Date());
    if (!grupos.has(dia)) grupos.set(dia, []);
    grupos.get(dia).push(d);
  }

  const ops = [];
  for (const [dia, list] of grupos) {
    const set = usados.get(dia) || new Set();
    let cursor = 1;
    for (const d of list) {
      while (set.has(cursor)) cursor += 1;
      set.add(cursor);
      ops.push({
        updateOne: {
          filter: { _id: d._id, numeroComandaDia: null },
          update: { $set: { numeroComandaDia: cursor, diaOperativo: dia } }
        }
      });
      cursor += 1;
    }
    usados.set(dia, set);
  }

  let asignadas = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const res = await Comanda.bulkWrite(ops.slice(i, i + 400), { ordered: false });
    asignadas += res.modifiedCount || 0;
  }

  for (const [dia, set] of usados) {
    let max = 0;
    for (const n of set) if (n > max) max = n;
    if (max > 0) await fijarContadorDia(dia, max);
  }

  return { asignadas, dias: usados.size };
}

module.exports = {
  seqDeResultado,
  siguienteNumeroComandaDia,
  asignarNumeroDiaEnDoc,
  backfillNumeroComandaDia,
};
