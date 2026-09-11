'use strict';

/**
 * Escribe el catálogo de platos.html desde Mongo → data/*.json
 * (platos, guarniciones/plantilla, categorías, tipos, asignación).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { exportarCatalogoCartaAJson } = require('../src/utils/catalogoCartaPersistencia');

async function main() {
  const uri = process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas';
  await mongoose.connect(uri);
  const counts = await exportarCatalogoCartaAJson(null, { inmediato: true });
  console.log(counts);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
