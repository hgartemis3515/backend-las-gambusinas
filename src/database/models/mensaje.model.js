const mongoose = require('mongoose');

/**
 * Modelo Mensaje — Mensajería interna (texto/voz/sistema)
 *
 * prioridad (0–10, alineado con Notificacion.prioridad):
 *   baja=2, normal=5, alta=7, urgente=9, critica=10
 * prioridadCodigo debe coincidir con el número.
 */
const mensajeSchema = new mongoose.Schema({
  conversacionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversacion',
    required: true,
    index: true
  },
  remitenteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: true
  },
  tipoContenido: {
    type: String,
    enum: ['texto', 'voz', 'sistema'],
    default: 'texto'
  },
  texto: {
    type: String,
    maxlength: 2000,
    default: ''
  },
  prioridad: {
    type: Number,
    default: 5,
    min: 0,
    max: 10,
    index: true
  },
  prioridadCodigo: {
    type: String,
    enum: ['baja', 'normal', 'alta', 'urgente', 'critica'],
    default: 'normal'
  },
  audio: {
    url: { type: String, default: null },
    duracionMs: { type: Number, default: 0 },
    mimeType: { type: String, default: null },
    tamanioBytes: { type: Number, default: 0 }
  },
  leidoPor: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    at: { type: Date, default: Date.now }
  }],
  // Estado de entrega/lectura por destinatario (estilo Messenger):
  // 'enviado' (server persistió), 'entregado' (socket recibió), 'leido' (usuario abrió)
  entregadoA: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    at: { type: Date, default: Date.now }
  }],
  // Para DMs: estado agregado del mensaje (último estado conocido).
  estado: {
    type: String,
    enum: ['enviado', 'entregado', 'leido'],
    default: 'enviado',
    index: true
  },
  // Respuesta a un mensaje anterior (thread / quote).
  respuestaA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mensaje',
    default: null
  },
  entidadTipo: {
    type: String,
    enum: ['mesa', 'comanda', 'plato', 'cliente', null],
    default: null
  },
  entidadId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  eliminado: {
    type: Boolean,
    default: false
  },
  editadoAt: {
    type: Date,
    default: null
  },
  // Anuncios: roles destino explícitos (si la conversacion es tipo anuncio).
  rolesDestinatarios: [{ type: String }]
}, {
  timestamps: true,
  collection: 'mensajes'
});

mensajeSchema.index({ conversacionId: 1, createdAt: -1 });
mensajeSchema.index({ prioridad: 1, createdAt: -1 });

const Mensaje = mongoose.model('Mensaje', mensajeSchema);

module.exports = Mensaje;