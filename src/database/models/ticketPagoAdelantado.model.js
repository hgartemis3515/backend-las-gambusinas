const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * Modelo TicketPagoAdelantado (TPA)
 * Representa un ticket de pago adelantado que cocina debe aprobar
 * antes de que los platos para llevar entren al flujo KDS.
 */
const ticketPagoAdelantadoSchema = new mongoose.Schema({
  ticketNumber: {
    type: Number,
  },
  estado: {
    type: String,
    enum: ['pendiente_aprobacion', 'aprobado', 'rechazado'],
    default: 'pendiente_aprobacion',
    index: true,
  },
  // Referencia a comandas incluidas en el ticket
  comandas: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comanda',
  }],
  comandasNumbers: [{
    type: Number,
  }],
  // Mesa y mozo
  mesa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mesas',
    required: true,
  },
  numMesa: {
    type: Number,
    required: true,
  },
  mozo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    required: true,
  },
  nombreMozo: {
    type: String,
    required: true,
  },
  mozoNombre: {
    type: String,
    default: null,
  },
  // Referencia al pedido (ciclo de servicio)
  pedido: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pedido',
    default: null,
    index: true,
  },
  // Detalle de platos incluidos en el pago adelantado
  platos: [{
    comandaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comanda',
    },
    comandaNumber: Number,
    // _id del subdocumento en comanda.platos[]
    platoLineaId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    plato: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'platos',
    },
    platoId: Number,
    nombre: {
      type: String,
      required: true,
    },
    precio: {
      type: Number,
      required: true,
    },
    cantidad: {
      type: Number,
      required: true,
      default: 1,
    },
    subtotal: {
      type: Number,
      required: true,
    },
    tipoServicio: {
      type: String,
      enum: ['mesa', 'para_llevar'],
      default: 'mesa',
    },
    complementosSeleccionados: [{
      grupo: { type: String },
      opcion: { type: String },
      cantidad: { type: Number, default: 1 },
    }],
    notaEspecial: { type: String, default: '' },
    // Estado del plato al momento del PPA (para referencia)
    estadoAlPagoAdelantado: { type: String, default: 'pedido' },
  }],
  // Totales
  subtotal: {
    type: Number,
    required: true,
    default: 0,
  },
  igv: {
    type: Number,
    required: true,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
    default: 0,
  },
  // Referencia al boucher/voucher generado
  boucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boucher',
    default: null,
  },
  voucherId: {
    type: String,
    default: null,
  },
  // Método de pago
  metodoPago: {
    type: String,
    enum: ['efectivo', 'digital', 'tarjeta'],
    default: 'efectivo',
  },
  // Moneda del cobro (snapshot desde el boucher)
  moneda: { type: String, default: 'PEN' },
  // Snapshot de efectivo (propagado desde el boucher al crear el ticket)
  montoRecibido: { type: Number, default: null },
  vuelto: { type: Number, default: null },
  // Cliente (opcional)
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    default: null,
  },
  clienteNombre: { type: String, default: null },
  clienteDni: { type: String, default: null },
  // Aprobación
  aprobadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    default: null,
  },
  aprobadoPorNombre: {
    type: String,
    default: null,
  },
  fechaAprobacion: {
    type: Date,
    default: null,
  },
  // Rechazo
  rechazadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    default: null,
  },
  motivoRechazo: {
    type: String,
    default: null,
  },
  fechaRechazo: {
    type: Date,
    default: null,
  },
  // Observaciones generales
  observaciones: {
    type: String,
    default: '',
  },
  // Auditoría
  isActive: {
    type: Boolean,
    default: true,
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    default: null,
  },
  sourceApp: {
    type: String,
    enum: ['mozos', 'cocina', 'admin', 'api'],
    default: 'mozos',
  },
}, {
  timestamps: true,
  setDefaultsOnInsert: true,
});

// Índices
ticketPagoAdelantadoSchema.index({ estado: 1, createdAt: -1 });
ticketPagoAdelantadoSchema.index({ mesa: 1, estado: 1 });
ticketPagoAdelantadoSchema.index({ mozo: 1, createdAt: -1 });

ticketPagoAdelantadoSchema.plugin(AutoIncrement, { id: 'ticketPagoAdelantado_counter', inc_field: 'ticketNumber' });

const ticketPagoAdelantadoModel = mongoose.model('TicketPagoAdelantado', ticketPagoAdelantadoSchema, 'ticketsPagoAdelantado');

module.exports = ticketPagoAdelantadoModel;