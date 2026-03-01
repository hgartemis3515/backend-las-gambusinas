const mongoose = require('mongoose');

/**
 * Modelo de Historial de Comandas - Versiones completas de cada cambio
 * Optimizado para queries rápidas de historial
 */
const platoHistorialSchema = new mongoose.Schema({
  plato: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
  platoId: { type: Number },
  estado: { type: String },
  cantidad: { type: Number, default: 1 },
  nombre: { type: String }, // Snapshot del nombre al momento del cambio
  precio: { type: Number } // Snapshot del precio al momento del cambio
}, { _id: false });

const historialComandaSchema = new mongoose.Schema({
  comandaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comanda',
    required: true,
    index: true
  },
  version: {
    type: Number,
    required: true,
    default: 1
  },
  status: {
    type: String,
    enum: ['en_espera', 'recoger', 'entregado', 'pagado', 'cancelado'],
    required: false
  },
  platos: {
    type: [platoHistorialSchema],
    default: []
  },
  cantidades: {
    type: [Number],
    default: []
  },
  observaciones: {
    type: String,
    default: ''
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: false,
    default: null,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  accion: {
    type: String,
    required: true,
    enum: ['creada', 'editada', 'eliminada', 'status_cambiado', 'plato_agregado', 'plato_eliminado', 'plato_modificado'],
    index: true
  },
  motivo: {
    type: String,
    default: null
  },
  precioTotal: {
    type: Number,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'historial_comandas'
});

// Índices para queries rápidas
historialComandaSchema.index({ comandaId: 1, version: -1 });
historialComandaSchema.index({ comandaId: 1, timestamp: -1 });
historialComandaSchema.index({ usuario: 1, timestamp: -1 });
historialComandaSchema.index({ accion: 1, timestamp: -1 });

const HistorialComandas = mongoose.model('HistorialComandas', historialComandaSchema);

module.exports = HistorialComandas;

