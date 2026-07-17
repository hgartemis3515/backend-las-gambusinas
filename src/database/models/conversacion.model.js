const mongoose = require('mongoose');

/**
 * Modelo Conversacion — Mensajería interna (chat tipo messenger/empresa)
 *
 * Tipos:
 *  - directo: DM 1:1 entre dos usuarios
 *  - canal:   grupo/equipo abierto por rol (p.ej. #cocina, #sala, #caja, #general)
 *  - anuncio: broadcast con prioridad mínima, emitido por admin/supervisor
 *  - grupo:   grupo ad-hoc con miembros explícitos (no por rol)
 *
 * Participantes pueden ser explícitos (DM/grupo/anuncios dirigidos) o implícitos
 * vía rolesPermitidos (canales abiertos por rol).
 */
const conversacionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    required: true,
    enum: ['directo', 'canal', 'anuncio', 'grupo'],
    default: 'directo',
    index: true
  },
  titulo: {
    type: String,
    default: '',
    trim: true
  },
  // Solo para tipo 'grupo': título visible elegido por el creador.
  nombreGrupo: {
    type: String,
    default: '',
    trim: true,
    maxlength: 80
  },
  // Solo para tipo 'grupo': descripción opcional.
  descripcionGrupo: {
    type: String,
    default: '',
    trim: true,
    maxlength: 240
  },
  participantes: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos', required: true },
    rolSnapshot: { type: String, default: '' },
    ultimoLeidoAt: { type: Date, default: null },
    noLeidos: { type: Number, default: 0, min: 0 },
    silenciado: { type: Boolean, default: false },
    pineado: { type: Boolean, default: false },
    pineadoEn: { type: Date, default: null },
    archivado: { type: Boolean, default: false },
    unidoEn: { type: Date, default: Date.now }
  }],
  anclados: [{
    mensajeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Mensaje' },
    ancladoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'mozos' },
    ancladoEn: { type: Date, default: Date.now }
  }],
  // Canales abiertos por rol: si se setea, cualquier usuario con rol incluido
  // puede leer/escribir sin estar listado en participantes.
  rolesPermitidos: [{ type: String }],
  creadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos'
  },
  prioridadMinima: {
    type: Number,
    default: 0,
    min: 0,
    max: 10
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
  ultimoMensajeAt: {
    type: Date,
    default: Date.now
  },
  ultimoMensajePreview: {
    type: String,
    default: '',
    maxlength: 200
  },
  ultimoMensajeRemitente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos'
  },
  activo: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'conversaciones'
});

conversacionSchema.index({ 'participantes.usuario': 1, ultimoMensajeAt: -1 });
conversacionSchema.index({ tipo: 1, activo: 1, ultimoMensajeAt: -1 });
conversacionSchema.index({ rolesPermitidos: 1 });

const Conversacion = mongoose.model('Conversacion', conversacionSchema);

module.exports = Conversacion;