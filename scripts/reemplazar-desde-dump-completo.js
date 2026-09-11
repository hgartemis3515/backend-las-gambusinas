'use strict';

/**
 * Copia DATA COMPLETA → data/*.json (hex/ISO/números) y reemplaza
 * todas las colecciones del dump en MongoDB local.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { EJSON } = require('bson');

const SRC = process.argv[2] || 'C:\\Users\\hgartemis\\Documents\\DATA COMPLETA';
const DATA = path.join(__dirname, '..', 'data');
const CHUNK = 150;

function toPlain(value) {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toPlain);
  const t = value._bsontype;
  if (t === 'ObjectId') return String(value);
  if (t === 'Int32' || t === 'Double') return value.valueOf();
  if (t === 'Long') {
    const n = typeof value.toNumber === 'function' ? value.toNumber() : Number(value);
    return Number.isSafeInteger(n) ? n : String(value);
  }
  if (t === 'Decimal128' || t === 'UUID') return String(value);
  if (t === 'Binary') return typeof value.toString === 'function' ? value.toString('base64') : value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    const p = toPlain(v);
    if (p !== undefined) out[k] = p;
  }
  return out;
}

async function insertAll(col, docs) {
  if (!docs.length) return 0;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const r = await col.insertMany(chunk, { ordered: false });
    inserted += r.insertedCount;
  }
  return inserted;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    throw new Error('No existe la carpeta: ' + SRC);
  }
  const manifestPath = path.join(SRC, '_manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';

  fs.mkdirSync(DATA, { recursive: true });
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  console.log('Origen:', SRC);
  console.log('Mongo:', uri);
  console.log('Colecciones:', manifest.collections.length);

  let totalIns = 0;
  for (const entry of manifest.collections) {
    const srcFile = path.join(SRC, entry.file);
    if (!fs.existsSync(srcFile)) throw new Error('Falta archivo: ' + srcFile);

    const docs = EJSON.parse(fs.readFileSync(srcFile, 'utf8'));
    if (!Array.isArray(docs)) throw new Error(entry.file + ' no es un array');

    const col = db.collection(entry.name);
    const del = await col.deleteMany({});
    const inserted = await insertAll(col, docs);
    totalIns += inserted;

    const plain = docs.map(toPlain);
    const out = JSON.stringify(plain);
    fs.writeFileSync(path.join(DATA, entry.file), out, 'utf8');
    if (entry.name === 'auditoria_acciones') {
      fs.writeFileSync(path.join(DATA, 'auditoria.json'), out, 'utf8');
    }

    const ok = inserted === docs.length ? 'ok' : 'WARN count';
    console.log(
      `${entry.name}: json=${docs.length} del=${del.deletedCount} ins=${inserted} ${ok}`
    );
  }

  fs.copyFileSync(manifestPath, path.join(DATA, '_manifest.json'));

  const nPlatos = await db.collection('platos').countDocuments();
  const nCmds = await db.collection('comandas').countDocuments();
  const nComp = await db.collection('platos').countDocuments({
    complementos: { $exists: true, $not: { $size: 0 } },
  });
  const seqs = await db.collection('counters').find({}).project({ id: 1, seq: 1, _id: 0 }).toArray();
  console.log('---');
  console.log('platos', nPlatos, 'comandas', nCmds, 'platos+complementos', nComp);
  console.log('insertados total', totalIns, 'manifest', manifest.totalDocuments);
  console.log('counters', JSON.stringify(seqs));

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
