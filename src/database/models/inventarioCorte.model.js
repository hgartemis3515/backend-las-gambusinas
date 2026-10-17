const mongoose = require('mongoose');

const inventarioCorteSchema = new mongoose.Schema({
    clave: { type: String, default: 'inventario', unique: true },
    desde: { type: Date, required: true }
}, { collection: 'inventario_corte' });

module.exports = mongoose.model('inventario_corte', inventarioCorteSchema);
