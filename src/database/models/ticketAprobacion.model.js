const mongoose = require('mongoose');
const moment = require('moment-timezone');
const AutoIncrement = require('mongoose-sequence')(mongoose);

/**
 * Modelo TicketAprobacion
 *
 * Representa un ticket de aprobación de cocina para una COMANDA COMPLETA
 * (no pagos adelantados — esos viven en TicketPagoAdelantado).
 *
 * Flujo:
 *   Mozo confirma pago normal → se crea este ticket + mesa pasa a pendiente_aprobar
 *   Cocina APRUEBA            → mesa pasa a pagado, platos pasan a pedido (entran al KDS)
 *   Cocina REPORTA            → mesa pasa a reportado (rojo), motivo obligatorio,
 *                                boucher intacto, NO se eliminan platos.
 *
 * Decisión de diseño (PLAN_PLANTILLA_COMANDAS §5.3):
 *   Modelo SEPARADO de TicketPagoAdelantado para no tocar el flujo PPA existente.
 *   La bandeja unificada en cocina (Fase D) consulta ambos modelos y los marca
 *   con `tipo: COMANDA | ADELANTADO`.
 */
const ticketAprobacionSchema = new mongoose.Schema({
  ticketNumber: {
    type: Number,
  },
  tipo: {
    type: String,
    enum: ['comanda_completa'],
    default: 'comanda_completa',
  },
  estado: {
    type: String,
    enum: ['pendiente_aprobacion', 'aprobado', 'reportado'],
    default: 'pendiente_aprobacion',
    index: true,
  },
  // Referencias a comandas incluidas en el ticket
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
  // Snapshot de platos al momento de generar el ticket (para preview/imprimir sin tocar la comanda)
  platos: [{
    comandaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comanda' },
    comandaNumber: Number,
    platoLineaId: { type: mongoose.Schema.Types.ObjectId },
    plato: { type: mongoose.Schema.Types.ObjectId, ref: 'platos' },
    platoId: Number,
    nombre: { type: String, required: true },
    precio: { type: Number, required: true },
    cantidad: { type: Number, required: true, default: 1 },
    subtotal: { type: Number, required: true },
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
  }],
  // Totales
  subtotal: { type: Number, required: true, default: 0 },
  igv: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true, default: 0 },
  // Referencia al boucher contable asociado (no se anula al reportar)
  boucher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boucher',
    default: null,
  },
  voucherId: { type: String, default: null },
  // Datos de pago (fuente: boucher)
  moneda: { type: String, default: 'PEN' },
  metodoPago: {
    type: String,
    enum: ['efectivo', 'digital', 'tarjeta'],
    default: 'efectivo',
  },
  // Cliente
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
  aprobadoPorNombre: { type: String, default: null },
  fechaAprobacion: { type: Date, default: null },
  // Reporte (NO elimina boucher)
  reportadoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'mozos',
    default: null,
  },
  reportadoPorNombre: { type: String, default: null },
  fechaReporte: { type: Date, default: null },
  motivoReporte: { type: String, default: null },
  // Observaciones generales
  observaciones: { type: String, default: '' },
  // Auditoría
  isActive: { type: Boolean, default: true },
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
ticketAprobacionSchema.index({ estado: 1, createdAt: -1 });
ticketAprobacionSchema.index({ mesa: 1, estado: 1 });
ticketAprobacionSchema.index({ mozo: 1, createdAt: -1 });

ticketAprobacionSchema.plugin(AutoIncrement, { id: 'ticketAprobacion_counter', inc_field: 'ticketNumber' });

const ticketAprobacionModel = mongoose.model('TicketAprobacion', ticketAprobacionSchema, 'ticketsAprobacion');

module.exports = ticketAprobacionModel;
