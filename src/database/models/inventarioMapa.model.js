const mongoose = require('mongoose');

const inventarioMapaSchema = new mongoose.Schema({
    clave: { type: String, required: true, unique: true },
    mapas: { type: Array, default: [] },
    relaciones: { type: Array, default: [] },
    quitadas: { type: Array, default: [] },
    bloqueo: { type: mongoose.Schema.Types.Mixed, default: null }
}, { collection: 'inventario_mapas' });

module.exports = mongoose.model('inventario_mapas', inventarioMapaSchema);
