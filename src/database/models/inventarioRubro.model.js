const mongoose = require('mongoose');

const inventarioRubroSchema = new mongoose.Schema({
    clave: { type: String, required: true, unique: true },
    crudo: { type: Number, default: 0, min: 0 },
    cocido: { type: Number, default: 0, min: 0 }
}, { collection: 'inventario_rubros' });

module.exports = mongoose.model('inventario_rubros', inventarioRubroSchema);
