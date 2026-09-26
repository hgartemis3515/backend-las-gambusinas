'use strict';

/**
 * Parte el área Patio en tres:
 *   26–51  → PATIO 26-51
 *   52–76  → PATIO 52-76
 *   77–100 → PATIO 77-100
 * El área "Patio" queda inactiva.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { syncJsonFile } = require('../src/utils/jsonSync');
const Area = require('../src/database/models/area.model');
const mesasModel = require('../src/database/models/mesas.model');

const RANGOS = [
  { nombre: 'PATIO 26-51', min: 26, max: 51 },
  { nombre: 'PATIO 52-76', min: 52, max: 76 },
  { nombre: 'PATIO 77-100', min: 77, max: 100 },
];

function normNombre(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function rangoDeNumero(num) {
  const n = Number(num);
  return RANGOS.find((r) => n >= r.min && n <= r.max) || null;
}

async function asegurarArea(nombre) {
  const clave = normNombre(nombre);
  let area = await Area.findOne({ nombre: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  if (!area) {
    const todas = await Area.find({}).select('nombre').lean();
    area = todas.map((a) => a).find((a) => normNombre(a.nombre) === clave);
    if (area) area = await Area.findById(area._id);
  }
  if (!area) {
    area = await Area.create({
      nombre,
      descripcion: '',
      isActive: true,
      mapaPublicado: false,
    });
    console.log('área creada', nombre, String(area._id));
  } else if (area.isActive === false) {
    area.isActive = true;
    await area.save();
  }
  return area;
}

async function main() {
  const uri = process.env.DBLOCAL || process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta DBLOCAL o MONGODB_URI en .env');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  const areasNuevas = [];
  for (const r of RANGOS) {
    const area = await asegurarArea(r.nombre);
    areasNuevas.push({ ...r, id: area._id });
  }
  const porNombre = new Map(areasNuevas.map((a) => [normNombre(a.nombre), a.id]));

  const patioViejo = await Area.find({ isActive: { $ne: false } }).lean();
  for (const a of patioViejo) {
    if (normNombre(a.nombre) === 'patio') {
      await Area.updateOne({ _id: a._id }, { $set: { isActive: false, updatedAt: new Date() } });
      console.log('área Patio desactivada', String(a._id));
    }
  }

  const mesas = await mesasModel.find({});
  const counts = { 'PATIO 26-51': 0, 'PATIO 52-76': 0, 'PATIO 77-100': 0, fuera: 0 };
  let moved = 0;
  for (const m of mesas) {
    const rango = rangoDeNumero(m.nummesa);
    if (!rango) {
      counts.fuera += 1;
      continue;
    }
    counts[rango.nombre] += 1;
    const dest = porNombre.get(normNombre(rango.nombre));
    if (String(m.area) !== String(dest)) {
      m.area = dest;
      await m.save();
      moved += 1;
    }
  }

  const areas = await Area.find({}).sort({ nombre: 1 });
  const mesasPop = await mesasModel.find({}).populate('area');
  await syncJsonFile('areas.json', areas);
  await syncJsonFile('mesas.json', mesasPop);
  await mongoose.disconnect();
  console.log('mesas movidas', moved, 'conteo', counts);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
