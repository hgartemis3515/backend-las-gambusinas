/**
 * Turno de caja. El esperado sale de pagos y comprobantes; el cajero declara el arqueo.
 * @module facturacion/models/turnoCaja
 */

const mongoose = require('mongoose');

const { Schema } = mongoose;

const loteSchema = new Schema({
    numeroLote: { type: String, default: '' },
    montoVoucher: { type: Number, default: 0, min: 0 },
}, { _id: false });

const turnoCajaSchema = new Schema({
    cajero: { type: String, required: true },
    cajeroId: { type: Schema.Types.ObjectId, ref: 'mozos', default: null },
    terminal: { type: String, required: true, default: 'CAJA1' },
    fondoInicial: { type: Number, required: true, min: 0 },
    fechaApertura: { type: Date, required: true, default: Date.now },
    fechaCierre: { type: Date, default: null },
    estado: { type: String, enum: ['ABIERTO', 'CERRADO'], default: 'ABIERTO', index: true },
    totalEfectivoEsperado: { type: Number, default: 0 },
    totalNiubizEsperado: { type: Number, default: 0 },
    totalIzipayEsperado: { type: Number, default: 0 },
    totalCulqiEsperado: { type: Number, default: 0 },
    totalPropinas: { type: Number, default: 0 },
    conteo: {
        boletas: { type: Number, default: 0 },
        facturas: { type: Number, default: 0 },
        notasCredito: { type: Number, default: 0 },
        pendientesEnvio: { type: Number, default: 0 },
        rechazados: { type: Number, default: 0 },
    },
    efectivoReal: { type: Number, default: null },
    loteNiubiz: { type: loteSchema, default: () => ({}) },
    loteIzipay: { type: loteSchema, default: () => ({}) },
    diferencias: {
        efectivo: { type: Number, default: 0 },
        niubiz: { type: Number, default: 0 },
        izipay: { type: Number, default: 0 },
    },
    justificacionDiferencia: { type: String, default: '' },
    autorizadoPor: { type: String, default: null },
}, { timestamps: true, collection: 'turnos_caja' });

turnoCajaSchema.index({ terminal: 1, estado: 1 });

module.exports = mongoose.models.TurnoCaja || mongoose.model('TurnoCaja', turnoCajaSchema);
