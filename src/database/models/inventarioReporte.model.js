const mongoose = require('mongoose');

const transformacionReporteSchema = new mongoose.Schema({
    origen: { type: String, default: '' },
    destino: { type: String, default: '' },
    cantidad: { type: Number, default: 0 }
}, { _id: false });

const lineaReporteSchema = new mongoose.Schema({
    rubro: { type: String, default: '' },
    nombre: { type: String, default: '' },
    tipoProducto: { type: String, enum: ['crudo', 'cocido'], required: true },
    saldoAnterior: { type: Number, default: 0 },
    ingreso: { type: Number, default: 0 },
    salida: { type: Number, default: 0 },
    saldoFinal: { type: Number, default: 0 }
}, { _id: false });

/**
 * Reporte de un día de inventario (04:00 a 04:00, Lima).
 * Al cerrar, el saldo final de ese día es el saldo anterior del siguiente.
 */
const inventarioReporteSchema = new mongoose.Schema({
    fecha: { type: String, required: true, unique: true },
    cerradoEn: { type: Date, required: true },
    cerrado: { type: Boolean, default: false },
    lineas: { type: [lineaReporteSchema], default: [] },
    transformaciones: { type: [transformacionReporteSchema], default: [] }
}, { collection: 'inventario_reportes' });

module.exports = mongoose.model('InventarioReporte', inventarioReporteSchema);
