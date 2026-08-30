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
      'PLATO_ANULADO_COCINA',
      'COMANDA_ANULADA_COCINA',
      'INTENTO_ANULACION_COMANDA_PAGADA',
      'INTENTO_ANULACION_PLATO_ENTREGADO',
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
      'reversion_comanda',
      'reversion_plato',
      'PLATO_DEJADO_COCINA',
      'COMANDA_ENVIADA_APROBACION',
      'COMANDA_APROBADA_COCINA',
      'COMANDA_REPORTADA_COCINA',
      'PPA_REPORTADO_COCINA',
      'MESA_ESTADO_REPORTADO',
      // Cierre de caja — verificación de tickets
      'TICKET_VERIFICADO_CIERRE',
      'TICKETS_VERIFICADOS_CIERRE_MASIVO',
      'CIERRE_CAJA_EJECUTADO',
      'CIERRE_CAJA_REVERTIDO',
      // Solicitar Orden (Panel Gestión / KDS supervisor)
      'SOLICITUD_ORDEN_APROBADA',
      'SOLICITUD_ORDEN_RECHAZADA',
      // Crear comanda desde dashboard — omitir pago (auto-pagado al entregar)
      'COMANDA_OMITIR_PAGO_AUTO_PAGADO',
      'COMANDA_OMITIR_PAGO_ACTIVADO',
      'RESERVA_ACTIVADA_ANTICIPADA'
    ],
    index: true
  },
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true
  },
  entidadTipo: {
    type: String,
    required: true,
    enum: ['comanda', 'plato', 'mesa', 'mozo', 'cliente', 'pago', 'cierre_caja', 'ticket_verificacion'],
    index: true
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: false,
    index: true
  },
  // Nombre legible del usuario (snapshot para no depender del populate)
  usuarioNombre: {
    type: String,
    default: null
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

