'use strict';

/**
 * Reasigna áreas de mesas:
 *   1–25  → Salon
 *   26–100 → Patio
 *   resto → VIP
 *
 * Actualiza data/mesas.json, DATA COMPLETA/mesas.json y MongoDB.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { syncJsonFile } = require('../src/utils/jsonSync');
require('../src/database/models/area.model');
const mesasModel = require('../src/database/models/mesas.model');
const Area = require('../src/database/models/area.model');

const DATA = path.join(__dirname, '..', 'data');
const DATA_COMPLETA = path.join(__dirname, '..', '..', 'DATA COMPLETA');

const AREA_IDS = {
  salon: '69893b7c0fd73e9034928094',
  patio: '69860a2f536044c2446a7d8c',
  vip: '69ebd060ac26a089ac7e068c',
};

const AREA_DOCS = {
  salon: {
    mapaPublicado: false,
    _id: AREA_IDS.salon,
    areaId: 3,
    nombre: 'Salon',
    descripcion: '',
    isActive: true,
    createdAt: '2026-02-09T01:42:20.015Z',
    updatedAt: '2026-04-24T20:19:31.839Z',
  },
  patio: {
    mapaPublicado: false,
    _id: AREA_IDS.patio,
    areaId: 1,
    nombre: 'Patio',
    descripcion: '',
    isActive: true,
    createdAt: '2026-02-06T15:35:11.104Z',
    updatedAt: '2026-02-08T02:54:46.470Z',
  },
  vip: {
    _id: AREA_IDS.vip,
    nombre: 'VIP',
    descripcion: '',
    isActive: true,
    mapaPublicado: false,
    createdAt: '2026-04-24T20:19:44.416Z',
    updatedAt: '2026-04-24T20:19:44.416Z',
    areaId: 7,
  },
};

function claveAreaPorNumero(num) {
  const n = Number(num);
  if (!Number.isFinite(n)) return 'vip';
  if (n >= 1 && n <= 25) return 'salon';
  if (n >= 26 && n <= 100) return 'patio';
  return 'vip';
}

function numDeMesa(m) {
  const n = m && m.nummesa;
  if (n && typeof n === 'object' && n.$numberInt != null) return parseInt(n.$numberInt, 10);
  return Number(n);
}

function oidDeArea(area) {
  if (!area) return '';
  if (typeof area === 'string') return area;
  if (area.$oid) return String(area.$oid);
  if (area._id && area._id.$oid) return String(area._id.$oid);
  if (area._id) return String(area._id);
  return String(area);
}

function reescribirDataMesas() {
  const file = path.join(DATA, 'mesas.json');
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  const counts = { salon: 0, patio: 0, vip: 0 };
  for (const m of list) {
    const clave = claveAreaPorNumero(numDeMesa(m));
    counts[clave] += 1;
    const dest = AREA_DOCS[clave];
    if (oidDeArea(m.area) !== dest._id) changed += 1;
    m.area = { ...dest };
  }
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
  return { file, total: list.length, changed, counts };
}

function reescribirDataCompleta() {
  const file = path.join(DATA_COMPLETA, 'mesas.json');
  if (!fs.existsSync(file)) return { file, skipped: true };
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  const counts = { salon: 0, patio: 0, vip: 0 };
  for (const m of list) {
    const clave = claveAreaPorNumero(numDeMesa(m));
    counts[clave] += 1;
    const destOid = AREA_IDS[clave];
    const actual = oidDeArea(m.area);
    if (actual !== destOid) changed += 1;
    if (m.area && typeof m.area === 'object' && m.area.$oid) {
      m.area.$oid = destOid;
    } else {
      m.area = { $oid: destOid };
    }
  }
  fs.writeFileSync(file, JSON.stringify(list), 'utf8');
  return { file, total: list.length, changed, counts };
}

function normNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function actualizarMongo() {
  const uri = process.env.DBLOCAL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta DBLOCAL o MONGODB_URI en .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const areas = await Area.find({}).lean();
  const ids = { ...AREA_IDS };
  for (const a of areas) {
    const n = normNombre(a.nombre);
    if (n === 'salon' || n.includes('salon')) ids.salon = String(a._id);
    else if (n === 'patio' || n.includes('patio') || n.includes('terraza')) ids.patio = String(a._id);
    else if (n === 'vip' || n.includes('vip')) ids.vip = String(a._id);
  }

  const todas = await mesasModel.find({});
  let changed = 0;
  const counts = { salon: 0, patio: 0, vip: 0 };
  for (const m of todas) {
    const clave = claveAreaPorNumero(m.nummesa);
    counts[clave] += 1;
    const dest = ids[clave];
    if (String(m.area) !== String(dest)) {
      m.area = dest;
      await m.save();
      changed += 1;
    }
  }

  const populated = await mesasModel.find({}).populate('area');
  await syncJsonFile('mesas.json', populated);
  await mongoose.disconnect();
  return { total: todas.length, changed, counts, ids };
}

async function main() {
  const dataCompleta = reescribirDataCompleta();
  console.log('DATA COMPLETA/mesas.json', dataCompleta);

  const dataLocal = reescribirDataMesas();
  console.log('data/mesas.json', dataLocal);

  try {
    const mongo = await actualizarMongo();
    console.log('MongoDB mesas', mongo);
  } catch (err) {
    console.error('MongoDB no se actualizó:', err.message);
    process.exitCode = 1;
  }
}

main();
