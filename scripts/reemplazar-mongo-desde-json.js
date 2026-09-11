'use strict';

/**
 * Reemplaza colecciones de carta (platos + config de platos.html) y comandas
 * con data/*.json. Conserva _id. Backup previo en data/backups/.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const DATA = path.join(__dirname, '..', 'data');
const BACKUP = path.join(DATA, 'backups');
const OID_RE = /^[a-fA-F0-9]{24}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;

const OID_KEYS = new Set([
  '_id',
  'plato',
  'mozos',
  'mesas',
  'cliente',
  'pedido',
  'dividedFrom',
  'createdBy',
  'updatedBy',
  'eliminadaPor',
  'usuario',
  'cocineroId',
  'cocineroPrimarioId',
  'platoPrincipal',
  'eliminadoPor',
  'anuladoPor',
]);

function hydrate(value, key) {
  if (Array.isArray(value)) return value.map((v) => hydrate(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = hydrate(v, k);
    return out;
  }
  if (typeof value === 'string') {
    if (OID_KEYS.has(key) && OID_RE.test(value)) {
      return new mongoose.Types.ObjectId(value);
    }
    if (ISO_RE.test(value)) return new Date(value);
  }
  return value;
}

function loadJson(name) {
  const p = path.join(DATA, name);
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${name} no es un array`);
  return raw.map((doc) => hydrate(doc));
}

async function backupCollection(db, name) {
  fs.mkdirSync(BACKUP, { recursive: true });
  const docs = await db.collection(name).find({}).toArray();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUP, `${name}-${stamp}.json`);
  fs.writeFileSync(dest, JSON.stringify(docs, null, 2), 'utf8');
  return { dest, count: docs.length };
}

async function replaceCollection(db, name, docs) {
  const col = db.collection(name);
  const del = await col.deleteMany({});
  if (!docs.length) return { deleted: del.deletedCount, inserted: 0 };
  const ins = await col.insertMany(docs, { ordered: false });
  return { deleted: del.deletedCount, inserted: ins.insertedCount };
}

async function setLastUsedSeq(db, counterId, lastUsed) {
  if (!Number.isFinite(lastUsed) || lastUsed < 1) return;
  await db.collection('counters').updateOne(
    { id: counterId, reference_value: null },
    { $set: { seq: lastUsed } },
    { upsert: true }
  );
}

const CARTA = [
  { file: 'platos.json', collection: 'platos' },
  { file: 'complementos_plantilla.json', collection: 'complementos_plantilla' },
  { file: 'categorias_platos.json', collection: 'categorias_platos' },
  { file: 'tipos_plato.json', collection: 'tipos_plato' },
  { file: 'asignacion_automatica.json', collection: 'asignacion_automatica' },
  { file: 'asignacion_automatica_guarniciones.json', collection: 'asignacion_automatica_guarniciones' },
];

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  const platos = loadJson('platos.json');
  const comandas = loadJson('comandas.json');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  for (const { file, collection } of CARTA) {
    const docs = file === 'platos.json' ? platos : loadJson(file);
    const bak = await backupCollection(db, collection);
    const r = await replaceCollection(db, collection, docs);
    console.log(collection + ':', r, 'backup', bak.count, '→', bak.dest);
  }

  const bCmds = await backupCollection(db, 'comandas');
  const rCmds = await replaceCollection(db, 'comandas', comandas);
  console.log('comandas:', rCmds, 'backup', bCmds.count, '→', bCmds.dest);

  const maxPlatoId = platos.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
  const maxCmd = comandas.reduce((m, c) => Math.max(m, Number(c.comandaNumber) || 0), 0);

  const counters = await db.collection('counters').find({}).toArray();
  console.log('counters actuales:', JSON.stringify(counters, null, 2));

  // mongoose-sequence hace $inc sobre seq; dejar el último usado para que el próximo sea max+1
  await setLastUsedSeq(db, 'id', maxPlatoId);
  await setLastUsedSeq(db, 'comandaNumber', maxCmd);

  const nComp = await db.collection('platos').countDocuments({
    complementos: { $exists: true, $not: { $size: 0 } },
  });
  console.log('platos con complementos:', nComp);
  console.log('seq plato id =', maxPlatoId, 'seq comandaNumber =', maxCmd);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
