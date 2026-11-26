const mongoose = require('mongoose');

const inventarioRubroSchema = new mongoose.Schema({
    clave: { type: String, required: true, unique: true },
    crudo: { type: Number, default: 0, min: 0 },
    cocido: { type: Number, default: 0, min: 0 },
    tieneCocido: { type: Boolean },
    soloCocido: { type: Boolean },
    cambiosSoloCocido: { type: [{ _id: false, fecha: Date, soloCocido: Boolean }], default: undefined },
    reservaClave: { type: String, default: '' },
    stockMinimo: { type: Number, default: 0, min: 0 }
}, { collection: 'inventario_rubros' });

module.exports = mongoose.model('inventario_rubros', inventarioRubroSchema);
