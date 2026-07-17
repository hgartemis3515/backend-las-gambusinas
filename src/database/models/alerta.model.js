const mongoose = require('mongoose');

/**
 * Modelo Alerta — Avisos operativos con overlay forzado en apps y pantallas de cocina.
 *
 * Diferencia con `Mensaje`:
 *  - Las alertas son eventos puntuales con duración finita y overlay a pantalla completa,
 *    no burbujas de chat.
 *  - Pueden dirigirse a usuarios, roles, o a las pantallas de cocina de cocineras
 *    específicas (TVs/kiosk), incluyendo monitores que no tienen FAB de chat.
 *
 * Estados:
 *  - activa:    vigente (visible en destinos hasta expiraAt o ack)
 *  - expirada:  superó expiraAt
 *  - cancelada: el emisor la cerró manualmente
 *  - archivada: soft-delete para auditoría
 */
const alertaSchema = new mongoose.Schema({
  texto: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: true
  },
  creadoPorNombre: {
    type: String,
    default: '',
    trim: true
  },
  targeting: {
    // 'todos' (todos los usuarios + todas las pantallas activas) | 'seleccion'
    modo: {
      type: String,
      enum: ['todos', 'seleccion'],
      default: 'seleccion',
      required: true
    },
    todos: { type: Boolean, default: false },
    roles: [{ type: String }],
    usuarios: [{ type: mongoose.Schema.Types.ObjectId, ref: 'mozos' }],
    // IDs de cocineras: el service resuelve a PantallaCocina.cocineroId y emite
    // a rooms `cocinero-{id}` y `pantalla-{N}` asociadas.
    cocineras: [{ type: mongoose.Schema.Types.ObjectId, ref: 'mozos' }],
    // Números de pantalla directos (targeting fino sin pasar por cocinera).
    numerosPantalla: [{ type: Number, min: 1, max: 16 }]
  },
  estilo: {
    // Duración del overlay en ms. Default 15000.
    duracionMs: { type: Number, default: 15000, min: 1000, max: 120000 },
    // Hex o preset del catálogo.
    colorHex: { type: String, default: '#e74c3c', trim: true },
    // Identificador de asset de sonido (ver ALERTA_SONIDOS).
    sonidoClave: { type: String, default: 'sirena', trim: true },
    // Si true, no auto-cierra hasta ack o timeout máximo de seguridad.
    requiereAck: { type: Boolean, default: false }
  },
  // Prioridad alineada al sistema de mensajería (baja=2 … critica=10).
  prioridad: {
    type: Number,
    default: 9,
    min: 0,
    max: 10,
    index: true
  },
  prioridadCodigo: {
    type: String,
    enum: ['baja', 'normal', 'alta', 'urgente', 'critica'],
    default: 'urgente'
  },
  estado: {
    type: String,
    enum: ['activa', 'expirada', 'cancelada', 'archivada'],
    default: 'activa',
    index: true
  },
  emitidaAt: { type: Date, default: Date.now },
  expiraAt: {
    type: Date,
    default: () => new Date(Date.now() + 15000),
    index: true
  },
  canceladaAt: { type: Date, default: null },
  canceladaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', default: null },
  // Tracking de acks (quién cerró la alerta y cuándo).
  acks: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    numeroPantalla: { type: Number, default: null },
    en: { type: Date, default: Date.now }
  }],
  activo: { type: Boolean, default: true, index: true }
}, {
  timestamps: true,
  collection: 'alertas'
});

// Índice compuesto para listar activas por destinatario
alertaSchema.index({ estado: 1, expiraAt: 1 });
alertaSchema.index({ 'targeting.usuarios': 1, estado: 1 });
alertaSchema.index({ 'targeting.cocineras': 1, estado: 1 });
alertaSchema.index({ 'targeting.roles': 1, estado: 1 });

module.exports = mongoose.model('Alerta', alertaSchema);
