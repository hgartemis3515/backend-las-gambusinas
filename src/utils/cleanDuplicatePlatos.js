/**
 * Script one-time: elimina platos duplicados por nombre (case-insensitive).
 * Por cada nombre repetido, conserva el documento con mayor id (más reciente) y elimina el resto.
 * Uso: node src/utils/cleanDuplicatePlatos.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const plato = require('../database/models/plato.model');

async function run() {
    await mongoose.connect(process.env.DBLOCAL || 'mongodb://localhost:27017/lasgambusinas');
    console.log('Conectado a MongoDB');

    // Agrupar por nombre normalizado (lowercase) para detectar duplicados
    const pipeline = [
        {
            $project: {
                key: { $toLower: { $ifNull: ['$nombre', ''] } },
                id: 1,
                _id: 1
            }
        },
        { $match: { key: { $ne: '' } } },
        {
            $group: {
                _id: '$key',
                count: { $sum: 1 },
                docs: { $push: { _id: '$_id', id: '$id' } }
            }
        },
        { $match: { count: { $gt: 1 } } }
    ];

    const duplicados = await plato.aggregate(pipeline);
    let eliminados = 0;

    for (const grupo of duplicados) {
        const docs = grupo.docs;
        docs.sort((a, b) => (b.id != null ? b.id : 0) - (a.id != null ? a.id : 0));
        const [mantener, ...resto] = docs;
        for (const d of resto) {
            await plato.deleteOne({ _id: d._id });
            eliminados++;
            console.log(`  Eliminado duplicado _id=${d._id} id=${d.id} (nombre="${grupo._id}")`);
        }
    }

    console.log(`Eliminados ${eliminados} duplicados (${duplicados.length} nombres con repeticiones).`);

    // Backfill nombreLower para documentos que no lo tengan
    const sinNombreLower = await plato.countDocuments({ $or: [ { nombreLower: { $exists: false } }, { nombreLower: '' } ] });
    if (sinNombreLower > 0) {
        console.log(`Actualizando nombreLower en ${sinNombreLower} documentos...`);
        const docs = await plato.find({ $or: [ { nombreLower: { $exists: false } }, { nombreLower: '' } ] }).select('_id nombre');
        for (const d of docs) {
            const lower = (d.nombre && String(d.nombre).trim().toLowerCase()) || '';
            if (lower) await plato.updateOne({ _id: d._id }, { $set: { nombreLower: lower } });
        }
    }

    await mongoose.disconnect();
    process.exit(0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
