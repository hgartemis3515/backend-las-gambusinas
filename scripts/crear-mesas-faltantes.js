'use strict';

/**
 * Crea mesas faltantes según la regla:
 *   1–25  → Salon
 *   26–100 → Patio
 *   resto (ya existentes 666/777/999) → VIP
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { syncJsonFile } = require('../src/utils/jsonSync');
require('../src/database/models/area.model');
const mesasModel = require('../src/database/models/mesas.model');
const Area = require('../src/database/models/area.model');

const DATA_COMPLETA = path.join(__dirname, '..', '..', 'DATA COMPLETA');

const AREA_FALLBACK = {
  salon: '69893b7c0fd73e9034928094',
  patio: '69860a2f536044c2446a7d8c',
  vip: '69ebd060ac26a089ac7e068c',
};

function claveAreaPorNumero(num) {
  const n = Number(num);
  if (n >= 1 && n <= 25) return 'salon';
  if (n >= 26 && n <= 100) return 'patio';
  return 'vip';
}

function normNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function numerosEsperados() {
  const out = [];
  for (let n = 1; n <= 25; n += 1) out.push(n);
  for (let n = 26; n <= 100; n += 1) out.push(n);
  return out;
}

function toEjsonMesa(doc) {
  const areaId = doc.area && (doc.area._id || doc.area);
  return {
    _id: { $oid: String(doc._id) },
    nummesa: { $numberInt: String(doc.nummesa) },
    isActive: doc.isActive !== false,
    estado: doc.estado || 'libre',
    area: { $oid: String(areaId) },
    esMesaPrincipal: doc.esMesaPrincipal !== false,
    mesaPrincipalId: doc.mesaPrincipalId ? { $oid: String(doc.mesaPrincipalId) } : null,
    mesasUnidas: Array.isArray(doc.mesasUnidas)
      ? doc.mesasUnidas.map((id) => ({ $oid: String(id) }))
      : [],
    fechaUnion: doc.fechaUnion || null,
    unidoPor: doc.unidoPor ? { $oid: String(doc.unidoPor) } : null,
    motivoUnion: doc.motivoUnion || null,
    nombreCombinado: doc.nombreCombinado || null,
    mapaConfig: {
      x: doc.mapaConfig && doc.mapaConfig.x != null ? { $numberInt: String(doc.mapaConfig.x) } : null,
      y: doc.mapaConfig && doc.mapaConfig.y != null ? { $numberInt: String(doc.mapaConfig.y) } : null,
      width: { $numberInt: String((doc.mapaConfig && doc.mapaConfig.width) || 80) },
      height: { $numberInt: String((doc.mapaConfig && doc.mapaConfig.height) || 80) },
      shape: (doc.mapaConfig && doc.mapaConfig.shape) || 'rect',
      visible: doc.mapaConfig && doc.mapaConfig.visible === false ? false : true,
    },
    mesasId: { $numberInt: String(doc.mesasId) },
    __v: { $numberInt: String(doc.__v || 0) },
  };
}

function actualizarCounterDataCompleta(seq) {
  const file = path.join(DATA_COMPLETA, 'counters.json');
  if (!fs.existsSync(file)) return { skipped: true };
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  const hit = list.find((c) => c.id === 'mesasId');
  if (hit && hit.seq) {
    hit.seq.$numberInt = String(seq);
  }
  fs.writeFileSync(file, JSON.stringify(list), 'utf8');
  return { seq };
}

async function main() {
  const uri = process.env.DBLOCAL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta DBLOCAL o MONGODB_URI en .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const areas = await Area.find({}).lean();
  const ids = { ...AREA_FALLBACK };
  for (const a of areas) {
    const n = normNombre(a.nombre);
    if (n === 'salon' || n.includes('salon')) ids.salon = String(a._id);
    else if (n === 'patio' || n.includes('patio') || n.includes('terraza')) ids.patio = String(a._id);
    else if (n === 'vip' || n.includes('vip')) ids.vip = String(a._id);
  }

  const existentes = await mesasModel.find({}).select('nummesa').lean();
  const usados = new Set(existentes.map((m) => Number(m.nummesa)));
  const faltantes = numerosEsperados().filter((n) => !usados.has(n));

  const creadas = [];
  for (const nummesa of faltantes) {
    const clave = claveAreaPorNumero(nummesa);
    const doc = await mesasModel.create({
      nummesa,
      isActive: true,
      estado: 'libre',
      area: ids[clave],
      esMesaPrincipal: true,
      mesaPrincipalId: null,
      mesasUnidas: [],
      fechaUnion: null,
      unidoPor: null,
      motivoUnion: null,
      nombreCombinado: null,
      mapaConfig: { x: null, y: null, width: 80, height: 80, shape: 'rect', visible: true },
    });
    creadas.push({ nummesa, mesasId: doc.mesasId, area: clave, _id: String(doc._id) });
  }

  const todas = await mesasModel.find({}).populate('area').sort({ nummesa: 1 });
  await syncJsonFile('mesas.json', todas);

  const lean = await mesasModel.find({}).sort({ nummesa: 1 }).lean();
  fs.writeFileSync(
    path.join(DATA_COMPLETA, 'mesas.json'),
    JSON.stringify(lean.map(toEjsonMesa)),
    'utf8'
  );

  const maxId = lean.reduce((acc, m) => Math.max(acc, Number(m.mesasId) || 0), 0);
  await mongoose.connection.collection('counters').updateOne(
    { id: 'mesasId', reference_value: null },
    { $set: { seq: maxId } }
  );
  actualizarCounterDataCompleta(maxId);

  const porArea = { Salon: [], Patio: [], VIP: [] };
  for (const m of lean) {
    const clave = claveAreaPorNumero(m.nummesa);
    const label = clave === 'salon' ? 'Salon' : clave === 'patio' ? 'Patio' : 'VIP';
    porArea[label].push(m.nummesa);
  }

  console.log('faltantes creadas', creadas.length, creadas.map((c) => c.nummesa));
  console.log('total mesas', lean.length, 'max mesasId', maxId);
  console.log('por area', {
    Salon: porArea.Salon.length,
    Patio: porArea.Patio.length,
    VIP: porArea.VIP.length,
  });

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
