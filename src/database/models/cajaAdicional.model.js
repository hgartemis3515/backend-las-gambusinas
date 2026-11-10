const mongoose = require('mongoose');

/**
 * Caja extra del día operativo. La 1 es el Día (el primer cierre).
 * La 2, 3, … se habilitan desde Noche y, al cerrarse, el turno vuelve a Noche.
 */
const cajaAdicionalSchema = new mongoose.Schema({
  fechaOperativa: { type: String, required: true, index: true },
  numero: { type: Number, required: true },
  habilitadaAt: { type: Date, required: true },
  motivo: { type: String, default: '' },
  habilitadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
  habilitadaPorNombre: { type: String, default: '' },
  estado: { type: String, enum: ['abierta', 'cerrada'], default: 'abierta', index: true },
  cerradaAt: { type: Date, default: null },
  cierreId: { type: mongoose.Schema.Types.ObjectId, ref: 'CierreCajaRestaurante', default: null },
}, { timestamps: true });

cajaAdicionalSchema.index({ fechaOperativa: 1, numero: 1 }, { unique: true });

module.exports = mongoose.model('CajaAdicional', cajaAdicionalSchema);
