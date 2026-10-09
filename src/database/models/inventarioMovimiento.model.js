const mongoose = require('mongoose');

const inventarioMovimientoSchema = new mongoose.Schema({
    plato: { type: mongoose.Schema.Types.ObjectId, ref: 'platos', default: null },
    platoId: { type: Number, default: 0 },
    rubro: { type: String, default: '', trim: true },
    nombre: { type: String, required: true, trim: true },
    tipoProducto: { type: String, required: true, enum: ['crudo', 'cocido'] },
    clase: { type: String, required: true, enum: ['ingreso', 'egreso', 'regulacion'] },
    cantidad: { type: Number, required: true },
    motivo: { type: String, required: true, trim: true, maxlength: 200 },
    comanda: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda', default: null },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
    fecha: { type: Date, required: true, default: Date.now }
}, { collection: 'inventario_movimientos' });

inventarioMovimientoSchema.index({ plato: 1, tipoProducto: 1, fecha: -1 });
inventarioMovimientoSchema.index({ rubro: 1, tipoProducto: 1, fecha: -1 });

module.exports = mongoose.model('inventario_movimientos', inventarioMovimientoSchema);
