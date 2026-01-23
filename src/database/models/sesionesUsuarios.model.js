const mongoose = require('mongoose');

/**
 * Modelo de Sesiones de Usuarios - Rastrea quién está conectado y qué está haciendo
 * Útil para auditoría y debugging en tiempo real
 */
const sesionSchema = new mongoose.Schema({
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: true,
    index: true
  },
  deviceId: {
    type: String,
    required: false,
    index: true
  },
  ip: {
    type: String,
    default: null
  },
  conectadoDesde: {
    type: Date,
    default: Date.now,
    index: true
  },
  ultimaAccion: {
    type: Date,
    default: Date.now
  },
  mesasActivas: {
    type: [String], // Array de IDs de mesas en formato "mesa-5", "mesa-7"
    default: []
  },
  comandasActivas: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Comanda',
    default: []
  },
  estado: {
    type: String,
    enum: ['activa', 'inactiva', 'desconectada'],
    default: 'activa',
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {} // Información adicional del dispositivo, app version, etc.
  }
}, {
  timestamps: true,
  collection: 'sesiones_usuarios'
});

// Índices
sesionSchema.index({ usuario: 1, estado: 1 });
sesionSchema.index({ conectadoDesde: -1 });
sesionSchema.index({ ultimaAccion: -1 });

// Método para actualizar última acción
sesionSchema.methods.actualizarUltimaAccion = function() {
  this.ultimaAccion = new Date();
  return this.save();
};

// Método para agregar mesa activa
sesionSchema.methods.agregarMesaActiva = function(mesaId) {
  const mesaKey = `mesa-${mesaId}`;
  if (!this.mesasActivas.includes(mesaKey)) {
    this.mesasActivas.push(mesaKey);
  }
  this.ultimaAccion = new Date();
  return this.save();
};

// Método para remover mesa activa
sesionSchema.methods.removerMesaActiva = function(mesaId) {
  const mesaKey = `mesa-${mesaId}`;
  this.mesasActivas = this.mesasActivas.filter(m => m !== mesaKey);
  this.ultimaAccion = new Date();
  return this.save();
};

const SesionesUsuarios = mongoose.model('SesionesUsuarios', sesionSchema);

module.exports = SesionesUsuarios;

