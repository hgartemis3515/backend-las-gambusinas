/**
 * Script de migración: asigna tipo y categoría a platos existentes que no los tengan.
 * Uso: node src/utils/migratePlatosTipos.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const plato = require('../database/models/plato.model');

const TIPOS_MENU = plato.TIPOS_MENU || ['platos-desayuno', 'plato-carta normal'];

function inferirTipoDesdeNombre(nombre) {
    if (!nombre || typeof nombre !== 'string') return 'plato-carta normal';
    const n = nombre.toLowerCase();
    if (/desayuno|tamal|pan\s|huevo|sándwich|sandwich|jamón|tostada|avena|café|jugo|infusión/i.test(n)) return 'platos-desayuno';
    return 'plato-carta normal';
}

async function run() {
    await mongoose.connect(process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas');
    console.log('Conectado a MongoDB');

    const docs = await plato.find({});
    let updated = 0;
    for (const d of docs) {
        let changed = false;
        let tipo = d.tipo;
        let categoria = d.categoria;
        if (!tipo || !TIPOS_MENU.includes(tipo)) {
            tipo = inferirTipoDesdeNombre(d.nombre);
            changed = true;
        }
        if (!categoria || String(categoria).trim() === '') {
            categoria = 'General';
            changed = true;
        }
        if (changed) {
            await plato.updateOne({ _id: d._id }, { $set: { tipo, categoria } });
            updated++;
            console.log(`Actualizado plato id=${d.id} nombre="${d.nombre}" -> tipo=${tipo}, categoria=${categoria}`);
        }
    }
    console.log(`Migración finalizada: ${updated} platos actualizados de ${docs.length} total.`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
