const mongoose = require('mongoose');

const inventarioMapaSchema = new mongoose.Schema({
    clave: { type: String, required: true, unique: true },
    mapas: { type: Array, default: [] }
}, { collection: 'inventario_mapas' });

module.exports = mongoose.model('inventario_mapas', inventarioMapaSchema);
