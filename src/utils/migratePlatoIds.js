/**
 * One-time: alinea ids de platos en MongoDB con los de data/platos.json por nombre.
 * Útil cuando platos se importaron antes con sequence y tienen ids 100+; el JSON tiene ids 1–N.
 * Uso: node src/utils/migratePlatoIds.js (desde Backend-LasGambusinas, con DBLOCAL en .env).
 * Tras ejecutar, verifica comandas: platoId debe seguir existiendo en platos.
 */
require('dotenv/config');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const DATA_DIR = path.join(__dirname, '../../data');
const PLATOS_JSON = path.join(DATA_DIR, 'platos.json');

async function run() {
    if (!process.env.DBLOCAL) {
        console.error('Falta DBLOCAL en .env');
        process.exit(1);
    }
    if (!fs.existsSync(PLATOS_JSON)) {
        console.error('No existe', PLATOS_JSON);
        process.exit(1);
    }
    let jsonData;
    try {
        jsonData = JSON.parse(fs.readFileSync(PLATOS_JSON, 'utf8'));
    } catch (e) {
        console.error('platos.json inválido:', e.message);
        process.exit(1);
    }
    if (!Array.isArray(jsonData)) {
        console.error('platos.json debe ser un array');
        process.exit(1);
    }

    await mongoose.connect(process.env.DBLOCAL);
    const plato = require('../database/models/plato.model');
    const { setPlatoSequence } = require('../repository/plato.repository');

    const byNombre = new Map();
    for (const p of jsonData) {
        const id = typeof p.id === 'number' && Number.isInteger(p.id) && p.id > 0 ? p.id : null;
        const nombre = (p.nombre && String(p.nombre).trim()) || '';
        if (id != null && nombre) byNombre.set(nombre.toLowerCase(), { id, nombre: nombre.trim() });
    }

    let updated = 0;
    let maxJsonId = 0;
    for (const [, { id, nombre }] of byNombre) {
        if (id > maxJsonId) maxJsonId = id;
        const doc = await plato.findOne({ nombre: { $regex: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
        if (!doc) continue;
        if (doc.id === id) continue;
        await plato.updateOne({ _id: doc._id }, { $set: { id } });
        updated++;
        console.log(`   ${nombre} → id ${doc.id} → ${id}`);
    }

    const nextSeq = maxJsonId + 1;
    await setPlatoSequence(nextSeq);
    console.log(`Migración lista: ${updated} platos actualizados, sequence next=${nextSeq}. Revisa comandas.platos.platoId.`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
