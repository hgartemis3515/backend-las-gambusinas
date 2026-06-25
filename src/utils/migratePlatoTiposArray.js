/**
 * Script de migración: pobla el campo `tipos` (array) a partir del legacy `tipo` (string)
 * para todos los platos existentes. Un plato puede pertenecer a 1 o más tipos de menú.
 *
 * Uso: node src/utils/migratePlatoTiposArray.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const plato = require('../database/models/plato.model');

const TIPOS_MENU = plato.TIPOS_MENU || ['platos-desayuno', 'plato-carta normal'];

function normalizarSlug(t) {
    if (!t) return null;
    let s = String(t).trim().toLowerCase();
    if (s === 'desayuno') return 'platos-desayuno';
    if (s === 'carta') return 'plato-carta normal';
    return s;
}

async function run() {
    await mongoose.connect(process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas');
    console.log('Conectado a MongoDB');

    const docs = await plato.find({});
    let updated = 0;
    let skipped = 0;

    for (const d of docs) {
        const tipoLegacy = normalizarSlug(d.tipo) || 'plato-carta normal';
        let tiposActuales = Array.isArray(d.tipos) ? d.tipos.map(normalizarSlug).filter(Boolean) : [];

        // Si el array tipos está vacío, inicializarlo con [tipoLegacy]
        if (tiposActuales.length === 0) {
            tiposActuales = [tipoLegacy];
        } else if (!tiposActuales.includes(tipoLegacy) && d.tipo) {
            // Asegurar que `tipo` legacy esté reflejado en `tipos`
            tiposActuales = [tipoLegacy, ...tiposActuales];
        }

        // Sincronizar `tipo` legacy con el primer elemento de `tipos`
        const nuevoTipoLegacy = tiposActuales[0];

        const cambioTipos = JSON.stringify(d.tipos || []) !== JSON.stringify(tiposActuales);
        const cambioTipo = String(d.tipo || '') !== String(nuevoTipoLegacy);

        if (cambioTipos || cambioTipo) {
            await plato.updateOne(
                { _id: d._id },
                { $set: { tipos: tiposActuales, tipo: nuevoTipoLegacy } }
            );
            updated++;
            console.log(`Migrado plato id=${d.id} nombre="${d.nombre}" -> tipo=${nuevoTipoLegacy}, tipos=[${tiposActuales.join(', ')}]`);
        } else {
            skipped++;
        }
    }

    console.log(`\nMigración completada: ${updated} platos actualizados, ${skipped} ya estaban correctos.`);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(err => {
    console.error('Error en migración:', err);
    process.exit(1);
});