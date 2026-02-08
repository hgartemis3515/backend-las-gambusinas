const mongoose = require('mongoose');

/**
 * Modelo de Auditoría Global - Registra TODAS las acciones del sistema
 * Inspirado en Toast POS, Lightspeed, Square Restaurant
 */
const auditoriaSchema = new mongoose.Schema({
  accion: {
    type: String,
    required: true,
    enum: [
      'comanda_creada',
      'comanda_eliminada',
      'ELIMINAR_ULTIMA_COMANDA',
      'ELIMINAR_TODAS_COMANDAS',
      'ELIMINAR_COMANDA_INDIVIDUAL',
      'ELIMINAR_PLATO_COMANDA',
      'ELIMINAR_PLATO_RECOGER',
      'comanda_editada',
      'comanda_status_cambiado',
      'plato_agregado',
      'plato_modificado',
      'plato_eliminado',
      'mesa_modificada',
      'mesa_estado_cambiado',
      'usuario_autenticado',
      'usuario_desconectado',
      'pago_procesado',
      'reversion_comanda'
    ],
    index: true
  },
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },
  entidadTipo: {
    type: String,
    required: true,
    enum: ['comanda', 'plato', 'mesa', 'mozo', 'cliente', 'pago'],
    index: true
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: false,
    index: true
  },
  datosAntes: {
    type: mongoose.Schema.Types.Mixed,
    default: null // Snapshot del estado anterior
  },
  datosDespues: {
    type: mongoose.Schema.Types.Mixed,
    default: null // Snapshot del estado nuevo
  },
  motivo: {
    type: String,
    default: null // Motivo de la acción (especialmente para eliminaciones)
  },
  ip: {
    type: String,
    default: null
  },
  deviceId: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {} // Información adicional (mesa, comandaNumber, etc.)
  }
}, {
  timestamps: true, // Agrega createdAt y updatedAt automáticamente
  collection: 'auditoria_acciones'
});

// Índices compuestos para queries rápidas
auditoriaSchema.index({ entidadTipo: 1, entidadId: 1, timestamp: -1 });
auditoriaSchema.index({ usuario: 1, timestamp: -1 });
auditoriaSchema.index({ accion: 1, timestamp: -1 });
auditoriaSchema.index({ timestamp: -1 }); // Para reportes por fecha

const AuditoriaAcciones = mongoose.model('AuditoriaAcciones', auditoriaSchema);

module.exports = AuditoriaAcciones;

