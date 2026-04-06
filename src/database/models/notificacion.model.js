const mongoose = require('mongoose');

/**
 * Modelo de Notificaciones - Sistema de notificaciones del dashboard
 * 
 * Tipos de notificaciones:
 * - sistema: Alertas automáticas del sistema
 * - comanda: Eventos relacionados con comandas
 * - mesa: Eventos de mesas
 * - pago: Eventos de pagos/bouchers
 * - alerta: Alertas importantes (stock bajo, mesa sin liberar, etc.)
 * - auditoria: Eventos de auditoría para admins
 */
const notificacionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    enum: ['sistema', 'comanda', 'mesa', 'pago', 'alerta', 'auditoria'],
    default: 'sistema',
    index: true
  },
  titulo: {
    type: String,
    required: true,
    maxlength: 100
  },
  mensaje: {
    type: String,
    required: false,
    maxlength: 500
  },
  icono: {
    type: String,
    default: '🔔'
  },
  // Referencia a la entidad relacionada
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false,
    index: true
  },
  entidadTipo: {
    type: String,
    enum: ['comanda', 'mesa', 'plato', 'cliente', 'boucher', 'mozo', 'cierre_caja', null],
    default: null
  },
  // Usuario destinatario (null = broadcast a todos los admins)
  destinatario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: false,
    index: true
  },
  // Roles que pueden ver esta notificación
  rolesDestinatarios: [{
    type: String,
    enum: ['admin', 'supervisor', 'mozos', 'cocinero']
  }],
  leida: {
    type: Boolean,
    default: false,
    index: true
  },
  fechaLectura: {
    type: Date,
    default: null
  },
  // Acción al hacer clic
  accion: {
    tipo: {
      type: String,
      enum: ['navegar', 'modal', 'api', 'none'],
      default: 'none'
    },
    url: {
      type: String,
      default: null
    },
    datos: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  // Prioridad para ordenar
  prioridad: {
    type: Number,
    default: 0, // Mayor número = mayor prioridad
    min: 0,
    max: 10
  },
  // Auto-expiración
  expiraEn: {
    type: Date,
    default: null // Null = no expira
  },
  // Metadata adicional
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Quién generó la notificación
  generadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: false
  }
}, {
  timestamps: true,
  collection: 'notificaciones'
});

// Índices compuestos
notificacionSchema.index({ destinatario: 1, leida: 1, createdAt: -1 });
notificacionSchema.index({ rolesDestinatarios: 1, leida: 1, createdAt: -1 });
notificacionSchema.index({ tipo: 1, createdAt: -1 });
notificacionSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiraEn: { $ne: null } } });

// Método estático para crear notificación de comanda
notificacionSchema.statics.comandaCreada = function(comanda, mozo) {
  return this.create({
    tipo: 'comanda',
    titulo: `Nueva comanda #${comanda.numero || comanda.comandaNumber}`,
    mensaje: `Mesa ${comanda.mesa?.numero || comanda.mesa} - ${comanda.platos?.length || 0} platos`,
    icono: '📋',
    entidadId: comanda._id,
    entidadTipo: 'comanda',
    rolesDestinatarios: ['admin', 'supervisor'],
    accion: {
      tipo: 'navegar',
      url: `/comandas.html?id=${comanda._id}`
    },
    prioridad: 5,
    generadoPor: mozo?._id
  });
};

// Método estático para notificación de mesa
notificacionSchema.statics.mesaAlerta = function(mesa, tipoAlerta) {
  const alertas = {
    'sin_liberar': {
      titulo: `Mesa ${mesa.numero} sin liberar`,
      mensaje: 'Tiempo excedido sin liberar',
      icono: '🔴',
      prioridad: 8
    },
    'stock_bajo': {
      titulo: `Stock bajo en Mesa ${mesa.numero}`,
      mensaje: 'Verificar disponibilidad',
      icono: '🟡',
      prioridad: 6
    }
  };
  
  const alerta = alertas[tipoAlerta] || { titulo: 'Alerta de mesa', icono: '⚠️', prioridad: 5 };
  
  return this.create({
    tipo: 'alerta',
    ...alerta,
    entidadId: mesa._id,
    entidadTipo: 'mesa',
    rolesDestinatarios: ['admin', 'supervisor'],
    accion: {
      tipo: 'navegar',
      url: `/mesas.html?mesa=${mesa.numero}`
    }
  });
};

// Método estático para notificación de pago
notificacionSchema.statics.pagoProcesado = function(boucher, mozo) {
  return this.create({
    tipo: 'pago',
    titulo: `Pago procesado S/.${boucher.total}`,
    mensaje: `Mesa ${boucher.mesa?.numero || boucher.mesa} - ${boucher.metodoPago || 'Efectivo'}`,
    icono: '💳',
    entidadId: boucher._id,
    entidadTipo: 'boucher',
    rolesDestinatarios: ['admin', 'supervisor'],
    accion: {
      tipo: 'navegar',
      url: `/bouchers.html?id=${boucher._id}`
    },
    prioridad: 4,
    generadoPor: mozo?._id
  });
};

// Método estático para notificación de auditoría
notificacionSchema.statics.eventoAuditoria = function(auditoria) {
  const eventosIconos = {
    'comanda_eliminada': '🗑️',
    'ELIMINAR_ULTIMA_COMANDA': '🗑️',
    'ELIMINAR_TODAS_COMANDAS': '🗑️',
    'ELIMINAR_COMANDA_INDIVIDUAL': '🗑️',
    'ELIMINAR_PLATO_COMANDA': '🗑️',
    'PLATO_ANULADO_COCINA': '🚫',
    'COMANDA_ANULADA_COCINA': '🚫',
    'reversion_comanda': '↩️',
    'reversion_plato': '↩️'
  };
  
  return this.create({
    tipo: 'auditoria',
    titulo: auditoria.accion?.replace(/_/g, ' '),
    mensaje: auditoria.motivo || `Entidad: ${auditoria.entidadTipo}`,
    icono: eventosIconos[auditoria.accion] || '🔍',
    entidadId: auditoria.entidadId,
    entidadTipo: auditoria.entidadTipo,
    rolesDestinatarios: ['admin'],
    accion: {
      tipo: 'navegar',
      url: `/auditoria.html?id=${auditoria._id}`
    },
    prioridad: 7,
    generadoPor: auditoria.usuario
  });
};

const Notificacion = mongoose.model('Notificacion', notificacionSchema);

module.exports = Notificacion;
